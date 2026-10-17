const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {inspect,exportArgs}=require('../app/export');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path;
const dir=path.resolve('test-output');fs.mkdirSync(dir,{recursive:true});
function run(args){return execFileSync(ffmpeg,['-hide_banner','-loglevel','error',...args],{windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});}
function probe(p){return JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',p],{windowsHide:true}));}
test('rotation and HDR metadata are detected',()=>{
 const info=inspect({streams:[{codec_type:'video',width:3840,height:2160,side_data_list:[{rotation:90}],color_transfer:'smpte2084',avg_frame_rate:'60000/1001',duration:'6'}]});
 assert.equal(info.width,2160);assert.equal(info.height,3840);assert.equal(info.hdr,true);
 const args=exportArgs('a',null,'b',info,{start:0,end:1});assert.ok(args.includes('libx265'));assert.ok(args.includes('smpte2084'));assert.equal(info.color.transfer,'smpte2084');
});
test('reject invalid trims and keep source frame rate unforced',()=>{
 const meta={duration:10,width:1920,height:1080,fps:'60/1'};for(const opts of [{start:-1,end:2},{start:4,end:2},{start:0,end:11},{start:NaN,end:2}])assert.throws(()=>exportArgs('a',null,'b',meta,opts));
 assert.ok(!exportArgs('a',null,'b',meta,{start:1,end:2}).includes('-r'));
});
test('4K 60fps trim exports title, audio, fade and exact duration',()=>{
 const input=path.join(dir,'input-4k.mp4'),title=path.join(dir,'test-overlay.png'),output=path.join(dir,'export-4k.mp4');
 run(['-y','-f','lavfi','-i','color=c=0x183944:s=3840x2160:r=60:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p','-c:a','aac','-shortest',input]);
 run(['-y','-f','lavfi','-i','color=c=black@0:s=3840x2160,format=rgba,drawbox=x=300:y=1700:w=700:h=250:color=yellow:t=fill:replace=1','-frames:v','1',title]);
 const metadata=inspect(probe(input));
 execFileSync(ffmpeg,exportArgs(input,title,output,metadata,{start:.25,end:1.75,titleDuration:.8,quality:'high'}),{windowsHide:true,timeout:180000,stdio:'pipe'});
 const result=probe(output),v=result.streams.find(s=>s.codec_type==='video');
 assert.equal(v.width,3840);assert.equal(v.height,2160);assert.equal(v.avg_frame_rate,'60/1');
 assert.ok(result.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(result.format.duration)-1.5)<.06);
 function pixel(t){return run(['-ss',String(t),'-i',output,'-frames:v','1','-vf','crop=2:2:400:1800,format=rgb24','-f','rawvideo','pipe:1']);}
 const on=pixel(.4),off=pixel(1.2);assert.ok(on[0]>180&&on[1]>180&&on[2]<80,`title missing: ${on}`);assert.ok(off[0]<80&&off[1]<120,`title did not end: ${off}`);
});
test('silent portrait export works without an overlay',()=>{
 const input=path.join(dir,'portrait.mp4'),output=path.join(dir,'portrait-out.mp4');
 run(['-y','-f','lavfi','-i','color=c=navy:s=360x640:r=30:d=1','-c:v','libx264',input]);
 execFileSync(ffmpeg,exportArgs(input,null,output,inspect(probe(input)),{start:0,end:.5}),{windowsHide:true,timeout:30000,stdio:'pipe'});
 const info=inspect(probe(output));assert.equal(info.width,360);assert.equal(info.height,640);assert.equal(info.audio,false);
});
test('deleting a middle section removes its picture; transition fades picture and audio at the join',()=>{
 const input=path.join(dir,'three-colors.mp4');
 run(['-y','-f','lavfi','-i','color=red:s=320x180:r=30:d=2','-f','lavfi','-i','color=green:s=320x180:r=30:d=2','-f','lavfi','-i','color=blue:s=320x180:r=30:d=2','-f','lavfi','-i','sine=frequency=600:duration=6','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]','-map','[v]','-map','3:a','-c:v','libx264','-c:a','aac',input]);
 const meta=inspect(probe(input));
 for(const transition of ['none','fade']) {
  const out=path.join(dir,'cut-'+transition+'.mp4');
  execFileSync(ffmpeg,exportArgs(input,null,out,meta,{clips:[{start:0,end:2,transition},{start:4,end:6,transition:'none'}]}),{windowsHide:true,timeout:30000,stdio:'pipe'});
  const result=probe(out);assert.ok(Math.abs(Number(result.format.duration)-4)<.07);
  const pixel=t=>run(['-ss',String(t),'-i',out,'-frames:v','1','-vf','crop=2:2:100:100,format=rgb24','-f','rawvideo','pipe:1']);
  const a=pixel(1),b=pixel(3);assert.ok(a[0]>180&&a[1]<50);assert.ok(b[2]>180&&b[1]<50);
  if(transition==='fade') {
   const edge=pixel(2);assert.ok(Math.max(edge[0],edge[1],edge[2])<40,'transition must dip to black');
   const audio=run(['-ss','1.99','-i',out,'-t','0.02','-vn','-ac','1','-f','f32le','pipe:1']);
   let peak=0;for(let i=0;i<audio.length;i+=4)peak=Math.max(peak,Math.abs(audio.readFloatLE(i)));assert.ok(peak<.02,'audio should fade at join');
  }
 }
});
test('multiple 4K60 clips with transition and title export at the source dimensions and rate',()=>{
 const input=path.join(dir,'input-4k.mp4'),output=path.join(dir,'multicut-4k.mp4');
 const meta=inspect(probe(input));
 execFileSync(ffmpeg,exportArgs(input,path.join(dir,'test-overlay.png'),output,meta,{clips:[{start:0,end:.6,transition:'fade'},{start:1,end:1.8,transition:'none'}],titleDuration:1}),{windowsHide:true,timeout:180000,stdio:'pipe'});
 const result=probe(output),v=result.streams.find(s=>s.codec_type==='video');assert.equal(v.width,3840);assert.equal(v.height,2160);assert.equal(v.avg_frame_rate,'60/1');assert.ok(Math.abs(Number(result.format.duration)-1.4)<.07);assert.ok(result.streams.some(s=>s.codec_type==='audio'));
});
test('a delayed title appears only inside its requested output interval',()=>{
 const input=path.join(dir,'three-colors.mp4'),title=path.join(dir,'delayed-title.png'),output=path.join(dir,'delayed-title.mp4');
 run(['-y','-f','lavfi','-i','color=black@0:s=320x180,format=rgba,drawbox=x=40:y=50:w=100:h=60:color=yellow:t=fill:replace=1','-frames:v','1',title]);
 execFileSync(ffmpeg,exportArgs(input,title,output,inspect(probe(input)),{clips:[{start:0,end:2,transition:'none'},{start:4,end:6,transition:'none'}],titleStart:1.5,titleDuration:1.5}),{windowsHide:true,timeout:30000,stdio:'pipe'});
 const pixel=t=>run(['-ss',String(t),'-i',output,'-frames:v','1','-vf','crop=2:2:60:70,format=rgb24','-f','rawvideo','pipe:1']);
 const before=pixel(.8),on=pixel(2.2),after=pixel(3.5);
 assert.ok(before[0]>180&&before[1]<60,'title must not appear before start');assert.ok(on[0]>180&&on[1]>180&&on[2]<60,'delayed title must be visible across a cut');assert.ok(after[0]<60&&after[2]>180,'title must end at requested time');
});
test('independent overlays can overlap and stop at their own end times',()=>{
 const input=path.join(dir,'three-colors.mp4'),a=path.join(dir,'multi-text-a.png'),b=path.join(dir,'multi-text-b.png'),output=path.join(dir,'multi-text-out.mp4');
 run(['-y','-f','lavfi','-i','color=black@0:s=320x180,format=rgba,drawbox=x=20:y=20:w=60:h=40:color=yellow:t=fill:replace=1','-frames:v','1',a]);
 run(['-y','-f','lavfi','-i','color=black@0:s=320x180,format=rgba,drawbox=x=220:y=120:w=60:h=40:color=white:t=fill:replace=1','-frames:v','1',b]);
 execFileSync(ffmpeg,exportArgs(input,[{path:a,start:.5,duration:2},{path:b,start:1.5,duration:2}],output,inspect(probe(input)),{clips:[{start:0,end:4,transition:'none'}]}),{windowsHide:true,timeout:30000,stdio:'pipe'});
 const pixel=(t,x,y)=>run(['-ss',String(t),'-i',output,'-frames:v','1','-vf',`crop=2:2:${x}:${y},format=rgb24`,'-f','rawvideo','pipe:1']);
 assert.ok(pixel(1,30,30)[1]>180);assert.ok(pixel(1,240,140)[1]<80);
 assert.ok(pixel(2,30,30)[0]>180);assert.ok(pixel(2,240,140)[2]>180);
 assert.ok(pixel(3,30,30)[0]<80);assert.ok(pixel(3,240,140)[2]>180);assert.ok(pixel(3.8,240,140)[2]<80);
});

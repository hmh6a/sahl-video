const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {encodingArgs,detectEncoders}=require('../app/encoding');
const {exportArgs,inspect}=require('../app/export');
const Project=require('../app/project'),vm=require('node:vm');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path;
test('CPU and GPU quality modes map to distinct real encoders',()=>{
 assert.ok(encodingArgs('cpu').includes('libx264'));
 assert.ok(encodingArgs('h264_nvenc').includes('h264_nvenc'));
 assert.ok(encodingArgs('h264_amf').includes('h264_amf'));
 assert.ok(encodingArgs('h264_qsv').includes('h264_qsv'));
 assert.ok(encodingArgs('h264_videotoolbox').includes('h264_videotoolbox'));
 assert.throws(()=>encodingArgs('gpu-auto'));
 assert.equal(encodingArgs('h264_nvenc','maximum')[encodingArgs('h264_nvenc','maximum').indexOf('-cq')+1],'15');
});
test('HDR uses Main 10 encoders and never accepts an 8-bit H.264 encoder',()=>{
 for(const encoder of ['cpu','hevc_videotoolbox','hevc_nvenc','hevc_amf','hevc_qsv']){
  const args=encodingArgs(encoder,'maximum',{width:3840,height:2160,fps:'60',hdr:true});
  assert.ok(args.includes('main10'));assert.ok(args.includes('hvc1'));assert.ok(args.includes(encoder==='cpu'?'yuv420p10le':'p010le'));
 }
 assert.throws(()=>encodingArgs('h264_nvenc','high',{hdr:true}),/10-bit/);
});
test('HEVC capability requires a separate successful 10-bit hardware encode',async()=>{
 for(const hdr of [false,true]){
  const calls=[],module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.resolve('app/encoding.js'),'utf8'),{module,require:name=>name==='node:child_process'?{execFile(file,args,options,callback){
   calls.push(args);const encoder=args[args.indexOf('-c:v')+1];callback(encoder==='h264_videotoolbox'||hdr&&encoder==='hevc_videotoolbox'?null:Error('unavailable'),'','');
  }}:require(name)});
  const list=await module.exports.detectEncoders('ffmpeg');assert.equal(list[0].hdrEncoder,hdr?'hevc_videotoolbox':undefined);
  const probe=calls.find(a=>a.includes('hevc_videotoolbox'));assert.ok(probe.includes('main10'));assert.ok(probe.includes('p010le'));assert.ok(probe.includes('smpte2084'));
 }
});
test('VideoToolbox requires hardware and scales bitrate with output dimensions, rational frame rate and quality',()=>{
 const meta={width:3840,height:2160,fps:'60000/1001',duration:2,audio:false};
 const args=opts=>exportArgs('input.mp4',null,'output.mp4',meta,{start:0,end:1,encoder:'h264_videotoolbox',...opts});
 const value=(a,key)=>a[a.indexOf(key)+1],high=args({}),maximum=args({quality:'maximum'}),small=args({resolution:'720'});
 assert.equal(value(high,'-allow_sw'),'0');
 assert.equal(Number(value(high,'-b:v')),Math.round(3840*2160*(60000/1001)*.12));
 assert.ok(Number(value(maximum,'-b:v'))>Number(value(high,'-b:v')));
 assert.ok(Number(value(high,'-b:v'))>Number(value(small,'-b:v')));
 assert.ok(!high.includes('-crf')&&!high.includes('-q:v'),'use bitrate mode for Intel Mac compatibility');
 assert.equal(Project.state({encoder:'h264_videotoolbox'},{}).encoder,'h264_videotoolbox');
});
test('VideoToolbox is offered only after successful hardware encoding, including on hosts without other encoders',async()=>{
 for(const available of [true,false]){
  const calls=[],module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.resolve('app/encoding.js'),'utf8'),{module,require:name=>name==='node:child_process'?{execFile(file,args,options,callback){
   calls.push(args);const encoder=args[args.indexOf('-c:v')+1];
   callback(available&&encoder==='h264_videotoolbox'?null:Error('encoder unavailable'),'', '');
  }}:require(name)});
  const result=await module.exports.detectEncoders('ffmpeg');
  assert.deepEqual(Array.from(result,e=>e.id),available?['h264_videotoolbox']:[]);
  const probe=calls.find(args=>args.includes('h264_videotoolbox'));
  assert.ok(probe);assert.equal(probe[probe.indexOf('-allow_sw')+1],'0');
 }
});
test('available GPU really exports a 4K60 montage with sound and transition',async t=>{
 const devices=await detectEncoders(ffmpeg);console.log('Verified hardware encoders:',devices.map(d=>d.name).join(', ')||'none');
 if(!devices.length){t.skip('No hardware encoder on this host');return;}
 const dir=path.resolve('test-output');fs.mkdirSync(dir,{recursive:true});const input=path.join(dir,'gpu-source.mp4'),output=path.join(dir,'gpu-montage.mp4');
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x185477:s=3840x2160:r=60:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p','-c:a','aac','-shortest',input],{windowsHide:true,stdio:'pipe',timeout:90000});
 const probe=p=>JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',p],{windowsHide:true}));
 const meta=inspect(probe(input));
 const title=path.join(dir,'gpu-title.png');
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=black@0:s=3840x2160,format=rgba,drawbox=x=200:y=200:w=600:h=180:color=yellow:t=fill:replace=1','-frames:v','1',title],{windowsHide:true,stdio:'pipe'});
 execFileSync(ffmpeg,exportArgs(input,[{path:title,start:.1,duration:.6},{path:title,start:.9,duration:.5}],output,meta,{encoder:devices[0].id,clips:[{start:0,end:.7,transition:'fade'},{start:1,end:1.8,transition:'none'}]}),{windowsHide:true,stdio:'pipe',timeout:90000});
 const result=probe(output),v=result.streams.find(s=>s.codec_type==='video');assert.equal(v.width,3840);assert.equal(v.height,2160);assert.equal(v.avg_frame_rate,'60/1');assert.ok(result.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(result.format.duration)-1.5)<.07);
 assert.equal(v.codec_name,'h264');
 // Decode the entire hardware output to catch corrupt frames, then verify the composited title.
 execFileSync(ffmpeg,['-v','error','-xerror','-i',output,'-f','null','-'],{timeout:30000,stdio:'pipe'});
 const pixel=execFileSync(ffmpeg,['-v','error','-ss','0.4','-i',output,'-frames:v','1','-vf','crop=2:2:400:280,format=rgb24','-f','rawvideo','pipe:1'],{timeout:30000});
 assert.ok(pixel[0]>180&&pixel[1]>180&&pixel[2]<80,'title is visible in hardware output');
 if(devices[0].id==='h264_videotoolbox'){
  const maximum=path.join(dir,'gpu-maximum.mp4');
  execFileSync(ffmpeg,exportArgs(input,null,maximum,meta,{encoder:devices[0].id,quality:'maximum',resolution:'720',start:0,end:.5}),{stdio:'pipe',timeout:30000});
  const maxVideo=probe(maximum).streams.find(s=>s.codec_type==='video');assert.equal(maxVideo.width,1280);assert.equal(maxVideo.height,720);assert.equal(maxVideo.avg_frame_rate,'60/1');
 }
});

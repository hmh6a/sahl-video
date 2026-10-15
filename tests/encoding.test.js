const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {encodingArgs,detectEncoders}=require('../app/encoding');
const {exportArgs,inspect}=require('../app/export');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('ffprobe-static').path;
test('CPU and GPU quality modes map to distinct real encoders',()=>{
 assert.ok(encodingArgs('cpu').includes('libx264'));
 assert.ok(encodingArgs('h264_nvenc').includes('h264_nvenc'));
 assert.ok(encodingArgs('h264_amf').includes('h264_amf'));
 assert.ok(encodingArgs('h264_qsv').includes('h264_qsv'));
 assert.throws(()=>encodingArgs('gpu-auto'));
 assert.equal(encodingArgs('h264_nvenc','maximum')[encodingArgs('h264_nvenc','maximum').indexOf('-cq')+1],'15');
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
});

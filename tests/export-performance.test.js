const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
const {exportArgs,inspect}=require('../app/export'),reference=require('./helpers/export-reference.cjs');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path,dir=path.resolve('test-output');
function run(args){return execFileSync(ffmpeg,['-v','error',...args],{timeout:60000,maxBuffer:16*1024*1024});}
function meta(file){return inspect(JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file])));}
// Hash every uncompressed video frame and audio packet; no lossy encoder hides differences.
function hashes(builder,input,overlays,info,opts){
 const args=builder(input,overlays,'unused.mp4',info,opts),encoder=args.lastIndexOf('-c:v');
 return run([...args.slice(0,encoder),'-c:v','rawvideo','-pix_fmt','yuv420p','-c:a','pcm_s16le','-f','framemd5','-']).toString().split('\n').filter(line=>line&&!line.startsWith('#'));
}
test('cached titles match every reference frame and audio packet across motion, overlaps, cuts and fractional timing',()=>{
 const input=path.join(dir,'three-colors.mp4'),overlay=path.join(dir,'perf-title.png'),info=meta(input);
 run(['-y','-f','lavfi','-i','color=black@0:s=320x180,format=rgba,drawbox=x=30:y=40:w=100:h=40:color=yellow@0.7:t=fill:replace=1','-frames:v','1',overlay]);
 for(const animation of ['none','fade','slide-left','slide-right','slide-up','slide-down']){
  const titles=[{path:overlay,start:.117,duration:.71,animation},{path:overlay,start:.62,duration:.93,animation:'fade'}],opts={clips:[{start:.2,end:1.3,transition:'fade'},{start:4,end:5.1,transition:'none'}]};
  const actual=hashes(exportArgs,input,titles,info,opts),before=hashes(reference.exportArgs,input,titles,info,opts);
  assert.deepEqual(actual,before,animation+' changed decoded output');assert.ok(actual.some(row=>row.startsWith('1,')),'audio included');
 }
});
test('cached stills preserve all pixels, audio, padding and title fades after resizing at rational frame rates',()=>{
 const input=path.join(dir,'three-colors.mp4'),photo=path.join(dir,'perf-still.png'),overlay=path.join(dir,'perf-title-large.png');
 run(['-y','-f','lavfi','-i','testsrc2=s=360x640','-frames:v','1',photo]);
 run(['-y','-f','lavfi','-i','color=black@0:s=1280x720,format=rgba,drawbox=x=70:y=90:w=320:h=80:color=white:t=fill:replace=1','-frames:v','1',overlay]);
 const info=meta(input),assets={a:{path:input,kind:'video',meta:info},b:{path:photo,kind:'image',meta:{width:360,height:640,duration:5}}},titles=[{path:overlay,start:.3,duration:.7,animation:'slide-up'}];
 const opts={clips:[{assetId:'a',start:0,end:.8,transition:'fade'},{assetId:'b',start:0,end:.7,transition:'fade'},{assetId:'a',start:4,end:4.7}],resolution:'480'};
 const output={...info,width:1280,height:720,fps:'30000/1001'};
 assert.deepEqual(hashes(exportArgs,assets,titles,output,opts),hashes(reference.exportArgs,assets,titles,output,opts));
});
test('finite title inputs never shorten a video and encoder quality settings are unchanged',()=>{
 const input=path.join(dir,'three-colors.mp4'),info=meta(input),titles=[{path:path.join(dir,'perf-title.png'),start:0,duration:.2,animation:'none'}];
 const rows=hashes(exportArgs,input,titles,info,{start:0,end:2});assert.equal(rows.filter(row=>row.startsWith('0,')).length,60);
 for(const encoder of ['cpu','h264_videotoolbox','h264_nvenc','h264_amf','h264_qsv'])for(const quality of ['high','maximum']){
  const opts={encoder,quality,start:0,end:2},current=exportArgs(input,titles,'out.mp4',info,opts),old=reference.exportArgs(input,titles,'out.mp4',info,opts);
  assert.deepEqual(current.slice(current.lastIndexOf('-c:v')),old.slice(old.lastIndexOf('-c:v')));
 }
});

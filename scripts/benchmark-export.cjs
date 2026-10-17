// Reproducible local before/after benchmark. Artifacts stay in ignored test-output/.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path,{exportArgs,inspect}=require('../app/export'),reference=require('../tests/helpers/export-reference.cjs'),{detectEncoders}=require('../app/encoding');
const folder=path.resolve('test-output/export-benchmark');fs.mkdirSync(folder,{recursive:true});
function run(args){execFileSync(ffmpeg,['-hide_banner','-loglevel','error',...args],{timeout:180000,stdio:'pipe'});}
(async()=>{
 const encoder=process.argv.includes('--cpu')?'cpu':(await detectEncoders(ffmpeg))[0]?.id||'cpu';
 const input=path.join(folder,'source.mp4'),title=path.join(folder,'title.png');
 if(!fs.existsSync(input))run(['-y','-f','lavfi','-i','testsrc2=s=3840x2160:r=60:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-shortest',input]);
 if(!fs.existsSync(title))run(['-y','-f','lavfi','-i','color=black@0:s=3840x2160,format=rgba,drawbox=x=200:y=1600:w=1400:h=280:color=yellow@0.9:t=fill:replace=1','-frames:v','1',title]);
 const info=inspect(JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',input]))),opts={encoder,quality:'high',clips:[{start:0,end:2,transition:'fade'},{start:2,end:4,transition:'none'}]},overlays=[{path:title,start:.1,duration:1.2,animation:'slide-left'},{path:title,start:1.5,duration:1.5,animation:'fade'}];
 const runs=[];
 // Alternate order to reduce cache/temperature bias, while keeping encodes sequential.
 for(const name of ['before','after','after','before']){
  const output=path.join(folder,name+'.mp4'),start=performance.now();run((name==='before'?reference.exportArgs:exportArgs)(input,overlays,output,info,opts));
  const elapsed=(performance.now()-start)/1000;runs.push({name,seconds:elapsed});console.log(name+': '+elapsed.toFixed(3)+' s');
 }
 const average=name=>runs.filter(r=>r.name===name).reduce((sum,r)=>sum+r.seconds,0)/2,before=average('before'),after=average('after');
 const result={encoder,width:info.width,height:info.height,fps:info.fps,duration:4,titles:2,runs,beforeSeconds:before,afterSeconds:after,speedup:before/after,timeSavedPercent:(1-after/before)*100};
 fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.stderr?.toString()||e);process.exitCode=1;});

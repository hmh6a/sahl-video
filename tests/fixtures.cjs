// Synthetic local fixtures; no user videos or downloaded media are needed.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),ffmpeg=require('ffmpeg-static');
const dir=path.resolve('test-output');fs.mkdirSync(dir,{recursive:true});
function make(name,args){const file=path.join(dir,name);if(!fs.existsSync(file))execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args,file],{windowsHide:true,timeout:60000,stdio:'pipe'});}
make('three-colors.mp4',['-f','lavfi','-i','color=red:s=320x180:r=30:d=2','-f','lavfi','-i','color=green:s=320x180:r=30:d=2','-f','lavfi','-i','color=blue:s=320x180:r=30:d=2','-f','lavfi','-i','sine=frequency=600:duration=6','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]','-map','[v]','-map','3:a','-c:v','libx264','-c:a','aac']);
make('photo.png',['-f','lavfi','-i','color=yellow:s=640x360','-frames:v','1']);
make('portrait.mp4',['-f','lavfi','-i','color=navy:s=360x640:r=30:d=1','-c:v','libx264']);
if(process.argv.includes('--preview'))make('ui-sixty.mp4',['-f','lavfi','-i','testsrc2=s=320x180:r=30:d=60','-c:v','libx264','-preset','ultrafast']);

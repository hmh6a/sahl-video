const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const Project=require('../app/project'),TL=require('../app/timeline'),Titles=require('../app/titles'),Animation=require('../app/animation'),Title=require('../app/title-model'),{exportArgs,inspect}=require('../app/export'),{MediaLibrary}=require('../app/library');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path,dir=path.resolve('test-output');
function run(args){return execFileSync(ffmpeg,['-hide_banner','-loglevel','error',...args],{windowsHide:true,timeout:90000,maxBuffer:16*1024*1024});}
function probe(file){return inspect(JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{windowsHide:true})));}
test('project round trip retains multi-source cuts, text timing/placement/animation, output settings and relative sources',()=>{
 const folder=fs.mkdtempSync(path.join(dir,'project-v15-')),file=path.join(folder,'ترتيبي.sahl'),video=path.join(folder,'source.mp4'),photo=path.join(folder,'صورة.png');fs.writeFileSync(video,'fixture');fs.writeFileSync(photo,'fixture');
 const assets={a:{kind:'video',path:video,meta:{width:3840,height:2160,duration:10,fps:'120/1'}},b:{kind:'image',path:photo,meta:{width:1000,height:1000,duration:5,fps:'30'}}};
 const raw={meta:assets.a.meta,assetIds:['a','b'],clips:[{assetId:'a',start:1,end:3,transition:'fade'},{assetId:'b',start:0,end:2,transition:'fade'},{assetId:'a',start:6,end:9}],titles:Titles.normalize([{title:'العنوان',titleStart:1,titleDuration:2,position:'top-right',animation:'slide-left',template:'neon',font:'Tahoma'},{title:'ثاني',titleStart:4,textX:28,textY:40,position:'custom',animation:'none',template:'banner'}]),cursor:4.2,selectedClip:1,selectionKind:'title',zoom:40,encoder:'h264_nvenc',resolution:'1080',quality:'maximum'};raw.selectedTitle=raw.titles[1].id;
 const saved=Project.writeProject(file,raw,assets),loaded=Project.readProject(file),restored=Project.state(loaded.raw,assets);assert.deepEqual(restored,Project.state(raw,assets));assert.equal(saved.assets[1].relativePath,'صورة.png');assert.equal(loaded.sources[0].resolved,video);
 const macFile=path.join(folder,'mac.sahl');Project.writeProject(macFile,{...raw,encoder:'h264_videotoolbox'},assets);assert.equal(Project.state(Project.readProject(macFile).raw,assets).encoder,'h264_videotoolbox');
 // The project and its media may move together: prefer the relative reference.
 const moved=path.join(folder,'moved');fs.mkdirSync(moved);for(const name of ['ترتيبي.sahl','source.mp4','صورة.png'])fs.copyFileSync(path.join(folder,name),path.join(moved,name));assert.equal(Project.readProject(path.join(moved,'ترتيبي.sahl')).sources[1].resolved,path.join(moved,'صورة.png'));
 const missing=JSON.parse(fs.readFileSync(file));missing.assets[1].path=path.join(folder,'missing.png');missing.assets[1].relativePath='missing.png';const mf=path.join(folder,'missing.sahl');fs.writeFileSync(mf,JSON.stringify(missing));assert.equal(Project.readProject(mf).sources[1].resolved,null);
 assert.throws(()=>Project.state({...raw,clips:[{assetId:'unknown',start:0,end:1}]},assets),/مفقود/);assert.throws(()=>Project.state({...raw,clips:[{assetId:'a',start:0,end:11}]},assets),/صحيحة/);
});
test('inserting a still splits a video at cursor, preserves outgoing cut and adds transitions',()=>{
 const original=[{assetId:'a',kind:'video',start:2,end:10,transition:'none'}],result=TL.insert(original,{assetId:'photo',kind:'image',start:0,end:3},4);
 assert.equal(result.index,1);assert.deepEqual(result.clips.map(c=>[c.assetId,c.start,c.end,c.transition]),[['a',2,6,'fade'],['photo',0,3,'fade'],['a',6,10,'none']]);assert.equal(TL.duration(result.clips),11);assert.equal(TL.locate(result.clips,6).index,1);
});
test('export resolution preserves aspect and all title entrances settle at their stored position',()=>{
 assert.deepEqual(Project.outputSize({width:3840,height:2160,fps:'120'},'source'),{width:3840,height:2160});assert.deepEqual(Project.outputSize({width:3840,height:2160,fps:'120'},'1080'),{width:1920,height:1080});assert.deepEqual(Project.outputSize({width:1080,height:1920,fps:'30'},'720'),{width:720,height:1280});
 const t=Title.timing(10,2,4);for(const kind of Animation.kinds){assert.equal(Animation.sample(kind,1,t,1920,1080).opacity,0);assert.equal(Animation.sample(kind,6,t,1920,1080).opacity,0);const final=Animation.sample(kind,3,t,1920,1080);assert.equal(final.opacity,1);assert.ok(Math.abs(final.x)+Math.abs(final.y)<.001);}
 assert.ok(Animation.sample('slide-left',2.1,t,1920,1080).x<0);assert.ok(Animation.sample('slide-up',2.1,t,1920,1080).y>0);assert.equal(Animation.sample('none',2,t,1920,1080).opacity,1);
});
test('video + image + different silent video export with transitions, audio and selected 720p resolution',async()=>{
 const input=path.join(dir,'three-colors.mp4'),image=path.join(dir,'photo.png'),portrait=path.join(dir,'portrait.mp4'),out=path.join(dir,'mixed-v15.mp4');
 run(['-y','-f','lavfi','-i','color=c=yellow:s=640x360','-frames:v','1',image]);
 const library=new MediaLibrary(ffmpeg,ffprobe),result=await library.import([input,image,portrait]);assert.equal(result.errors.length,0);assert.equal(result.assets.length,3);const [a,b,c]=result.assets;
 const clips=[{assetId:a.id,start:0,end:1,transition:'fade'},{assetId:b.id,start:0,end:1.5,transition:'fade'},{assetId:c.id,start:0,end:.8,transition:'none'}];
 execFileSync(ffmpeg,exportArgs(library.assets,[],out,{...a,width:1280,height:720},{clips,encoder:'cpu',resolution:'720'}),{windowsHide:true,timeout:90000,stdio:'pipe'});const output=probe(out);assert.equal(output.width,1280);assert.equal(output.height,720);assert.equal(output.fps,'30/1');assert.equal(output.audio,true);assert.ok(Math.abs(output.duration-3.3)<.07);
 const pixel=(t,x=600,y=400)=>run(['-ss',String(t),'-i',out,'-frames:v','1','-vf',`crop=2:2:${x}:${y},format=rgb24`,'-f','rawvideo','pipe:1']);
 const red=pixel(.5),yellow=pixel(1.6),navy=pixel(2.95),border=pixel(2.95,10);assert.ok(red[0]>180&&red[1]<50);assert.ok(yellow[0]>180&&yellow[1]>180&&yellow[2]<50);assert.ok(navy[2]>80&&navy[0]<40);assert.ok(Math.max(...border)<20,'portrait padded, not stretched');
 assert.ok(Math.max(...pixel(1))<20,'image entrance transition');assert.ok(Math.max(...pixel(2.5))<30,'video entrance transition');
 const audio=run(['-ss','1.3','-i',out,'-t','0.3','-vn','-ac','1','-f','f32le','pipe:1']);let peak=0;for(let i=0;i+4<=audio.length;i+=4)peak=Math.max(peak,Math.abs(audio.readFloatLE(i)));assert.ok(peak<.001,'image has silent audio while retaining video audio track');
});
test('slide animation moves overlay pixels and direct appearance has no fade',()=>{
 const input=path.join(dir,'three-colors.mp4'),png=path.join(dir,'slide-v15.png');run(['-y','-f','lavfi','-i','color=black@0:s=320x180,format=rgba,drawbox=x=160:y=80:w=10:h=10:color=yellow:t=fill:replace=1','-frames:v','1',png]);
 const meta=probe(input);
 for(const animation of ['slide-left','slide-up','none']){const out=path.join(dir,animation+'-v15.mp4');execFileSync(ffmpeg,exportArgs(input,[{path:png,start:.5,duration:1.5,animation}],out,meta,{start:0,end:2.2}),{windowsHide:true,timeout:30000,stdio:'pipe'});
  const pixels=t=>run(['-ss',String(t),'-i',out,'-frames:v','1','-vf','format=rgb24','-f','rawvideo','pipe:1']);const at=pixels(animation==='none'?.5:.7),final=pixels(1.1);let sumX=0,sumY=0,n=0;for(let y=0;y<180;y++)for(let x=0;x<320;x++){let i=(y*320+x)*3;if(at[i]>140&&at[i+1]>130&&at[i+2]<90){sumX+=x;sumY+=y;n++;}}assert.ok(n>4,animation+' overlay visible');if(animation==='slide-left')assert.ok(sumX/n<160);if(animation==='slide-up')assert.ok(sumY/n>86);if(animation==='none')assert.ok(sumX/n>160);const i=(84*320+164)*3;assert.ok(final[i]>180&&final[i+1]>180,animation+' final position');
 }
});


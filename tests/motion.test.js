const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const TL=require('../app/timeline'),AT=require('../app/audio-tracks'),Project=require('../app/project'),{exportArgs,inspect}=require('../app/export'),{saveBundle}=require('../app/project-bundle'),{RecoveryStore}=require('../app/recovery');
const ff=require('ffmpeg-static'),fp=require('@ffprobe-installer/ffprobe').path,dir=fs.mkdtempSync(path.resolve('test-output/motion-'));
const run=args=>execFileSync(ff,['-v','error',...args],{timeout:30000,maxBuffer:16*1024*1024}),probe=file=>JSON.parse(execFileSync(fp,['-v','error','-show_streams','-show_format','-of','json',file]));
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
test('one project clock maps fractional speeds, overlaps, active sources and independent audio transitions',()=>{
  const clips=[{id:'a',start:1,end:5,speed:2,transition:'crossfade',transitionDuration:.5},{id:'b',start:0,end:1,speed:.5,transition:'fade',transitionDuration:.3},{id:'c',start:2,end:3}];
  assert.deepEqual(TL.starts(clips),[0,1.5,3.5]);near(TL.duration(clips),4.5);const pair=TL.active(clips,1.75);assert.deepEqual(pair.map(p=>p.index),[0,1]);near(pair[0].source,4.5);near(pair[1].source,.125);near(TL.audioGain(clips,0,1.75),.5);near(TL.audioGain(clips,1,1.75),.5);
  clips[0].audioTransition='cut';assert.equal(TL.audioGain(clips,0,1.7),1);assert.equal(TL.audioGain(clips,1,1.7),0);assert.equal(TL.audioGain(clips,0,1.8),0);assert.equal(TL.audioGain(clips,1,1.8),1);
  near(TL.visualGain(clips,1,3.4),1/3);clips[1].audioTransition='cut';near(TL.audioGain(clips,1,3.4),1);assert.equal(TL.split(clips,1.7),null);assert.equal(TL.split([{start:0,end:4,transition:'crossfade',transitionDuration:1},{start:0,end:4}],4.5),null);assert.throws(()=>TL.insert(clips,{start:0,end:1},1.7),/التداخل/);
  for(const speed of [.25,.5,1,1.3,2,4]){const c={start:.5,end:4.5,speed};near(TL.sourceTime(c,TL.length(c)/3),.5+4/3);}
});
test('speed and source trims reconcile linked sound and text while independent music remains fixed',()=>{
  const before=[{id:'v',assetId:'a',start:1,end:5}],track={id:'t',clips:[{id:'sound',assetId:'a',start:2,end:4,at:1,link:{clipId:'v',offset:1}},{id:'music',assetId:'a',start:0,end:1,at:3}]},text=[{id:'txt',titleStart:2,titleDuration:1,link:{clipId:'v',offset:2}}],after=[{...before[0],speed:2}];
  const fast=AT.reconcile(before,after,[track],text);near(TL.length(fast.tracks[0].clips[0]),1);near(fast.tracks[0].clips[0].at,.5);near(fast.tracks[0].clips[1].at,3);near(fast.titles[0].titleStart,1);near(fast.titles[0].titleDuration,.5);
  const split=TL.split(after,1).clips,relinked=AT.reconcile(after,split,fast.tracks,fast.titles);assert.deepEqual(relinked.tracks[0].clips.slice(0,2).map(c=>[c.start,c.end,c.at,c.speed]),[[2,3,.5,2],[3,4,1,2]]);
  const slow=[{...before[0],speed:.25}],small=TL.split(slow,.2).clips;near(small[0].end,1.05);assert.doesNotThrow(()=>TL.validate({duration:5},{clips:small}));
});
test('freeze pieces are silent source references with their own duration and can split without changing their frame',()=>{
  const c={id:'f',start:0,end:6,freeze:{time:2.5,duration:3}},parts=TL.split([c],1).clips;assert.deepEqual(parts.map(p=>p.freeze),[{time:2.5,duration:1},{time:2.5,duration:2}]);near(TL.duration(parts),3);assert.equal(TL.sourceTime(parts[1],1.5),2.5);assert.equal(TL.audioGain([c],0,1),0);const title=AT.reconcile([c],parts,[],[{id:'t',titleStart:2,titleDuration:.5,link:{clipId:'f',offset:2}}]).titles[0];assert.equal(title.link.clipId,parts[1].id);near(title.titleStart,2);near(title.link.offset,1);
  for(const patch of [{speed:0},{speed:5},{preservePitch:'yes'},{freeze:{time:6,duration:1}},{transitionDuration:NaN},{transitionDuration:11},{audioTransition:'bad'}])assert.throws(()=>TL.validate({duration:6},{clips:[{start:0,end:6,...patch}]}));
  near(TL.overlap([{start:0,end:1,speed:4,transition:'crossfade',transitionDuration:10},{start:0,end:4}],0),.125);
});
let assets,meta;
function fixtures(){if(assets)return;assets={};for(const [id,color,hz]of [['r','red',600],['b','blue',1200]]){const file=path.join(dir,id+'.mkv');run(['-y','-f','lavfi','-i',`color=${color}:s=160x90:r=30:d=2`,'-f','lavfi','-i',`sine=frequency=${hz}:duration=2`,'-c:v','ffv1','-c:a','pcm_s16le','-shortest',file]);assets[id]={path:file,kind:'video',meta:inspect(probe(file))};}meta={width:160,height:90,fps:'30'};}
function render(name,clips,extra={}){fixtures();const out=path.join(dir,name+'.mp4');run(exportArgs(assets,[],out,meta,{clips,encoder:'cpu',...extra}));return out;}
function audio(file,start,duration=.2){const data=run(['-ss',String(start),'-i',file,'-t',String(duration),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']);return Array.from({length:data.length/4},(_,i)=>data.readFloatLE(i*4));}
function frequency(samples){let crossings=0;for(let i=1;i<samples.length;i++)if(samples[i-1]<=0&&samples[i]>0)crossings++;return crossings/(samples.length/48000);}
function rgb(file,t){return [...run(['-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']).subarray(0,3)];}
test('real exports preserve or shift pitch at 0.25x–4x and maintain picture and audio duration within a frame',()=>{
  for(const speed of [.25,.5,1.3,2,4])for(const preservePitch of [true,false]){const out=render('speed-'+speed+'-'+preservePitch,[{assetId:'r',start:0,end:2,speed,preservePitch}]),p=probe(out),expected=2/speed;
    near(Number(p.format.duration),expected,1/30+.025);const v=p.streams.find(s=>s.codec_type==='video');near(Number(v.duration),expected,1/30+.001);near(frequency(audio(out,expected*.3,Math.min(.3,expected*.4))),600*(preservePitch?1:speed),15);
  }
});
test('real freeze exports repeat one frame, insert silence and resume the source after the hold',()=>{
  const file=path.resolve('test-output/three-colors.mp4');fixtures();assets.v={path:file,kind:'video',meta:inspect(probe(file))};
  const out=render('freeze',[{id:'left',assetId:'v',start:0,end:2},{id:'hold',assetId:'v',start:0,end:6,freeze:{time:2.5,duration:1}},{id:'right',assetId:'v',start:2,end:3}]);near(Number(probe(out).format.duration),4,.04);assert.ok(rgb(out,1)[0]>200);for(const t of [2.1,2.8]){const color=rgb(out,t);assert.ok(color[1]>100&&color[0]<15&&color[2]<15);assert.ok(audio(out,t,.08).every(x=>Math.abs(x)<1e-5));}assert.ok(audio(out,3.3).some(x=>Math.abs(x)>.03));
});
test('real dissolve blends pixels at the shared clock, clamps overlap, and audio cuts independently of picture',()=>{
  for(const audioTransition of ['fade','cut']){const clips=[{id:'a',assetId:'r',start:0,end:2,transition:'crossfade',transitionDuration:1,audioTransition},{id:'b',assetId:'b',start:0,end:2}],out=render('dissolve-'+audioTransition,clips);near(Number(probe(out).format.duration),3,.04);
    const color=rgb(out,1.5);near(color[0],127,15);near(color[2],127,15);assert.ok(color[1]<15);
    if(audioTransition==='cut'){near(frequency(audio(out,1.2,.1)),600,15);near(frequency(audio(out,1.7,.1)),1200,15);}else{const s=audio(out,1.4,.1),energy=hz=>Math.abs(s.reduce((n,v,i)=>n+v*Math.cos(2*Math.PI*hz*i/48000),0))+Math.abs(s.reduce((n,v,i)=>n+v*Math.sin(2*Math.PI*hz*i/48000),0));assert.ok(energy(600)>10&&energy(1200)>10);}
  }
});
test('v4 portable save, prior-version backup and crash recovery retain motion, overlap and source-based freezes',async()=>{
  fixtures();const raw={meta,clips:[{id:'r',assetId:'r',start:0,end:2,speed:2,preservePitch:false,transition:'crossfade',transitionDuration:.3,audioTransition:'cut'},{id:'f',assetId:'b',start:0,end:2,freeze:{time:.5,duration:1}}],audioTracks:[{id:'a',clips:[{id:'s',assetId:'r',start:0,end:2,at:0,speed:2,preservePitch:false,link:{clipId:'r',offset:0}}]}],titles:[]};
  const saved=await saveBundle(path.join(dir,'motion.sahl'),raw,assets),read=Project.readProject(saved.file);assert.equal(read.raw.version,Project.VERSION);assert.deepEqual(Project.state(read.raw,assets),Project.state(raw,assets));fs.writeFileSync(saved.file,JSON.stringify({...read.raw,version:3}));const bytes=fs.readFileSync(saved.file);await saveBundle(saved.file,raw,saved.assets,{existing:true});assert.deepEqual(fs.readFileSync(saved.file+'.v3-backup'),bytes);
  const writer=new RecoveryStore(dir,{id:'motion',isAlive:()=>false});writer.save(raw,assets);const reader=new RecoveryStore(dir,{id:'again',isAlive:()=>false});assert.deepEqual(Project.state(reader.read('motion').raw,assets),Project.state(raw,assets));
});
test('HDR dissolve and freeze keep ten-bit pixels and transfer metadata at a fractional frame rate',()=>{
  fixtures();const file=path.join(dir,'hdr.mkv');run(['-y','-f','lavfi','-i','color=s=160x90:r=30000/1001:d=1,format=yuv420p10le','-c:v','ffv1','-color_trc','smpte2084','-color_primaries','bt2020','-colorspace','bt2020nc',file]);assets.h={path:file,kind:'video',meta:inspect(probe(file))};const out=path.join(dir,'hdr.mp4'),clips=[{id:'h',assetId:'h',start:0,end:.8,speed:2,transition:'crossfade',transitionDuration:.1},{id:'freeze',assetId:'h',start:0,end:.8,freeze:{time:.2,duration:.5}}];run(exportArgs(assets,[],out,{...meta,fps:'30000/1001'},{clips,encoder:'cpu'}));const v=probe(out).streams.find(s=>s.codec_type==='video');assert.equal(v.pix_fmt,'yuv420p10le');assert.equal(v.color_transfer,'smpte2084');near(Number(v.duration),TL.duration(clips),1001/30000+.001);
});

test('a moving-source freeze holds the selected frame throughout the exported duration',()=>{
  fixtures();const file=path.join(dir,'moving.mkv');run(['-y','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=2','-c:v','ffv1',file]);assets.m={path:file,kind:'video',meta:inspect(probe(file))};const out=render('moving-freeze',[{assetId:'m',start:0,end:2,freeze:{time:.7,duration:.7}}]);assert.ok(!probe(out).streams.some(s=>s.codec_type==='audio'));
  const frame=(file,time)=>run(['-ss',String(time),'-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']),reference=frame(file,.7);for(const t of [.05,.35,.6]){const actual=frame(out,t);assert.equal(actual.length,reference.length);let error=0;for(let i=0;i<actual.length;i++)error+=Math.abs(actual[i]-reference[i]);assert.ok(error/actual.length<4,'freeze source-frame error '+error/actual.length);}
});

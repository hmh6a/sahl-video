const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const AT=require('../app/audio-tracks'),TL=require('../app/timeline'),Project=require('../app/project'),{saveBundle}=require('../app/project-bundle'),{RecoveryStore}=require('../app/recovery'),{MediaLibrary}=require('../app/library'),{WaveformService}=require('../app/waveforms'),{exportArgs}=require('../app/export');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path,dir=fs.mkdtempSync(path.resolve('test-output/audio-tracks-'));
const run=args=>execFileSync(ffmpeg,['-v','error',...args],{timeout:30000,maxBuffer:8*1024*1024});
const main=[{id:'v1',assetId:'v',start:1,end:5},{id:'v2',assetId:'v',start:5,end:7}],linked={id:'linked',assetId:'v',start:1,end:5,at:0,audio:{fadeIn:.2,fadeOut:.3},link:{clipId:'v1',offset:0}},music={id:'music',assetId:'m',start:0,end:2,at:1,audio:{}},tracks=[{id:'track',clips:[linked,music]}];
test('linked audio follows split, trim, reorder and deletion while absolute music stays fixed',()=>{
  const split=TL.split(main,2).clips,result=AT.reconcile(main,split,tracks,[{id:'title',titleStart:3,titleDuration:.5,link:{clipId:'v1',offset:3}}]);
  assert.deepEqual(result.tracks[0].clips.map(c=>[c.start,c.end,c.at]),[[1,3,0],[3,5,2],[0,2,1]]);
  assert.equal(result.tracks[0].clips[0].id,'linked');assert.notEqual(result.tracks[0].clips[1].id,'linked');assert.equal(result.tracks[0].clips[0].audio.fadeOut,0);assert.equal(result.tracks[0].clips[1].audio.fadeIn,0);
  assert.equal(result.titles[0].link.clipId,split[1].id);assert.equal(result.titles[0].titleStart,3);
  const trimmed=AT.reconcile(main,[{...main[0],start:2,end:4},main[1]],tracks,[]).tracks[0].clips;
  assert.deepEqual(trimmed.map(c=>[c.start,c.end,c.at]),[[2,4,0],[0,2,1]]);
  assert.equal(AT.reconcile(main,[main[1],main[0]],tracks,[]).tracks[0].clips[0].at,2);
  assert.deepEqual(AT.reconcile(main,[main[1]],tracks,[]).tracks[0].clips.map(c=>c.id),['music']);
});
test('audio schema rejects broken links, invalid trims and duplicate IDs; solo, snapping and ripple use shared time',()=>{
  const registry={v:{kind:'video',meta:{audio:true,duration:7}},m:{kind:'audio',meta:{audio:true,duration:2}}};
  const clean=AT.validate(tracks,registry,main);assert.equal(clean[0].clips[0].at,0);
  for(const patch of [{start:-1},{end:8},{at:NaN},{audio:{volume:3}},{link:{clipId:'missing',offset:0}},{assetId:'missing'}])assert.throws(()=>AT.validate([{id:'t',clips:[{...linked,...patch}]}],registry,main));
  assert.throws(()=>AT.validate([{id:'same',clips:[{...linked,id:'same'}]}],registry,main));
  assert.throws(()=>TL.validate({}, {clips:[{assetId:'m',start:0,end:1}]},registry));
  assert.equal(AT.audible({}, {},[{solo:true}]),false);assert.equal(AT.audible({solo:true,muted:true},{},[{solo:true}]),false);assert.equal(AT.audible({solo:true},{},[{solo:true}]),true);
  assert.equal(AT.snap(1.98,[2],.05,30),2);assert.equal(AT.rippleTime(8,[[1,3],[5,6]]),5);assert.equal(AT.rippleTime(2,[[1,3]]),1);
});
let library,registry;
async function fixtures(){if(registry)return;const video=path.join(dir,'video.mp4'),audio=path.join(dir,'music.wav');run(['-y','-f','lavfi','-i','color=red:s=160x90:r=30:d=3','-f','lavfi','-i','sine=frequency=300:duration=3','-c:v','libx264','-c:a','aac','-shortest',video]);run(['-y','-f','lavfi','-i','sine=frequency=900:duration=2','-c:a','pcm_s16le',audio]);library=new MediaLibrary(ffmpeg,ffprobe,{waveformDirectory:path.join(dir,'cache')});registry={v:await library.inspect(video,'v'),m:await library.inspect(audio,'m')};library.assets=registry;}
test('audio-only media and bounded waveforms are imported, cached, deduplicated, invalidated and canceled',async()=>{
  await fixtures();assert.equal(registry.m.kind,'audio');assert.equal(await library.frame('m',0,176),null);
  const [one,two]=await Promise.all([library.waveforms.get(registry.m),library.waveforms.get(registry.m)]);assert.deepEqual(one,two);assert.ok(one.peaks.length>100&&one.peaks.length<=4096);assert.ok(Math.max(...one.peaks)>.08);
  const cached=new WaveformService('/invalid/ffmpeg',path.join(dir,'cache'));assert.deepEqual(await cached.get(registry.m),one);
  const now=new Date(Date.now()+10000);fs.utimesSync(registry.m.path,now,now);await assert.rejects(cached.get(registry.m));
  const pending=new WaveformService(ffmpeg);pending.setPaused(true);const promise=pending.get(registry.m);await new Promise(resolve=>setTimeout(resolve,20));pending.cancel();await assert.rejects(promise);
  for(const extension of ['mp3','m4a','flac','ogg','opus']){const file=path.join(dir,'music.'+extension);run(['-y','-i',registry.m.path,file]);assert.equal((await library.inspect(file)).kind,'audio');}
});
test('portable v3 projects and crash recovery retain audio files, links, locks, markers and v2 backup',async()=>{
  await fixtures();const raw={meta:{width:160,height:90,fps:'30'},clips:[{id:'v1',assetId:'v',start:0,end:3}],titles:[],audioTracks:[{id:'a',name:'Music',solo:true,locked:true,clips:[{id:'m1',assetId:'m',start:.2,end:1.8,at:.5,audio:{volume:.7,fadeIn:.2}}]}],mainTrack:{muted:true},markers:[{id:'mark',name:'ملاحظة',time:1}],snapEnabled:false,titlesLocked:true};
  const saved=await saveBundle(path.join(dir,'portable.sahl'),raw,registry),read=Project.readProject(saved.file);assert.equal(read.raw.version,3);assert.deepEqual(read.sources.map(s=>s.id).sort(),['m','v']);assert.deepEqual(Project.state(read.raw,registry),Project.state(raw,registry));
  fs.writeFileSync(saved.file,JSON.stringify({...read.raw,version:2}));const bytes=fs.readFileSync(saved.file);await saveBundle(saved.file,raw,saved.assets,{existing:true});assert.deepEqual(fs.readFileSync(saved.file+'.v2-backup'),bytes);
  const writer=new RecoveryStore(dir,{id:'audio-recovery',isAlive:()=>false});writer.save(raw,registry);const reader=new RecoveryStore(dir,{id:'audio-reopen',isAlive:()=>false});assert.deepEqual(Project.state(reader.read('audio-recovery').raw,registry),Project.state(raw,registry));
});
test('real exports delay and trim music, mix without normalization, honor solo/mute/fades and crop at video end',async()=>{
  await fixtures();const raw={clips:[{id:'v1',assetId:'v',start:0,end:3}],audioTracks:[{id:'a',clips:[{id:'m1',assetId:'m',start:0,end:2,at:1,audio:{}}]}],encoder:'cpu'};
  function rms(file,start,length=.15){const data=run(['-ss',String(start),'-i',file,'-t',String(length),'-vn','-ac','1','-f','f32le','pipe:1']);let sum=0;for(let i=0;i<data.length;i+=4)sum+=data.readFloatLE(i)**2;return Math.sqrt(sum/(data.length/4));}
  const levels={};for(const mode of ['base','mixed','solo','muted','faded','late','extracted']){const opts=structuredClone(raw);if(mode==='base')opts.audioTracks=[];if(mode==='solo')opts.audioTracks[0].solo=true;if(mode==='muted')opts.audioTracks[0].muted=true;if(mode==='faded'){opts.mainTrack={muted:true};opts.audioTracks[0].clips[0].audio={fadeIn:.6,fadeOut:.6};}if(mode==='late')opts.audioTracks[0].clips[0].at=2.5;
    if(mode==='extracted'){opts.clips[0].audio={muted:true};opts.audioTracks[0].clips=[{id:'extract',assetId:'v',start:0,end:3,at:0,link:{clipId:'v1',offset:0}}];}
    const file=path.join(dir,mode+'.mp4');run(exportArgs(registry,[],file,raw.meta||{width:160,height:90,fps:'30'},opts));levels[mode]=[rms(file,.4),rms(file,1.4)];
    const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-of','json',file]));assert.ok(Math.abs(Number(probe.format.duration)-3)<.05);
    if(mode==='faded'){assert.ok(rms(file,1.01,.03)<rms(file,1.7)*.15);assert.ok(rms(file,2.94,.03)<rms(file,1.7)*.15);}
  }
  assert.ok(levels.solo[0]<1e-6);assert.ok(levels.solo[1]>.05);assert.ok(levels.mixed[1]>levels.base[1]*1.3);assert.ok(Math.abs(levels.muted[1]/levels.base[1]-1)<.04);assert.ok(Math.abs(levels.extracted[1]/levels.base[1]-1)<.04);
});
test('still-image exports with a title and independent sound preserve input ordering and exact length',async()=>{
  await fixtures();const image=path.resolve('test-output/photo.png'),p=await library.inspect(image,'p'),output=path.join(dir,'still-with-audio.mp4');
  const args=exportArgs({...registry,p},[{path:image,start:.2,duration:.4}],output,{width:160,height:90,fps:'30'},{clips:[{id:'still',assetId:'p',start:0,end:1}],audioTracks:[{id:'t',clips:[{id:'sound',assetId:'m',start:.5,end:1.5,at:0}]}],encoder:'cpu'});run(args);
  const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',output]));assert.ok(probe.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(probe.format.duration)-1)<.05);
  const data=run(['-i',output,'-vn','-ac','1','-f','f32le','pipe:1']);let peak=0;for(let i=0;i<data.length;i+=4)peak=Math.max(peak,Math.abs(data.readFloatLE(i)));assert.ok(peak>.05);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const Settings=require('../app/clip-settings'),Project=require('../app/project'),TL=require('../app/timeline'),{saveBundle}=require('../app/project-bundle'),{RecoveryStore}=require('../app/recovery'),{exportArgs,inspect}=require('../app/export');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path;
const dir=fs.mkdtempSync(path.resolve('test-output/clip-settings-'));
const run=args=>execFileSync(ffmpeg,['-v','error',...args],{timeout:30000,maxBuffer:8*1024*1024});
const probe=file=>JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file]));
test('clip properties reject malformed saved values and cap fades to the edited duration',()=>{
  for(const value of [{volume:NaN},{volume:3},{volume:'1'},{muted:'yes'},{fadeIn:-1},null,[]])assert.throws(()=>Settings.audio(value));
  for(const value of [{zoom:10},{rotation:91},{x:51},{fit:'stretch'},null,[]])assert.throws(()=>Settings.transform(value));
  assert.equal(Settings.gain({volume:2,muted:true},1,2),0);
  assert.equal(Settings.gain({volume:2,fadeIn:1},.25,2),.5);
  assert.deepEqual(Settings.fades({fadeIn:10,fadeOut:10},2),{fadeIn:1,fadeOut:1});
  const parts=TL.split([{start:0,end:4,audio:{volume:.5,fadeIn:.2,fadeOut:.3},transform:{zoom:2}}],2).clips;
  assert.equal(parts[0].audio.fadeOut,0);assert.equal(parts[1].audio.fadeIn,0);assert.equal(parts[1].audio.fadeOut,.3);assert.equal(parts[1].transform.zoom,2);
  for(const sample of [-2,-1,-.2,0,.2,1,2])assert.ok(Math.abs(Settings.limit(sample))<=1);
  assert.equal(Settings.limit(.2),.2);
});
test('canvas sizes and transform geometry keep even encoded dimensions and valid visible crops',()=>{
  const source={width:1920,height:1080};
  assert.deepEqual(Settings.canvasSize(source,'9:16',1080),{width:1080,height:1920});
  assert.deepEqual(Settings.canvasSize(source,'1:1',720),{width:720,height:720});
  assert.deepEqual(Settings.canvasSize(source,'source',720),source);
  assert.throws(()=>Settings.canvasSize(source,'bad',1080));
  for(const fit of ['contain','cover'])for(const rotation of [0,90,180,270])for(const zoom of [.25,1,4])for(const x of [-50,0,50]){
    const t={fit,rotation,zoom,x,y:x},size={width:180,height:320},g=Settings.geometry(source,size,t);
    assert.equal(g.width%2,0);assert.equal(g.height%2,0);assert.ok(Math.min(size.width,g.left+g.width)-Math.max(0,g.left)>0);
    assert.ok(Math.min(size.height,g.top+g.height)-Math.max(0,g.top)>0);
  }
});
test('new properties survive portable save, legacy migration backup, and crash recovery',async()=>{
  const file=path.join(dir,'media.mp4');fs.writeFileSync(file,'synthetic fixture');
  const assets={v:{path:file,kind:'video',meta:{width:320,height:180,duration:4,fps:'30'}}};
  const raw={meta:{width:180,height:320,fps:'30'},sourceMeta:{width:320,height:180,fps:'30'},canvasMode:'9:16',clips:[{assetId:'v',start:0,end:4,audio:{volume:1.5,muted:false,fadeIn:.2,fadeOut:.5},transform:{fit:'cover',x:10,rotation:90,flipX:true}}],titles:[]};
  const saved=await saveBundle(path.join(dir,'project.sahl'),raw,assets),read=Project.readProject(saved.file);
  assert.equal(read.raw.version,Project.VERSION);assert.deepEqual(Project.state(read.raw,assets),Project.state(raw,assets));
  const legacy={...read.raw,version:1};fs.writeFileSync(saved.file,JSON.stringify(legacy));const bytes=fs.readFileSync(saved.file);
  await saveBundle(saved.file,raw,saved.assets,{existing:true});assert.deepEqual(fs.readFileSync(saved.file+'.v1-backup'),bytes);
  await saveBundle(saved.file,raw,saved.assets,{existing:true});assert.ok(!fs.existsSync(saved.file+'.v1-backup-1'));
  const writer=new RecoveryStore(dir,{id:'new-properties',isAlive:()=>false});writer.save(raw,assets);
  const reader=new RecoveryStore(dir,{id:'after-crash',isAlive:()=>false});assert.deepEqual(Project.state(reader.read('new-properties').raw,assets),Project.state(raw,assets));
  const invalid={...read.raw,version:999};fs.writeFileSync(path.join(dir,'future.sahl'),JSON.stringify(invalid));assert.throws(()=>Project.readProject(path.join(dir,'future.sahl')),/مدعوم/);
});
test('real exports apply mute, gain, fades and a soft ceiling without changing duration',()=>{
  const input=path.join(dir,'audio.mkv');run(['-y','-f','lavfi','-i','color=red:s=160x90:r=30:d=2','-f','lavfi','-i','sine=frequency=600:duration=2','-c:v','ffv1','-c:a','pcm_s16le','-shortest',input]);
  const meta=inspect(probe(input)),peaks={};
  for(const [name,audio]of Object.entries({normal:{},half:{volume:.5},double:{volume:2},muted:{muted:true},faded:{fadeIn:.8,fadeOut:.8}})){
    const output=path.join(dir,name+'.mp4');run(exportArgs(input,null,output,meta,{clips:[{start:0,end:2,audio}],encoder:'cpu'}));
    const rms=(start,length)=>{const data=run(['-ss',String(start),'-i',output,'-t',String(length),'-vn','-ac','1','-f','f32le','pipe:1']);let sum=0;for(let i=0;i<data.length;i+=4)sum+=data.readFloatLE(i)**2;return Math.sqrt(sum/(data.length/4));};
    peaks[name]=rms(.9,.2);if(name==='faded'){assert.ok(rms(.02,.05)<peaks[name]*.15);assert.ok(rms(1.93,.05)<peaks[name]*.15);}
    assert.ok(Math.abs(Number(probe(output).format.duration)-2)<.05);
  }
  assert.ok(Math.abs(peaks.half/peaks.normal-.5)<.03);assert.ok(Math.abs(peaks.double/peaks.normal-2)<.05);assert.ok(peaks.muted<1e-7);
  // Exercise the limiter above its knee, not just small sine samples.
  const limited=run(['-f','lavfi','-i','aevalsrc=0.8:d=0.2:s=48000','-af',Settings.audioFilter({volume:2},.2),'-f','f32le','pipe:1']);
  assert.ok(limited.readFloatLE(400)>.9&&limited.readFloatLE(400)<=1);
});
test('real exports rotate, flip, position and crop a four-quadrant image',()=>{
  const input=path.join(dir,'quadrants.png');run(['-y','-f','lavfi','-i','color=red:s=160x100,drawbox=x=80:y=0:w=80:h=50:c=green:t=fill,drawbox=x=0:y=50:w=80:h=50:c=blue:t=fill,drawbox=x=80:y=50:w=80:h=50:c=yellow:t=fill','-frames:v','1',input]);
  const assets={p:{path:input,kind:'image',meta:{width:160,height:100,duration:5,fps:'30'}}};
  const cases=[
    ['plain',{},[160,100],[[20,20,'red'],[140,20,'green'],[20,80,'blue'],[140,80,'yellow']]],
    ['clockwise',{rotation:90},[100,160],[[20,20,'blue'],[80,20,'red'],[20,140,'yellow'],[80,140,'green']]],
    ['flip',{flipX:true},[160,100],[[20,20,'green'],[140,20,'red']]],
    ['portrait',{fit:'cover'},[100,160],[[20,20,'red'],[80,20,'green'],[20,140,'blue']]],
    ['move',{x:25},[160,100],[[20,20,'black'],[60,20,'red']]],
    ['zoom',{zoom:2,fit:'cover',x:-20},[100,160],[[80,20,'green']]]
  ];
  const expected={red:[255,0,0],green:[0,128,0],blue:[0,0,255],yellow:[255,255,0],black:[0,0,0]};
  for(const [name,transform,[width,height],samples]of cases){
    const output=path.join(dir,'geometry-'+name+'.mp4');run(exportArgs(assets,[],output,{width,height,fps:'30'},{clips:[{assetId:'p',start:0,end:.2,transform}],encoder:'cpu'}));
    const v=probe(output).streams[0];assert.equal(v.width,width);assert.equal(v.height,height);
    const pixels=run(['-i',output,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
    for(const [x,y,color]of samples){const index=(y*width+x)*3;for(let channel=0;channel<3;channel++)assert.ok(Math.abs(pixels[index+channel]-expected[color][channel])<25,`${name}: ${x},${y} expected ${color}, got ${[...pixels.subarray(index,index+3)]}`);}
  }
});
test('a transformed portrait HDR export keeps ten-bit output and source transfer',()=>{
  const input=path.join(dir,'hdr.mkv'),output=path.join(dir,'hdr-portrait.mp4');
  run(['-y','-f','lavfi','-i','color=s=320x180:r=30:d=0.2,format=yuv420p10le','-c:v','ffv1','-color_trc','smpte2084','-color_primaries','bt2020','-colorspace','bt2020nc',input]);
  const meta=inspect(probe(input));
  run(exportArgs({v:{path:input,kind:'video',meta}},[],output,{width:180,height:320,fps:'30'},{clips:[{assetId:'v',start:0,end:.2,transform:{fit:'cover',rotation:90,flipX:true,zoom:1.2}}],encoder:'cpu'}));
  const stream=probe(output).streams[0];assert.equal(stream.pix_fmt,'yuv420p10le');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.width,180);assert.equal(stream.height,320);
});

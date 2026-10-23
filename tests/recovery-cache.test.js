const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {RecoveryStore,AutoSaver}=require('../app/recovery'),Project=require('../app/project');
function fixture(t){
  const directory=fs.mkdtempSync(path.resolve('test-output/recovery-cache-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const meta={width:640,height:360,fps:'30',duration:10},assets={};
  for(const [id,kind,extension]of [['v','video','mp4'],['p','image','png'],['a','audio','wav']]){
    const file=path.join(directory,id+'.'+extension);fs.writeFileSync(file,kind+' original bytes');assets[id]={id,kind,path:file,name:path.basename(file),meta:{...meta,audio:kind==='audio'}};
  }
  const raw={displayName:'مشروع محفوظ',meta,assetIds:Object.keys(assets),clips:[{assetId:'v',start:1,end:3},{assetId:'p',start:0,end:2}],titles:[{title:'كتابة',titleStart:1,titleDuration:2,position:'top-right'}],cursor:1.5};
  const writer=new RecoveryStore(directory,{id:'writer',isAlive:()=>false}),reader=new RecoveryStore(directory,{id:'reader',isAlive:()=>false});
  return {directory,assets,raw,writer,reader};
}
test('autosave recovers exact video, image and audio bytes after originals move or disappear, without recopying later edits',async t=>{
  const f=fixture(t),read=fs.createReadStream,reads=[];t.after(()=>fs.createReadStream=read);
  fs.createReadStream=(file,...args)=>{reads.push(file);return read(file,...args);};
  await f.writer.saveWithMedia(f.raw,f.assets);assert.equal(reads.length,3);
  const initial=f.reader.read('writer'),copies=initial.sources.map(s=>s.resolved);
  for(const source of initial.sources){assert.ok(source.resolved.includes(path.join('recovery','media')));assert.deepEqual(fs.readFileSync(source.resolved),fs.readFileSync(f.assets[source.id].path));}
  for(let cursor=0;cursor<3;cursor++)await f.writer.saveWithMedia({...f.raw,cursor},f.assets);
  assert.equal(reads.length,3,'edit-only saves must not read or copy source bytes');
  fs.renameSync(f.assets.v.path,f.assets.v.path+'.moved');fs.unlinkSync(f.assets.p.path);fs.unlinkSync(f.assets.a.path);
  await f.writer.saveWithMedia({...f.raw,cursor:3},f.assets);
  const reopened=f.reader.read('writer');assert.deepEqual(reopened.sources.map(s=>s.resolved),copies);assert.equal(reopened.raw.cursor,3);assert.equal(reopened.raw.titles[0].title,'كتابة');assert.equal(reads.length,3);
  const restored=new RecoveryStore(f.directory,{id:'restored',isAlive:()=>false}),registry=Object.fromEntries(reopened.sources.map(s=>[s.id,{...f.assets[s.id],path:s.resolved}]));
  await restored.saveWithMedia(reopened.raw,registry);f.writer.clear();assert.equal(reads.length,3,'restoring uses existing cache copies');
  assert.ok(f.reader.read('restored').sources.every(s=>s.resolved));restored.clear();assert.equal(fs.readdirSync(f.writer.cache.directory).length,0,'last recovery releases its media');
  assert.ok(fs.existsSync(f.assets.v.path+'.moved'),'cleanup never touches original files');
});
test('changed sources get a new immutable copy and the previous generation retains its original bytes',async t=>{
  const f=fixture(t);await f.writer.saveWithMedia(f.raw,f.assets);const before=f.reader.read('writer'),old=before.sources[0].resolved;
  fs.writeFileSync(f.assets.v.path,'replacement video bytes with a different size');
  await f.writer.saveWithMedia({...f.raw,cursor:2},f.assets);const current=f.reader.read('writer');
  assert.notEqual(current.sources[0].resolved,old);assert.equal(fs.readFileSync(old,'utf8'),'video original bytes');
  assert.equal(fs.readFileSync(current.sources[0].resolved,'utf8'),'replacement video bytes with a different size');
  assert.equal(current.sources[1].resolved,before.sources[1].resolved);assert.equal(current.sources[2].resolved,before.sources[2].resolved);
  fs.writeFileSync(current.file,'corrupt snapshot');const fallback=f.reader.read('writer');assert.equal(fallback.sources[0].resolved,old);assert.equal(fallback.raw.cursor,f.raw.cursor);
});
test('concurrent projects share one copy per source and clearing one retains media for the other',async t=>{
  const f=fixture(t),other=new RecoveryStore(f.directory,{id:'other',isAlive:()=>false}),read=fs.createReadStream;let reads=0;
  t.after(()=>fs.createReadStream=read);fs.createReadStream=(...args)=>{reads++;return read(...args);};
  await Promise.all([f.writer.saveWithMedia(f.raw,f.assets),other.saveWithMedia({...f.raw,cursor:2},f.assets)]);
  assert.equal(reads,3);f.writer.clear();assert.ok(f.reader.read('other').sources.every(s=>s.resolved));other.clear();assert.equal(fs.readdirSync(f.writer.cache.directory).length,0);
});
test('disk failure keeps the last snapshot and reports autosave failure until copying succeeds',async t=>{
  const f=fixture(t);await f.writer.saveWithMedia(f.raw,f.assets);const before=f.reader.read('writer'),events=[];
  fs.writeFileSync(f.assets.v.path,'changed and longer source video');
  const context={raw:{...f.raw,cursor:3},assets:f.assets,dirty:true},saver=new AutoSaver(f.writer,()=>context,v=>events.push(v),{setIntervalFn:()=>null,clearIntervalFn(){}});
  const write=fs.createWriteStream;try{fs.createWriteStream=(file,...args)=>{if(file.endsWith('.part'))throw Object.assign(new Error('disk full'),{code:'ENOSPC'});return write(file,...args);};await saver.capture();}finally{fs.createWriteStream=write;}
  assert.equal(events.at(-1).phase,'error');assert.match(events.at(-1).message,/المساحة/);assert.equal(f.reader.read('writer').file,before.file);assert.deepEqual(f.reader.read('writer').raw,before.raw);
  assert.equal(fs.readdirSync(f.writer.cache.directory).filter(n=>n.endsWith('.part')).length,0);
  await saver.capture();assert.equal(events.at(-1).phase,'saved');assert.equal(f.reader.read('writer').raw.cursor,3);saver.stop();
});
test('clearing a project during a background copy cannot recreate its recovery snapshot',async t=>{
  const f=fixture(t);fs.writeFileSync(f.assets.v.path,Buffer.alloc(8*1024*1024,7));let cleared=false;
  const pending=f.writer.saveWithMedia(f.raw,f.assets,{onProgress:()=>{if(!cleared){cleared=true;f.writer.clear();}}});
  await assert.rejects(pending,{name:'AbortError'});assert.ok(cleared);assert.equal(f.reader.list().length,0);
  // Let the shared stream finish its abort cleanup before removing the fixture.
  for(let i=0;i<100&&fs.readdirSync(f.writer.cache.directory).some(n=>n.endsWith('.part'));i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(fs.readdirSync(f.writer.cache.directory).length,0);assert.ok(fs.existsSync(f.assets.v.path));
});
test('missing sources before the first backup fail without claiming a completed autosave',async t=>{
  const f=fixture(t);fs.unlinkSync(f.assets.v.path);await assert.rejects(f.writer.saveWithMedia(f.raw,f.assets),/لم تكتمل/);assert.equal(f.reader.list().length,0);
});
test('restart cleans only interrupted copy files owned by a stopped process',t=>{
  const f=fixture(t),directory=f.writer.cache.directory;fs.mkdirSync(directory,{recursive:true});
  const prefix='a'.repeat(64)+'.mp4.',suffix='.12345678-1234-1234-1234-123456789abc.part';
  const stale=path.join(directory,prefix+'2147483000'+suffix),live=path.join(directory,prefix+process.pid+suffix),unrelated=path.join(directory,'user-file.part');
  for(const file of [stale,live,unrelated])fs.writeFileSync(file,'partial');
  new RecoveryStore(f.directory,{id:'restarted',isAlive:()=>false});
  assert.equal(fs.existsSync(stale),false);assert.ok(fs.existsSync(live));assert.ok(fs.existsSync(unrelated));assert.ok(fs.existsSync(f.assets.v.path));
});

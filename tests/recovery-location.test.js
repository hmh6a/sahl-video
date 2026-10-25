const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {RecoveryLocation,mapPath}=require('../app/recovery-location'),{RecoveryStore}=require('../app/recovery');
async function fixture(t){
  const root=fs.mkdtempSync(path.resolve('test-output/recovery-location-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const userData=path.join(root,'profile'),otherDisk=path.join(root,'other-disk');fs.mkdirSync(otherDisk);
  const meta={width:640,height:360,fps:'30',duration:10},assets={};
  for(const [id,kind,ext]of [['v','video','mp4'],['p','image','png']]){const file=path.join(root,id+'.'+ext);fs.writeFileSync(file,'original '+kind+' bytes');assets[id]={id,path:file,kind,name:id+'.'+ext,meta};}
  const raw={displayName:'نسخة على قرص ثاني',meta,assetIds:['v','p'],clips:[{assetId:'v',start:0,end:4},{assetId:'p',start:0,end:2}],titles:[{title:'عنوان محفوظ',titleStart:2,titleDuration:3}],cursor:2};
  const store=new RecoveryStore(userData,{id:'one',isAlive:()=>false}),location=new RecoveryLocation(userData);
  await store.saveWithMedia(raw,assets);await store.saveWithMedia({...raw,cursor:3},assets);
  return {root,userData,otherDisk,assets,raw,store,location};
}
test('changing recovery location migrates both snapshots and media, persists across restart, and reuses copies after deleting originals',async t=>{
  const f=await fixture(t),old=f.store.directory,events=[];
  for(const asset of Object.values(f.assets))fs.unlinkSync(asset.path);
  const moved=await f.location.move(f.otherDisk,{onProgress:value=>events.push(value)});f.store.relocate(moved.directory);
  assert.ok(events.some(p=>p.phase==='moving'));assert.ok(fs.existsSync(path.join(old,'one.0.sahl')),'old files remain until settings commit and stores switch');
  assert.equal((await f.location.cleanup()).cleanupPending,false);assert.equal(fs.existsSync(old),false);
  const restart=new RecoveryLocation(f.userData),reader=new RecoveryStore(f.userData,{id:'reader',isAlive:()=>false,recoveryDirectory:restart.directory});
  assert.equal(restart.directory,moved.directory);assert.ok(reader.read('one').sources.every(s=>s.resolved?.startsWith(moved.directory)));assert.equal(reader.read('one').raw.cursor,3);
  const files=fs.readdirSync(f.store.cache.directory),read=fs.createReadStream;let reads=0;
  try{fs.createReadStream=(...args)=>{reads++;return read(...args);};await f.store.saveWithMedia({...f.raw,cursor:1},f.assets);}finally{fs.createReadStream=read;}
  assert.equal(reads,0,'unchanged media is not recopied at the new location');assert.deepEqual(fs.readdirSync(f.store.cache.directory),files);assert.equal(reader.read('one').raw.cursor,1);
});
test('migration rebases restored project paths and preserves shared media for multiple projects',async t=>{
  const f=await fixture(t),reader=new RecoveryStore(f.userData,{id:'reader',isAlive:()=>false}),saved=reader.read('one');
  const restored=new RecoveryStore(f.userData,{id:'restored',isAlive:()=>false}),assets=Object.fromEntries(saved.sources.map(s=>[s.id,{...f.assets[s.id],path:s.resolved}]));
  await restored.saveWithMedia(f.raw,assets);const moved=await f.location.move(f.otherDisk);f.store.relocate(moved.directory);restored.relocate(moved.directory);
  const newAssets=Object.fromEntries(Object.entries(assets).map(([id,a])=>[id,{...a,path:mapPath(a.path,moved.oldDirectory,moved.directory)}]));
  await f.location.cleanup();await restored.saveWithMedia({...f.raw,cursor:4},newAssets);f.store.clear();
  const newReader=new RecoveryStore(f.userData,{id:'reader',isAlive:()=>false,recoveryDirectory:moved.directory}),entry=newReader.read('restored');
  assert.ok(entry.sources.every(s=>s.path.startsWith(moved.directory)&&s.resolved));assert.equal(entry.raw.cursor,4);assert.equal(fs.readdirSync(restored.cache.directory).length,2);
});
test('copy failure and settings-write failure roll back without changing the previous location or recovery',async t=>{
  const f=await fixture(t),old=f.store.directory,write=fs.createWriteStream;
  try{fs.createWriteStream=(file,...args)=>{if(file.startsWith(f.otherDisk))throw Object.assign(Error('disk full'),{code:'ENOSPC'});return write(file,...args);};await assert.rejects(f.location.move(f.otherDisk),/المساحة/);}finally{fs.createWriteStream=write;}
  assert.equal(f.location.directory,old);assert.equal(fs.existsSync(f.location.file),false);assert.deepEqual(fs.readdirSync(f.otherDisk),[]);
  const rename=fs.promises.rename;
  try{fs.promises.rename=async(from,to)=>{if(to===f.location.file)throw Object.assign(Error('settings locked'),{code:'EACCES'});return rename(from,to);};await assert.rejects(f.location.move(f.otherDisk),/settings locked/);}finally{fs.promises.rename=rename;}
  assert.deepEqual(fs.readdirSync(f.otherDisk),[]);assert.equal(f.location.directory,old);assert.ok(fs.existsSync(path.join(old,'one.0.sahl')));assert.ok(Object.values(f.assets).every(a=>fs.existsSync(a.path)));
});
test('migration never overwrites an existing folder or removes unrelated files, and rejects nested destinations',async t=>{
  const f=await fixture(t),old=f.store.directory,unrelated=path.join(old,'personal.png'),existing=path.join(f.otherDisk,'Sahl Autosave');
  fs.writeFileSync(unrelated,'personal file');fs.mkdirSync(existing);fs.writeFileSync(path.join(existing,'keep.txt'),'keep');
  await assert.rejects(f.location.move(path.join(old,'media')),/خارج/);
  const moved=await f.location.move(f.otherDisk);assert.equal(path.basename(moved.directory),'Sahl Autosave (2)');f.store.relocate(moved.directory);await f.location.cleanup();
  assert.equal(fs.readFileSync(unrelated,'utf8'),'personal file');assert.equal(fs.readFileSync(path.join(existing,'keep.txt'),'utf8'),'keep');
});
test('an unavailable destination never falls back to C or removes the previous copies during cleanup',async t=>{
  const f=await fixture(t),moved=await f.location.move(f.otherDisk);f.store.relocate(moved.directory);
  const offline=moved.directory+'.offline';fs.renameSync(moved.directory,offline);
  assert.equal((await f.location.cleanup()).cleanupPending,true);assert.ok(fs.existsSync(path.join(moved.oldDirectory,'one.0.sahl')));
  fs.writeFileSync(moved.directory,'unavailable drive');const reader=new RecoveryLocation(f.userData);
  assert.equal(reader.directory,moved.directory);const store=new RecoveryStore(f.userData,{recoveryDirectory:reader.directory});
  await assert.rejects(store.saveWithMedia(f.raw,f.assets));assert.equal(fs.existsSync(path.join(f.userData,'recovery',store.id+'.1.sahl')),false);
  fs.unlinkSync(moved.directory);fs.renameSync(offline,moved.directory);await reader.cleanup();assert.equal(fs.existsSync(moved.oldDirectory),false);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Project=require('../app/project'),{RecoveryStore}=require('../app/recovery'),{saveBundle}=require('../app/project-bundle'),{resolveRecoveryMedia}=require('../app/recovery-media');

test('recovery locates the same asset in a saved portable project after the original disappears',async t=>{
  const directory=fs.mkdtempSync(path.resolve('test-output/recovery-media-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const original=path.join(directory,'original.png');fs.copyFileSync(path.resolve('test-output/photo.png'),original);
  const asset={id:'original-asset',path:original,kind:'image',name:'original.png',meta:{width:640,height:360,duration:5,fps:'30'}};
  const raw={displayName:'مونتاج الألعاب',meta:{width:640,height:360,fps:'30'},assetIds:[asset.id],clips:[{id:'clip',assetId:asset.id,start:0,end:3}],titles:[{title:'نص محفوظ'}],cursor:1};
  const recovery=new RecoveryStore(directory,{id:'crashed',ownerPid:2147483000}),reader=new RecoveryStore(directory,{id:'reader',isAlive:()=>false});
  recovery.save(raw,{[asset.id]:asset});const saved=await saveBundle(path.join(directory,'saved.sahl'),raw,{[asset.id]:asset});fs.unlinkSync(original);
  assert.equal(reader.list()[0].name,raw.displayName);
  const entry=reader.read('crashed');assert.equal(entry.sources[0].resolved,null);
  const withoutCopy=resolveRecoveryMedia(entry);assert.equal(withoutCopy.missingFiles.length,1);
  const resolved=resolveRecoveryMedia(entry,[path.join(directory,'bad.sahl'),saved.file]);assert.equal(resolved.missingFiles.length,0);assert.equal(resolved.sources[0].resolved,saved.assets[asset.id].path);
  assert.equal(resolved.raw.cursor,1);assert.equal(Project.state(Project.readProject(saved.file).raw,saved.assets).displayName,raw.displayName);
  const unrelated={...entry,sources:entry.sources.map(source=>({...source,id:'different-id'}))};assert.equal(resolveRecoveryMedia(unrelated,[saved.file]).missingFiles.length,1,'matching a filename alone must not replace a source');
  assert.equal(reader.list().length,1,'checking media never consumes the recovery');
});

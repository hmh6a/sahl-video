const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),yaml=require('js-yaml');
const {assemble,targets}=require('../scripts/release-artifacts.cjs'),{publish}=require('../scripts/publish-release.cjs');
const version='1.0.2',commit='a'.repeat(40),hash=(b,algo='sha256',encoding='hex')=>crypto.createHash(algo).update(b).digest(encoding);
function fixture(t,signed=true){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-release-')),input=path.join(root,'input'),output=path.join(root,'output');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const target of targets){
  const dir=path.join(input,target);fs.mkdirSync(dir,{recursive:true});
  const mac=target.startsWith('darwin'),base=mac?`Sahl-Video-${version}-mac-${target.slice(7)}`:`Sahl-Video-${version}`,autoUpdate=!mac||signed;
  const names=mac?[base+'.dmg',base+'.zip']:[base+'.exe'],files=[];
  const record=(name,bytes)=>{fs.writeFileSync(path.join(dir,name),bytes);files.push({name,size:bytes.length,sha256:hash(bytes)});};
  for(const name of names)record(name,Buffer.from('binary for '+name));
  if(autoUpdate){const update=names.at(-1),bytes=fs.readFileSync(path.join(dir,update));record(mac?'latest-mac.yml':'latest.yml',Buffer.from(yaml.dump({version,files:[{url:update,size:bytes.length,sha512:hash(bytes,'sha512','base64')}],path:update,sha512:hash(bytes,'sha512','base64')})));}
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({format:2,version,tag:'v'+version,commit,target,autoUpdate,files}));
 }
 return {root,input,output};
}
test('release assembly merges both signed Mac architectures and validates update checksums',t=>{
 const f=fixture(t),files=assemble(f.input,f.output,{version,commit}),mac=yaml.load(fs.readFileSync(path.join(f.output,'latest-mac.yml'),'utf8'));
 assert.equal(mac.files.length,2);assert.ok(mac.files.some(f=>f.url.endsWith('arm64.zip')));assert.ok(mac.files.some(f=>f.url.endsWith('x64.zip')));
 assert.ok(files.includes(`Sahl-Video-${version}.exe`));assert.ok(files.includes('latest.yml'));assert.ok(files.includes('SHA256SUMS.txt'));
});
test('unsigned Macs still publish installers but no unusable automatic-update feed',t=>{
 const f=fixture(t,false),files=assemble(f.input,f.output,{version,commit});assert.ok(!files.includes('latest-mac.yml'));assert.ok(files.includes('latest.yml'));assert.ok(files.some(n=>n.endsWith('arm64.dmg')));assert.ok(files.some(n=>n.endsWith('x64.dmg')));
});
test('release assembly refuses missing architectures, altered bytes, stale commits and false update checksums',t=>{
 for(const kind of ['missing','binary','commit','metadata']){
  const f=fixture(t),dir=path.join(f.input,'win32-x64'),manifestFile=path.join(dir,'manifest.json'),m=JSON.parse(fs.readFileSync(manifestFile));
  if(kind==='missing')fs.rmSync(path.join(f.input,'darwin-arm64'),{recursive:true});
  if(kind==='binary')fs.appendFileSync(path.join(dir,m.files[0].name),'tampered');
  if(kind==='commit'){m.commit='b'.repeat(40);fs.writeFileSync(manifestFile,JSON.stringify(m));}
  if(kind==='metadata'){
   const entry=m.files.find(f=>f.name==='latest.yml'),file=path.join(dir,entry.name),data=yaml.load(fs.readFileSync(file,'utf8'));data.files[0].sha512='wrong';const bytes=Buffer.from(yaml.dump(data));fs.writeFileSync(file,bytes);entry.size=bytes.length;entry.sha256=hash(bytes);fs.writeFileSync(manifestFile,JSON.stringify(m));
  }
  assert.throws(()=>assemble(f.input,f.output,{version,commit}));
 }
});
function release(t,options={}){
 const f=fixture(t),calls=[];let uploaded=false;
 const env={GH_TOKEN:'fixture',GH_REPO:'test/repo',GITHUB_SHA:commit,GITHUB_EVENT_NAME:'push',GITHUB_REF_TYPE:'tag',GITHUB_REF_NAME:'v'+version,...options.env};
 const gh=(...args)=>{
  calls.push(args);
  if(args[0]==='api'){
   if(options.missing)throw Error('HTTP 404');
   if(args[1].includes('/git/ref/tags/'))return JSON.stringify({object:{type:options.annotated?'tag':'commit',sha:options.wrongCommit?'b'.repeat(40):commit}});
   return JSON.stringify({object:{type:'commit',sha:commit}});
  }
  if(args[1]==='upload'){uploaded=true;return '';}
  if(args[1]==='view')return JSON.stringify({isDraft:!calls.some(a=>a[1]==='edit'),url:'https://github.com/test/repo/releases/tag/v'+version,assets:uploaded?fs.readdirSync(f.output).filter(n=>n!=='notes.md').map(name=>({name,size:fs.statSync(path.join(f.output,name)).size})):[]});
  return '';
 };
 let error;try{publish({env,gh,input:f.input,output:f.output});}catch(e){error=e;}
 return {error,calls};
}
test('publication refuses branches, manual dispatch, missing tags and changed commits',t=>{
 for(const opts of [{env:{GITHUB_REF_TYPE:'branch'}},{env:{GITHUB_EVENT_NAME:'workflow_dispatch'}},{env:{GITHUB_REF_NAME:'v1.0.3'}},{missing:true},{wrongCommit:true}]){
  const r=release(t,opts);assert.ok(r.error);assert.ok(!r.calls.some(a=>a[0]==='release'));assert.ok(!r.calls.some(a=>a.includes('POST')||a.includes('DELETE')));
 }
});
test('publication uploads and verifies every desktop artifact before publishing without changing tags',t=>{
 for(const annotated of [false,true]){const r=release(t,{annotated});assert.ifError(r.error);assert.ok(r.calls.find(a=>a[1]==='upload').some(a=>a.endsWith('latest-mac.yml')));assert.ok(r.calls.findIndex(a=>a[1]==='edit')>r.calls.findIndex(a=>a[1]==='upload'));assert.ok(!r.calls.some(a=>a.includes('POST')||a.includes('DELETE')));}
});

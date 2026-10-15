const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {saveBundle}=require('../app/project-bundle'),Project=require('../app/project'),Titles=require('../app/titles');
const root=path.resolve('test-output');fs.mkdirSync(root,{recursive:true});
function fixture(){const dir=fs.mkdtempSync(path.join(root,'bundle-v16-')),original=path.join(dir,'original');fs.mkdirSync(original);const x=path.join(original,'a'),y=path.join(original,'b');fs.mkdirSync(x);fs.mkdirSync(y);const video=path.join(x,'مشترك.mp4'),photo=path.join(y,'مشترك.mp4');fs.writeFileSync(video,Buffer.alloc(2*1024*1024,25));fs.writeFileSync(photo,'another video with same filename');const picture=path.join(original,'صورة.png');fs.writeFileSync(picture,'PNG fixture bytes');
 const meta={width:3840,height:2160,duration:10,fps:'60/1'},assets={v:{path:video,kind:'video',meta},w:{path:photo,kind:'video',meta},p:{path:picture,kind:'image',meta:{...meta,duration:5}}},raw={meta,assetIds:Object.keys(assets),clips:[{assetId:'v',start:1,end:4,transition:'fade'},{assetId:'p',start:0,end:2,transition:'fade'},{assetId:'w',start:4,end:8}],titles:Titles.normalize([{title:'ANTON TITLE',font:'Anton',position:'top-right',titleStart:.4,titleDuration:4,animation:'slide-up'}]),cursor:2};return {dir,original,assets,raw};}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('portable project copies all media byte-for-byte and reopens after original sources disappear',async()=>{
 const f=fixture(),events=[],saved=await saveBundle(path.join(f.dir,'رحلتي.sahl'),f.raw,f.assets,{onProgress:p=>events.push(p)});
 assert.equal(saved.folder,path.join(f.dir,'رحلتي'));assert.equal(saved.file,path.join(saved.folder,'رحلتي.sahl'));assert.equal(saved.document.portable,true);assert.equal(saved.document.assets.length,3);
 assert.equal(new Set(saved.document.assets.map(a=>a.relativePath)).size,3);for(const entry of saved.document.assets){assert.ok(!entry.path);assert.ok(entry.relativePath.startsWith('media'+path.sep));assert.equal(hash(saved.assets[entry.id].path),hash(f.assets[entry.id].path));}
 assert.ok(events.some(p=>p.phase==='copying'&&p.copiedBytes>0));assert.equal(events.at(-1).percent,100);
 const relocated=path.join(f.dir,'جهاز ثاني');fs.cpSync(saved.folder,relocated,{recursive:true});const unavailable=path.join(f.dir,'original-unavailable');assert.ok(Project.inside(root,f.original)&&Project.inside(root,unavailable));fs.renameSync(f.original,unavailable);
 const reopened=Project.readProject(path.join(relocated,'رحلتي.sahl'));assert.ok(reopened.sources.every(a=>a.resolved&&Project.inside(relocated,a.resolved)));assert.equal(reopened.raw.titles[0].font,'Anton');assert.deepEqual(reopened.raw.clips,saved.document.clips);
 const registry=Object.fromEntries(reopened.sources.map(a=>[a.id,{...saved.assets[a.id],path:a.resolved}]));const again=await saveBundle(path.join(relocated,'رحلتي.sahl'),f.raw,registry,{existing:true});assert.deepEqual(again.document.assets,saved.document.assets);
});
test('repeated saves reuse bundled files; Save As makes an independent folder without overwriting another folder',async()=>{
 const f=fixture(),requested=path.join(f.dir,'Project.sahl'),a=await saveBundle(requested,f.raw,f.assets),stats=Object.fromEntries(Object.entries(a.assets).map(([id,x])=>[id,fs.statSync(x.path).mtimeMs]));
 const b=await saveBundle(a.file,{...f.raw,cursor:3},a.assets,{existing:true});assert.deepEqual(a.document.assets,b.document.assets);for(const [id,x]of Object.entries(b.assets))assert.equal(fs.statSync(x.path).mtimeMs,stats[id]);
 const c=await saveBundle(requested,f.raw,b.assets);assert.equal(c.folder,path.join(f.dir,'Project (2)'));assert.ok(c.document.assets.every(x=>Project.inside(c.folder,c.assets[x.id].path)));assert.ok(fs.existsSync(a.file));assert.equal(hash(a.assets.v.path),hash(c.assets.v.path));
});
test('failed or canceled saves preserve the previous project and copies, and clean only their own new files',async()=>{
 const f=fixture(),a=await saveBundle(path.join(f.dir,'safe.sahl'),f.raw,f.assets),before=fs.readFileSync(a.file),names=fs.readdirSync(path.join(a.folder,'media'));
 const extra=path.join(f.dir,'new.mp4');fs.writeFileSync(extra,Buffer.alloc(8*1024*1024,19));const assets={...a.assets,new:{...f.assets.v,path:extra}},raw={...f.raw,assetIds:[...f.raw.assetIds,'new']};
 const controller=new AbortController();await assert.rejects(saveBundle(a.file,raw,assets,{existing:true,signal:controller.signal,progressInterval:0,onProgress:p=>{if(p.name==='new.mp4'&&p.copiedBytes>Object.values(a.assets).reduce((n,x)=>n+fs.statSync(x.path).size,0))controller.abort();}}),e=>e.name==='AbortError');assert.deepEqual(fs.readFileSync(a.file),before);assert.deepEqual(fs.readdirSync(path.join(a.folder,'media')),names);
 await assert.rejects(saveBundle(a.file,raw,{...assets,new:{...assets.new,path:path.join(f.dir,'missing.mp4')}},{existing:true}));assert.deepEqual(fs.readFileSync(a.file),before);
 const cancelNew=new AbortController();await assert.rejects(saveBundle(path.join(f.dir,'canceled.sahl'),raw,assets,{signal:cancelNew.signal,onProgress:()=>cancelNew.abort()}),e=>e.name==='AbortError');assert.ok(!fs.existsSync(path.join(f.dir,'canceled')));assert.ok(fs.existsSync(extra));
});
test('legacy projects are upgraded into a folder while their original manifest remains intact',async()=>{
 const f=fixture(),legacy=path.join(f.dir,'old.sahl');Project.writeProject(legacy,f.raw,f.assets);const previous=fs.readFileSync(legacy);const portable=await saveBundle(legacy,f.raw,f.assets);assert.deepEqual(fs.readFileSync(legacy),previous);assert.equal(portable.file,path.join(f.dir,'old','old.sahl'));assert.ok(Project.readProject(portable.file).raw.portable);
 const tampered={...portable.document,assets:[{...portable.document.assets[0],relativePath:'../outside.mp4'}]},bad=path.join(portable.folder,'bad.sahl');fs.writeFileSync(bad,JSON.stringify(tampered));assert.throws(()=>Project.readProject(bad),/خارج/);
});
test('Anton font is bundled unmodified with its redistribution license',()=>{
 const file=path.resolve('app/assets/fonts/Anton-Regular.ttf'),bytes=fs.readFileSync(file);assert.equal(bytes.readUInt32BE(0),0x00010000);assert.equal(hash(file),'a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab');assert.match(fs.readFileSync('app/assets/fonts/Anton-OFL.txt','utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {byteRange,mediaResponse}=require('../app/media'),{seekReady}=require('../app/playback'),Titles=require('../app/titles'),{TemplateStore}=require('../app/template-store');
const root=path.resolve('test-output');fs.mkdirSync(root,{recursive:true});
test('local streaming returns actual seek bytes and supports suffix ranges',async()=>{
 const file=path.join(root,'range-fixture.mp4');fs.writeFileSync(file,Buffer.from('0123456789abcdef'));
 const r=await mediaResponse(file,new Request('http://localhost/video',{headers:{range:'bytes=7-11'}}));assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 7-11/16');assert.equal(r.headers.get('content-length'),'5');assert.equal(await r.text(),'789ab');
 const tail=await mediaResponse(file,new Request('http://localhost/video',{headers:{range:'bytes=-4'}}));assert.equal(await tail.text(),'cdef');
 const bad=await mediaResponse(file,new Request('http://localhost/video',{headers:{range:'bytes=20-'}}));assert.equal(bad.status,416);
 const head=await mediaResponse(file,new Request('http://localhost/video',{method:'HEAD'}));assert.equal(head.headers.get('accept-ranges'),'bytes');assert.equal(await head.text(),'');
 assert.equal(byteRange('bytes=5-3',16),null);assert.equal(byteRange('bytes=0-1,3-4',16),null);
});
test('play waits for seek completion and an old request can be canceled',async()=>{
 class Video extends EventTarget{readyState=1;seeking=false;time=0;get currentTime(){return this.time;}set currentTime(t){this.seeking=true;setTimeout(()=>{this.time=t;this.seeking=false;this.readyState=2;this.dispatchEvent(new Event('seeked'));},20);}}
 const v=new Video();let ready=false;const done=seekReady(v,45).then(()=>{ready=true;});assert.equal(ready,false);assert.equal(v.currentTime,0);await done;assert.equal(v.currentTime,45);
 const abort=new AbortController(),pending=seekReady(v,20,abort.signal);abort.abort();await assert.rejects(pending,/canceled/);
});
test('nine presets anchor text at distinct positions',()=>{
 const positions=Titles.positions.filter(p=>p!=='custom'),points=positions.map(p=>Titles.anchor(p,200,100,1920,1080));assert.equal(new Set(points.map(p=>JSON.stringify(p))).size,9);
 assert.ok(Math.abs(Titles.anchor('top-right',200,100,1920,1080).x-1604.8)<.001);assert.deepEqual(Titles.anchor('middle-center',200,100,1920,1080),{x:860,y:490});
});
test('named templates retain every text, time, font and position across restart',()=>{
 const dir=fs.mkdtempSync(path.join(root,'presets-'));
 const list=[Titles.create({title:'الأول',titleStart:2,titleDuration:4,font:'Tahoma',position:'top-right'}),Titles.create({title:'الثاني',titleStart:12,titleDuration:3,position:'custom',textX:23.4,textY:61.2,template:'card'})];
 const first=new TemplateStore(dir).save('ترتيب الألعاب',list),loaded=new TemplateStore(dir).list();assert.deepEqual(loaded[0].titles,list);assert.equal(loaded[0].name,'ترتيب الألعاب');
 loaded[0].titles[0].title='تعديل محلي';assert.equal(new TemplateStore(dir).list()[0].titles[0].title,'الأول');new TemplateStore(dir).save('قالب ثاني',list);assert.equal(new TemplateStore(dir).list().length,2);assert.ok(first.entry.id);
});
test('the previous single title template remains available after migration',()=>{
 const dir=fs.mkdtempSync(path.join(root,'legacy-'));fs.writeFileSync(path.join(dir,'template.json'),JSON.stringify({title:'قديم',titleStart:'4',titleDuration:'7',position:'right'}));
 const store=new TemplateStore(dir),old=store.list()[0];assert.equal(old.titles[0].titleStart,4);assert.equal(old.titles[0].position,'right');store.save('جديد',[Titles.create()]);assert.equal(store.list()[0].titles[0].title,'قديم');
});

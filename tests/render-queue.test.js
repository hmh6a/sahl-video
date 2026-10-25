const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {RenderQueue}=require('../app/render-queue'),{startExport}=require('../app/export-job');
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(t){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-queue-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));return {folder,queue:new RenderQueue(path.join(folder,'settings.json'))};}
test('FIFO, cancellation, output reservations and persistent limits across restart',async t=>{
 const {folder,queue}=fixture(t),positions=[];
 const a=queue.acquire(path.join(folder,'a.mp4')),b=queue.acquire(path.join(folder,'b.mp4'),p=>positions.push(p.position)),c=queue.acquire(path.join(folder,'c.mp4'));
 assert.equal(await a.ready,true);assert.equal(b.state,'queued');assert.equal(c.state,'queued');assert.deepEqual(positions,[1,1]);
 assert.throws(()=>queue.acquire(path.join(folder,'a.mp4')),/محجوز/);
 assert.equal(b.cancel(),true);assert.equal(await b.ready,false);a.release();assert.equal(await c.ready,true);
 queue.setLimit(2);const d=queue.acquire(path.join(folder,'d.mp4'));assert.equal(await d.ready,true);
 queue.setLimit(1);const e=queue.acquire(path.join(folder,'e.mp4'));assert.equal(e.state,'queued');c.release();assert.equal(e.state,'queued');d.release();assert.equal(await e.ready,true);e.release();
 queue.setLimit(3);assert.equal(new RenderQueue(queue.file).limit,3);
 for(const limit of [0,5,1.5,'2',NaN])assert.throws(()=>queue.setLimit(limit));
 assert.equal(queue.limit,3);
});
test('exports do not spawn while queued, cancel independently, preserve targets and release slots on failure',async t=>{
 const {folder,queue}=fixture(t),children=[],completed=[],updates=[];
 function start(name){
  const work=fs.mkdtempSync(path.join(folder,'work-')),tempOutput=path.join(folder,name+'.tmp'),output=path.join(folder,name+'.mp4');
  return startExport({queue,ffmpeg:'mock',args:[],work,tempOutput,output,duration:60,notify:p=>updates.push({name,...p}),onComplete:r=>completed.push({name,...r}),spawnFn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.signalCode=null;child.kill=()=>{child.emit('close',-1);return true;};child.succeed=()=>{fs.writeFileSync(tempOutput,'video');child.emit('close',0);};children.push(child);return child;}});
 }
 const a=start('a'),b=start('b');await flush();assert.equal(children.length,1);assert.ok(updates.some(p=>p.name==='b'&&p.phase==='queued'));
 await b.cancel();assert.equal(children.length,1);assert.equal(completed.find(r=>r.name==='b').canceled,true);
 fs.writeFileSync(path.join(folder,'a.mp4'),'original');await a.cancel();assert.equal(fs.readFileSync(path.join(folder,'a.mp4'),'utf8'),'original');
 const c=start('c'),d=start('d');await flush();children[1].emit('error',new Error('GPU unavailable'));await c.done;await flush();assert.equal(children.length,3);assert.match(completed.find(r=>r.name==='c').error,/GPU unavailable/);
 children[2].succeed();const result=await d.done;assert.equal(result.timing.phase,'complete');assert.ok(result.timing.elapsedSeconds>=0);assert.equal(fs.readFileSync(result.path,'utf8'),'video');assert.equal(queue.jobs.length,0);
 assert.equal(fs.readdirSync(folder).some(n=>n.startsWith('work-')),false);
});
test('increasing the limit starts waiting jobs; spawn failure and cancellation before spawn free their slots',async t=>{
 const {folder,queue}=fixture(t);const a=queue.acquire(path.join(folder,'a')),b=queue.acquire(path.join(folder,'b'));
 queue.setLimit(2);assert.equal(await b.ready,true);a.release();b.release();
 const work=fs.mkdtempSync(path.join(folder,'work-'));const result=await startExport({queue,work,tempOutput:path.join(folder,'temp'),output:path.join(folder,'out'),duration:2,notify(){},onComplete(){},spawnFn(){throw Error('spawn failed');}}).done;
 assert.match(result.error,/spawn failed/);assert.equal(queue.jobs.length,0);
 const next=startExport({queue,work:fs.mkdtempSync(path.join(folder,'work-')),tempOutput:path.join(folder,'temp'),output:path.join(folder,'out'),duration:2,notify(){},onComplete(){},spawnFn(){assert.fail('must not spawn');}});
 await next.cancel();assert.equal((await next.done).canceled,true);assert.equal(queue.jobs.length,0);
});
test('public queue snapshots track progress and reordered positions without moving running exports',async t=>{
 const {folder,queue}=fixture(t),snapshots=[];queue.onChange=s=>snapshots.push(s);
 const a=queue.acquire(path.join(folder,'a'),()=>{},{name:'مشروع أ',encoder:'NVIDIA'}),b=queue.acquire(path.join(folder,'b')),c=queue.acquire(path.join(folder,'c'));
 a.update({percent:42.7,elapsedSeconds:30,remainingSeconds:40,phase:'rendering'});
 const snapshot=queue.snapshot();assert.equal(snapshot.jobs[0].name,'مشروع أ');assert.equal(snapshot.jobs[0].percent,42.7);assert.equal(snapshot.jobs[0].encoder,'NVIDIA');assert.equal(JSON.stringify(snapshot).includes('resolve'),false);
 assert.deepEqual(snapshot.jobs.map(j=>j.position),[null,1,2]);
 queue.move(c.id,'up');assert.deepEqual(queue.snapshot().jobs.map(j=>j.id),[a.id,c.id,b.id]);assert.deepEqual(queue.snapshot().jobs.map(j=>j.position),[null,1,2]);
 queue.move(c.id,'down');assert.deepEqual(queue.snapshot().jobs.map(j=>j.id),[a.id,b.id,c.id]);queue.move(c.id,'up');
 assert.throws(()=>queue.move(a.id,'down'));assert.throws(()=>queue.move('missing','up'));assert.throws(()=>queue.move(b.id,'invalid'));
 a.release();assert.equal(await c.ready,true);assert.equal(b.state,'queued');assert.throws(()=>queue.move(c.id,'up'));
 c.release();assert.equal(await b.ready,true);b.release();assert.equal(queue.snapshot().jobs.length,0);
 assert.ok(snapshots.every((s,i)=>!i||s.revision>snapshots[i-1].revision));
});
test('global cancel targets the correct process and restores controls on kill failure',async t=>{
 const {folder,queue}=fixture(t),children=[];
 const create=name=>startExport({queue,work:fs.mkdtempSync(path.join(folder,'work-')),tempOutput:path.join(folder,name+'.tmp'),output:path.join(folder,name),name,encoder:'CPU',duration:60,notify(){},onComplete(){},spawnFn(){const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.exitCode=null;c.signalCode=null;c.kill=()=>false;children.push(c);return c;}});
 const a=create('first'),b=create('second');await flush();const [first,second]=queue.snapshot().jobs;
 await queue.cancelExport(second.id);assert.equal((await b.done).canceled,true);assert.equal(queue.snapshot().jobs.length,1);assert.equal(children.length,1);
 const failed=await queue.cancelExport(first.id);assert.ok(failed.error);assert.equal(queue.snapshot().jobs[0].canceling,false);
 children[0].kill=()=>{children[0].emit('close',-1);return true;};await queue.cancelExport(first.id);assert.equal((await a.done).canceled,true);assert.equal(queue.snapshot().jobs.length,0);
 assert.deepEqual(await queue.cancelExport(first.id),{notRunning:true});
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {ThumbnailQueue,PreviewState}=require('../app/media-loading'),{seekReady}=require('../app/playback'),{MediaLibrary}=require('../app/library');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('the initial zero-second preview waits for a decoded frame, not just metadata',async()=>{
 const video=new EventTarget();Object.assign(video,{readyState:1,seeking:false,currentTime:0});let ready=false;
 const pending=seekReady(video,0).then(()=>ready=true);await flush();assert.equal(ready,false);
 video.readyState=2;video.dispatchEvent(new Event('loadeddata'));await pending;assert.equal(ready,true);
});
test('waiting for initial video data can fail or be canceled without a late completion',async()=>{
 for(const abort of [true,false]){
  const video=new EventTarget();Object.assign(video,{readyState:1,seeking:false,currentTime:0});const controller=new AbortController(),pending=seekReady(video,0,controller.signal);
  const rejected=assert.rejects(pending,abort?/canceled/:/قراءة/);if(abort)controller.abort();else video.dispatchEvent(new Event('error'));await rejected;
  video.readyState=2;video.dispatchEvent(new Event('loadeddata'));
 }
});
test('preview loading preserves elapsed time across scrubbing and ignores stale completions',()=>{
 let time=1000,clock,stopped=0;const states=[],preview=new PreviewState(s=>states.push(s),{now:()=>time,setIntervalFn:fn=>(clock=fn,1),clearIntervalFn:()=>stopped++});
 const old=preview.start('first');time+=3000;clock();assert.equal(states.at(-1).elapsed,3);
 const latest=preview.start('second');assert.equal(states.at(-1).elapsed,3);preview.ready(old);assert.equal(preview.phase,'loading');preview.fail(old,'old error');assert.equal(preview.phase,'loading');
 preview.ready(latest);assert.equal(preview.phase,'ready');assert.ok(stopped>=2);
 time+=5000;const next=preview.start();assert.equal(states.at(-1).elapsed,0);preview.cancel();preview.fail(next,'late');assert.equal(preview.phase,'idle');
 const retry=preview.start();preview.fail(retry,'try again');assert.equal(states.at(-1).error,'try again');assert.equal(preview.phase,'error');
});
test('thumbnails pause for playback, deduplicate, discard offscreen jobs, and run one at a time',async()=>{
 const queue=new ThumbnailQueue(),calls=[],first=deferred(),second=deferred();queue.setPaused(true);
 const a=queue.request('a',()=>{calls.push('a');return first.promise;});assert.equal(queue.request('a',()=>{throw Error('duplicate');}),a);
 const dropped=queue.request('offscreen',()=>{throw Error('obsolete decode');});const b=queue.request('b',()=>{calls.push('b');return second.promise;});
 queue.retain('timeline',new Set(['a','b']));assert.equal(await dropped,null);await flush();assert.deepEqual(calls,[]);
 queue.setPaused(false);await flush();assert.deepEqual(calls,['a']);first.resolve('frame a');await a;await flush();assert.deepEqual(calls,['a','b']);second.resolve('frame b');assert.equal(await b,'frame b');
 assert.equal(await queue.request('a',()=>{throw Error('cached');}),'frame a');
});
test('clearing a project prevents old thumbnails from entering the new cache and failed jobs are retryable',async()=>{
 const queue=new ThumbnailQueue(),old=deferred();const pending=queue.request('same',()=>old.promise);await flush();queue.clear();assert.equal(await pending,null);
 const fresh=queue.request('same',()=>Promise.resolve('new'));old.resolve('old');assert.equal(await fresh,'new');
 assert.equal(await queue.request('bad',()=>{throw Error('decode');}),null);assert.equal(await queue.request('bad',()=>Promise.resolve('retry')),'retry');
});
test('a requested preview has a reserved decoder slot while thumbnails are queued',async()=>{
 const calls=[],jobs=[];const library=new MediaLibrary('ffmpeg','ffprobe',{createFrames:()=>({setSource(){},get(t,width){calls.push({t,width});const d=deferred();jobs.push(d);return d.promise;}})});
 library.assets.a={id:'a',path:'/fixture.mp4',kind:'video',meta:{duration:60}};
 const first=library.frame('a',1,176),second=library.frame('a',2,176);assert.equal(library.frame('a',1,176),first);assert.equal(calls.length,1);
 const preview=library.frame('a',20,960);assert.deepEqual(calls,[{t:1,width:176},{t:20,width:960}]);jobs[1].resolve('preview');assert.equal(await preview,'preview');await flush();assert.equal(calls.length,2);
 jobs[0].resolve('first');await first;await flush();assert.equal(calls.length,3);jobs[2].resolve('second');assert.equal(await second,'second');
});
test('import progress reports file position and name even when one file fails',async()=>{
 const library=new MediaLibrary('ffmpeg','ffprobe'),progress=[];
 library.inspect=async file=>{if(file.endsWith('bad.mp4'))throw Error('invalid media');return {id:file,path:file,kind:'video',name:file.split('/').at(-1),meta:{duration:1}};};
 const result=await library.import(['/one.mp4','/bad.mp4','/three.mp4'],p=>progress.push(p));
 assert.deepEqual(progress.map(p=>[p.index,p.count,p.name]),[[1,3,'one.mp4'],[2,3,'bad.mp4'],[3,3,'three.mp4']]);assert.equal(result.assets.length,2);assert.equal(result.errors.length,1);
});

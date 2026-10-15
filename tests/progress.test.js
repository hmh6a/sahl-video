const {test}=require('node:test'),assert=require('node:assert/strict');const {ExportProgress}=require('../app/export-progress');
test('export clock measures only processing time, estimates remaining work and adapts when speed changes',()=>{
 let now=100000;const p=new ExportProgress(100,{now:()=>now});assert.equal(p.snapshot().elapsedSeconds,0);assert.equal(p.snapshot().remainingSeconds,null);
 now+=10000;let s=p.update(10);assert.equal(s.elapsedSeconds,10);assert.equal(s.percent,10);assert.equal(s.remainingSeconds,90);
 for(let i=1;i<=4;i++){now+=10000;s=p.update(10+i*20);}assert.equal(s.elapsedSeconds,50);assert.equal(s.remainingSeconds,5);assert.equal(s.percent,90);
 now+=1000;s=p.update(100);assert.equal(s.phase,'finalizing');assert.equal(s.percent,99);assert.equal(s.remainingSeconds,null);now+=3000;assert.deepEqual(p.finish(true),{percent:100,elapsedSeconds:54,remainingSeconds:0,phase:'complete'});
 const next=new ExportProgress(20,{now:()=>now});assert.equal(next.snapshot().elapsedSeconds,0);
});
test('missing, nonfinite, backward and stalled encoder progress never produces a misleading zero ETA or success',()=>{
 let now=0;const p=new ExportProgress(60,{now:()=>now});now=2000;assert.equal(p.update(1).remainingSeconds,null);now=5000;assert.ok(p.update(10).remainingSeconds>0);const percent=p.snapshot().percent;
 for(const value of [NaN,-1,5])assert.equal(p.update(value).percent,percent);now=22000;const stalled=p.snapshot();assert.equal(stalled.remainingSeconds,null);assert.equal(stalled.elapsedSeconds,22);assert.equal(p.finish(false).phase,'stopped');assert.ok(p.finish(false).percent<100);now=23000;assert.ok(p.update(15).remainingSeconds>0);
});

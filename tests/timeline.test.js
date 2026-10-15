const {test}=require('node:test'),assert=require('node:assert/strict');
const TL=require('../app/timeline');
test('split then delete middle preserves exact remaining source ranges',()=>{
 let clips=[{start:0,end:10,transition:'none'}];clips=TL.split(clips,3).clips;clips=TL.split(clips,7).clips;
 assert.deepEqual(clips.map(c=>[c.start,c.end]),[[0,3],[3,7],[7,10]]);
 clips=TL.remove(clips,1);assert.equal(TL.duration(clips),6);assert.equal(TL.locate(clips,3.5).source,7.5);
 assert.equal(TL.split(clips,3),null);assert.equal(TL.split(clips,.01),null);
});
test('transition stays on original outgoing boundary after splitting',()=>{
 const c=[{start:0,end:3,transition:'fade'},{start:5,end:8,transition:'none'}];
 const result=TL.split(c,1).clips;assert.equal(result[0].transition,'none');assert.equal(result[1].transition,'fade');
 assert.equal(TL.remove(result,1)[0].transition,'none');
});
test('fade fits short clips and timeline can be emptied safely',()=>{
 const c=[{start:0,end:.2,transition:'fade'},{start:1,end:1.2,transition:'none'}];
 assert.ok(TL.fadeLength(c,0)<=.1);assert.equal(TL.gain(c,.2),0);
 assert.deepEqual(TL.remove([{start:0,end:2}],0),[]);assert.equal(TL.locate([],0),null);
 assert.throws(()=>TL.validate({duration:10},{clips:[]}));
});

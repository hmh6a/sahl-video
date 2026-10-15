const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../app/title-model');
test('title has an independent start, end and preview fade matching export',()=>{
 const t=T.timing(20,8,4);assert.equal(t.end,12);assert.equal(T.opacity(7,t),0);assert.equal(T.opacity(9,t),1);assert.equal(T.opacity(12,t),0);
 assert.equal(T.timing(10,8,6).duration,2);assert.equal(T.timing(5,8,4).duration,0);assert.throws(()=>T.timing(10,-1,4));assert.throws(()=>T.timing(10,0,NaN));
});
test('title dragging and resizing stay inside timeline with minimum readable duration',()=>{
 assert.deepEqual(T.move(2,3,-5,10),{start:0,duration:3});assert.deepEqual(T.move(2,3,20,10),{start:7,duration:3});
 assert.deepEqual(T.resize(2,3,-4,'start',10),{start:0,duration:5});assert.deepEqual(T.resize(2,3,20,'end',10),{start:2,duration:8});
 assert.ok(Math.abs(T.resize(2,3,9,'start',10).duration-.1)<1e-9);assert.equal(T.resize(2,3,-9,'end',10).duration,.1);
 assert.deepEqual(T.place(3800,-100,600,200,3840,2160),{x:3240,y:0});
});

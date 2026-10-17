const {test}=require('node:test'),assert=require('node:assert/strict');
const Resolution=require('../app/resolution'),Project=require('../app/project'),{exportArgs}=require('../app/export');
const meta=(width,height)=>({width,height,fps:'30',duration:1,audio:false});

test('export choices contain source and only smaller resolutions, including 8K, portrait and low resolution',()=>{
 for(const [width,height,expected] of [
  [1920,1080,['source','720','480','360','240']],
  [3840,2160,['source','1440','1080','720','480','360','240']],
  [7680,4320,['source','2160','1440','1080','720','480','360','240']],
  [1080,1920,['source','720','480','360','240']],
  [2560,1080,['source','720','480','360','240']],
  [640,360,['source','240']],
  [320,180,['source']]
 ]){
  const source=meta(width,height),choices=Resolution.choices(source);
  assert.deepEqual(choices.map(o=>o.value),expected);
  assert.ok(choices[0].label.includes(`${width} × ${height}`));
  for(const choice of choices){const size=Project.outputSize(source,choice.value);assert.ok(size.width<=width&&size.height<=height);}
 }
 assert.deepEqual(Resolution.choices(null).map(o=>o.value),['source']);
});
test('export rejects an upscale and keeps original and portrait dimensions',()=>{
 assert.throws(()=>exportArgs('input.mp4',null,'out.mp4',meta(1920,1080),{start:0,end:1,resolution:'2160'}),/أعلى/);
 assert.deepEqual(Project.outputSize(meta(7680,4320),'source'),{width:7680,height:4320});
 assert.deepEqual(Project.outputSize(meta(1080,1920),'720'),{width:720,height:1280});
 assert.deepEqual(Project.outputSize(meta(1921,1081),'source'),{width:1922,height:1082});
 assert.throws(()=>Project.outputSize(meta(1920,1080),'invalid'),/صحيحة/);
});
test('saved upscale settings migrate to source while valid lower settings survive restoration',()=>{
 const source=meta(1920,1080);
 for(const resolution of ['2160','1080'])assert.equal(Project.state({meta:source,resolution},{}).resolution,'source');
 assert.equal(Project.state({meta:source,resolution:'720'},{}).resolution,'720');
 assert.equal(Project.state({meta:meta(7680,4320),resolution:'2160'},{}).resolution,'2160');
});

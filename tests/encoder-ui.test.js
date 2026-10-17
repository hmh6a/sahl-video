const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function loadEncoders(list,previous='gpu-auto',fail=false){
 const elements=new Map();let updates=0;
 const $=id=>{
  if(!elements.has(id))elements.set(id,{value:id==='encoder'?previous:'',options:[],add(option){this.options.push(option);},replaceChildren(){this.options=[];},addEventListener(){}});
  return elements.get(id);
 };
 $('encoder').options=[{value:'gpu-auto'},{value:'cpu'}];
 const sandbox={$,window:{sahl:{encoders:async()=>{if(fail)throw Error('IPC failed');return list;},fonts:async()=>[]}},Option:class{constructor(text,value){this.text=text;this.value=value;}},ResizeObserver:class{observe(){}},layoutCanvas(){},changed(){},updateButtons(){updates++;}};
 vm.runInNewContext(fs.readFileSync('app/studio.js','utf8'),sandbox);
 await new Promise(resolve=>setImmediate(resolve));
 return {encoder:$('encoder'),note:$('encoder-note').textContent,updates,sandbox,$};
}
test('Mac hardware is selected automatically while an explicit CPU selection is preserved',async()=>{
 const devices=[{id:'h264_videotoolbox',name:'Apple · VideoToolbox'}];
 const selected=await loadEncoders(devices);assert.equal(selected.encoder.value,'h264_videotoolbox');assert.match(selected.note,/VideoToolbox/);assert.ok(selected.updates>0);
 assert.equal((await loadEncoders(devices,'cpu')).encoder.value,'cpu');
});
test('missing hardware or failed detection leaves CPU export available',async()=>{
 for(const fail of [false,true]){
  const result=await loadEncoders([],'gpu-auto',fail);assert.equal(result.encoder.value,'cpu');assert.ok(result.encoder.options.some(o=>o.value==='cpu'));assert.ok(result.updates>0);
 }
});

test('HDR explanation and actual CPU fallback follow timeline media and encoder support',async()=>{
 for(const hdrEncoder of [undefined,'hevc_videotoolbox']){
  const result=await loadEncoders([{id:'h264_videotoolbox',name:'Apple',hdrEncoder}]);
  Object.assign(result.sandbox,{clips:[{hdr:true}],assetFor:c=>c});result.sandbox.updateExportColor();
  assert.equal(result.$('export-color-note').hidden,false);assert.match(result.$('export-format').textContent,/HDR.*10-bit/);
  assert.match(result.$('encoder-note').textContent,hdrEncoder?/بطاقة الرسومات: Apple/:/CPU تلقائياً/);
  result.sandbox.clips=[];result.sandbox.updateExportColor();assert.equal(result.$('export-color-note').hidden,true);assert.doesNotMatch(result.$('export-format').textContent,/HDR/);
 }
});
test('export information shows actual output size and CPU fallback instead of the selected unsupported HDR GPU',async()=>{
 const result=await loadEncoders([{id:'h264_videotoolbox',name:'Apple'}]);
 Object.assign(result.sandbox,{clips:[{hdr:true}],assetFor:c=>c,meta:{width:3840,height:2160,fps:'60'},SahlResolution:require('../app/resolution'),fps:Number,total:()=>60,seconds:()=> '01:00'});
 result.$('resolution').value='1080';result.$('quality').selectedOptions=[{textContent:'أعلى — ملف أكبر'}];
 const info=result.sandbox.exportSnapshot();assert.equal(info.resolution,'1920 × 1080');assert.equal(info.encoder,'المعالج CPU');assert.equal(info.fps,'60.00 fps');assert.equal(info.format,'MP4 · HEVC · HDR 10-bit');
 result.sandbox.clips=[];assert.equal(result.sandbox.exportSnapshot().encoder,'Apple');assert.equal(result.sandbox.exportSnapshot().format,'MP4 · H.264 · SDR');
});

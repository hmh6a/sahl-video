const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function view(reduced=false){
 const nodes=new Map(),animations=[];
 const $=id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{id,hidden:false,textContent:'',value:'',open:true,scrollTop:200,
    classList:{contains:c=>classes.has(c),toggle(c,active){active?classes.add(c):classes.delete(c);}},
    focus(){sandbox.focused=id;},animate(frames,options){const a={frames,options,cancel(){this.canceled=true;}};animations.push(a);return a;}});
  }
  return nodes.get(id);
 };
 const sandbox={$,window:{matchMedia:()=>({matches:reduced})},seconds:n=>'00:'+String(Math.floor(n||0)).padStart(2,'0')};
 vm.createContext(sandbox);
 for(const file of ['export-timing.js','export-view.js'])vm.runInContext(fs.readFileSync('app/'+file,'utf8'),sandbox);
 return {$,sandbox,animations,start:details=>sandbox.setExportPresentation(true,details),stop:()=>sandbox.setExportPresentation(false)};
}
const details={resolution:'3840 × 2160',fps:'60.00 fps',duration:'01:00',encoder:'Apple · VideoToolbox',quality:'أعلى — ملف أكبر',format:'MP4 · HEVC · HDR 10-bit'};
test('export presents a frozen information snapshot and restores selections across repeated cancel/retry cycles',()=>{
 const v=view();v.$('quality').value='maximum';v.$('encoder').value='h264_videotoolbox';v.$('resolution').value='source';
 for(let i=0;i<3;i++){
  v.start(details);assert.equal(v.$('export-settings').hidden,true);assert.equal(v.$('export-activity').hidden,false);assert.equal(v.$('export-details').hidden,false);assert.equal(v.$('render-resolution').textContent,'3840 × 2160');assert.equal(v.$('render-format').textContent,details.format);assert.equal(v.sandbox.focused,'export-activity');assert.equal(v.$('export-dialog').scrollTop,0);
  v.sandbox.showExportTiming({elapsedSeconds:12,remainingSeconds:30,phase:'rendering'});assert.equal(v.$('export-elapsed').textContent,'00:12');
  v.stop();assert.equal(v.$('export-settings').hidden,false);assert.equal(v.$('export-activity').hidden,true);assert.equal(v.$('export-details').hidden,true);assert.equal(v.$('export-timing').hidden,true);assert.equal(v.$('export-elapsed').textContent,'00:00');assert.equal(v.sandbox.focused,'export');
  assert.equal(v.$('quality').value,'maximum');assert.equal(v.$('encoder').value,'h264_videotoolbox');assert.equal(v.$('resolution').value,'source');
 }
 assert.ok(v.animations[0].canceled,'canceling must stop an unfinished entry animation');
});
test('reduced motion keeps the same usable export and cancellation states without animations',()=>{
 const v=view(true);v.start({...details,encoder:'المعالج CPU'});assert.equal(v.$('render-encoder').textContent,'المعالج CPU');v.stop();assert.equal(v.animations.length,0);assert.equal(v.$('export-settings').hidden,false);
});

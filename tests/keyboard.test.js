const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Exercise the real keyboard handler with DOM focus and editor actions controlled.
function keyboard(){
 const source=fs.readFileSync('app/editor.js','utf8'),start=source.indexOf("document.addEventListener('keydown',e=>{"),end=source.indexOf('let renderStarted=',start),calls=[];
 let handler;const sandbox={busy:false,meta:{fps:30},clips:[{}],unsupported:false,cursor:2,razor:true,
  document:{querySelector:()=>false,addEventListener:(name,fn)=>handler=fn},
  $:id=>({click:()=>calls.push(id)}),saveCurrentProject:as=>calls.push(['save',as]),openSavedProject:()=>calls.push('open'),openExport:()=>calls.push('export'),undo:()=>calls.push('undo'),redo:()=>calls.push('redo'),deleteSelected:()=>calls.push('delete'),splitHere:()=>calls.push('split'),pause:()=>calls.push('pause'),fps:()=>30,total:()=>10,seekTo:t=>calls.push(['seek',t]),updateButtons:()=>calls.push('buttons')};
 vm.runInNewContext(source.slice(start,end),sandbox);
 function press(key,options={}){const e={key,code:key===' '?'Space':key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,target:{tagName:'DIV',isContentEditable:false,closest:()=>null},preventDefault(){this.prevented=true;},...options};handler(e);return e;}
 return {press,calls,sandbox};
}
test('Mac and Windows shortcuts save, import, export, undo and redo consistently',()=>{
 for(const modifier of ['metaKey','ctrlKey']){
  const k=keyboard(),mod={[modifier]:true};
  k.press('s',mod);k.press('S',{...mod,shiftKey:true});k.press('o',mod);k.press('i',mod);k.press('E',{...mod,shiftKey:true});k.press('z',mod);k.press('Z',{...mod,shiftKey:true});k.press('y',mod);
  assert.deepEqual(k.calls,[['save',false],['save',true],'open','choose','export','undo','redo','redo']);
 }
});
test('editing text, composing, open dialogs and busy exports never trigger timeline shortcuts',()=>{
 const k=keyboard();
 for(const tagName of ['INPUT','TEXTAREA','SELECT'])for(const key of ['s','Delete',' ','z'])k.press(key,{ctrlKey:key==='z',target:{tagName,closest:()=>null}});
 k.press('Delete',{target:{tagName:'DIV',isContentEditable:true,closest:()=>null}});k.press('s',{isComposing:true});k.press('s',{altKey:true});
 k.sandbox.busy=true;k.press('s');k.sandbox.busy=false;k.sandbox.document.querySelector=()=>({open:true});k.press('s',{metaKey:true});
 assert.deepEqual(k.calls,[]);
});
test('frame navigation, one-second jumps, fit, and razor selection work without stealing control navigation',()=>{
 const k=keyboard();k.press('ArrowRight');k.press('ArrowLeft',{shiftKey:true});k.press('Home');k.press('End');k.press('f');k.press('c');k.press('v');k.press(' ');
 assert.deepEqual(k.calls,['pause',['seek',2+1/30],'pause',['seek',1],'pause',['seek',0],'pause',['seek',10],'fit-timeline','razor','buttons','play']);assert.equal(k.sandbox.razor,false);
 k.calls.length=0;for(const key of ['ArrowLeft','ArrowRight','Home','End',' '])assert.equal(k.press(key,{target:{tagName:'BUTTON',closest:()=>({})}}).prevented,undefined);
 assert.deepEqual(k.calls,[]);
});

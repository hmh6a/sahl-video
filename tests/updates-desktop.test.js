const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const requireApp=createRequire(path.resolve('app/main.js'));
async function desktop(t){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-update-ipc-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const handlers=new Map(),answers=[],saved=[];let service;
 class FakeUpdates{constructor(){service=this;this.downloaded=false;this.available={version:'1.0.1'};this.installs=0;this.state={phase:'available'};}status(){return this.state;}emit(s){return this.state=s;}async download(){this.downloaded=true;return this.emit({phase:'downloaded'});}install(){this.installs++;return this.emit({phase:'installing'});}cancel(){}}
 class Window extends EventEmitter{constructor(){super();this.webContents={send(){},on(){},setWindowOpenHandler(){}};}setTitle(){}loadFile(){}isDestroyed(){return false;}}
 const electron={app:{isPackaged:true,whenReady:()=>Promise.resolve(),on(){},getPath:()=>folder,quit(){}},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},dialog:{showMessageBox:async()=>({response:answers.shift()??2}),showSaveDialog:async()=>{saved.push(true);return {canceled:true};}},shell:{showItemInFolder(){throw Error('Must never open an installer file');}},protocol:{registerSchemesAsPrivileged(){},handle(){}}};
 const context=vm.createContext({require:name=>name==='electron'?electron:name==='./updates'?{Updates:FakeUpdates}:name==='./encoding'?{detectEncoders:async()=>[]}:requireApp(name),__dirname:path.resolve('app'),console,Response,URL,Buffer,AbortController,setInterval:()=>({unref(){}}),clearInterval(){}});
 vm.runInContext(fs.readFileSync('app/main.js','utf8'),context);await new Promise(r=>setImmediate(r));
 return {service,answers,saved,context,call:(name,...args)=>handlers.get(name)({},...args)};
}
test('update now downloads internally and installs without asking for an EXE location',async t=>{
 const d=await desktop(t);assert.equal((await d.call('download-update')).phase,'installing');assert.equal(d.service.installs,1);assert.equal(d.saved.length,0);
});
test('installation waits for active exports and respects unsaved project cancellation',async t=>{
 const d=await desktop(t);d.service.downloaded=true;
 vm.runInContext('active={};',d.context);assert.equal((await d.call('install-update')).phase,'downloaded');assert.equal(d.service.installs,0);
 vm.runInContext('active=null;dirty=true;projectState={};',d.context);d.answers.push(2);await d.call('install-update');assert.equal(d.service.installs,0);
 d.answers.push(0);await d.call('install-update');assert.equal(d.saved.length,1);assert.equal(d.service.installs,0,'canceling save must cancel install');
 d.answers.push(1);assert.equal((await d.call('install-update')).phase,'installing');assert.equal(d.service.installs,1);
});

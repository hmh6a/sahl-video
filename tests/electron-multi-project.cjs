// Real Electron windows, IPC, isolated media protocols and CPU encoders; no user files.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const folder=fs.mkdtempSync(path.resolve('test-output/multi-project-')),windows=[],errors=[],saves=[];
process.on('uncaughtException',async error=>{console.error(error);for(const win of windows)if(!win.isDestroyed())try{await win.webContents.executeJavaScript('sahl.cancel()');}catch{}app.exit(1);});
app.setPath('userData',path.join(folder,'profile'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const timeout=setTimeout(()=>{console.error('Multi-project QA timed out');app.exit(1);},90000);
class TestWindow extends BrowserWindow{
 constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,backgroundThrottling:false,offscreen:true}});windows.push(this);this.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});}
}
const dialogs={showOpenDialog:async()=>({filePaths:[path.resolve('test-output/photo.png')]}),showSaveDialog:async()=>({filePath:saves.shift()}),showMessageBox:async()=>({response:1})};
const requireApp=createRequire(path.resolve('app/main.js'));
vm.runInNewContext(fs.readFileSync('app/main.js','utf8'),{require:name=>name==='electron'?{...electron,BrowserWindow:TestWindow,dialog:dialogs}:name==='./encoding'?{detectEncoders:async()=>[]}:requireApp(name),__dirname:path.resolve('app'),console,URL,Response,Buffer,AbortController,setInterval,clearInterval});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await wait(100);}throw Error('Condition timed out');}
const js=(win,source)=>win.webContents.executeJavaScript(source,true);
async function ready(win){await until(()=>js(win,"typeof newProjectWindow==='function'&&document.readyState==='complete'"));}
async function setup(win){await ready(win);await js(win,`(async()=>{await $('choose-image').onclick();clips[0].end=3600;renderTimeline();titles=[];draw();window.testProgress=[];window.testComplete=[];sahl.onProgress(p=>testProgress.push(p));sahl.onComplete(p=>testComplete.push(p));})()`);}
app.whenReady().then(async()=>{
 try{
  await until(()=>windows.length===1);const a=windows[0];await setup(a);
  saves.push(path.join(folder,'a.mp4'));await js(a,"openExport();$('export').onclick()");
  await until(()=>js(a,"testProgress.some(p=>p.phase==='rendering')"));
  await js(a,"$('render-new-project').click()");await until(()=>windows.length===2);const b=windows[1];await setup(b);
  assert.notEqual(a.webContents.session,b.webContents.session);
  const assetA=await js(a,'assets[0].url');assert.equal(await js(b,`fetch(${JSON.stringify(assetA)}).then(r=>r.status)`),404,'media from the first project must be inaccessible in the second');
  // Direct template picker creates a title only on selection and preserves existing text/timing.
  await js(b,"$('choose-title-template').click()");assert.equal(await js(b,"$('text-template-dialog').open&&titles.length===0"),true);
  await wait(150);fs.writeFileSync(path.join(folder,'templates.png'),(await b.webContents.capturePage()).toPNG());
  await js(b,"document.querySelector('#template-picker-grid [data-template=neon]').click()");assert.equal(await js(b,"currentTitle().template==='neon'&&document.activeElement.id==='title'"),true);
  await js(b,"currentTitle().title='Keep this title';currentTitle().titleStart=2;fillTitleFields();$('nav-templates').click();document.querySelector('#template-picker-grid [data-template=card]').click()");
  assert.equal(await js(b,"currentTitle().title==='Keep this title'&&currentTitle().titleStart===2&&currentTitle().template==='card'"),true);
  await js(b,"$('layout-name').value='Saved layout';$('save-template').onclick()");
  await js(b,"currentTitle().title='Changed';fillTitleFields();$('choose-title-template').click();document.querySelector('#template-picker-layouts button').click()");
  assert.equal(await js(b,"currentTitle().title==='Keep this title'&&currentTitle().titleStart===2"),true);
  await js(b,"titlesLocked=true;$('choose-title-template').click()");assert.equal(await js(b,"[...document.querySelectorAll('#text-template-dialog .template-choice,#template-picker-layouts button')].every(button=>button.disabled)"),true);
  await js(b,"$('close-text-template').click();titlesLocked=false");
  b.setSize(1120,740);await wait(150);
  assert.equal(await js(b,'document.documentElement.scrollWidth<=innerWidth'),true,'toolbar must fit the minimum window width');
  b.setSize(1500,960);
  await js(b,"$('title').value='مشروع ثاني';$('add-text').click()");assert.equal(await js(a,'titles.length'),0);
  saves.push(path.join(folder,'b.mp4'));await js(b,"openExport();$('export').onclick()");
  await until(()=>js(b,"testProgress.some(p=>p.phase==='queued')"));
  assert.equal(await js(b,"testProgress.some(p=>p.phase==='rendering')"),false);
  assert.equal(await js(b,"$('cancel').disabled"),false);
  await wait(600);fs.writeFileSync(path.join(folder,'queued.png'),(await b.webContents.capturePage()).toPNG());
  // A third project lets us reorder from another window and cancel by stable job ID.
  await js(b,"$('render-new-project').click()");await until(()=>windows.length===3);const c=windows[2];await setup(c);
  saves.push(path.join(folder,'c.mp4'));await js(c,"openExport();$('export').onclick()");await until(()=>js(c,"testProgress.some(p=>p.phase==='queued')"));
  await js(c,"$('render-open-queue').click()");await until(()=>js(c,"document.querySelectorAll('.queue-job').length===3"));
  const state=await js(c,'sahl.renderQueue()'),idA=state.jobs[0].id,idB=state.jobs[1].id,idC=state.jobs[2].id;
  await js(c,`document.querySelector('[data-job-id="${idC}"] [data-action=up]').click()`);
  await until(()=>js(b,`sahl.renderQueue().then(s=>s.jobs[1].id==='${idC}'&&s.jobs[2].id==='${idB}')`));
  assert.equal(await js(b,"testProgress.at(-1).position"),2);
  await wait(300);fs.writeFileSync(path.join(folder,'queue-list.png'),(await c.webContents.capturePage()).toPNG());
  await js(b,"$('render-open-queue').click()");await until(()=>js(b,"document.querySelectorAll('.queue-job').length===3"));
  await js(b,`document.querySelector('[data-job-id="${idC}"] [data-action=cancel]').click()`);await until(()=>js(c,'testComplete.length===1'));
  assert.equal(await js(a,'testComplete.length'),0);assert.equal(await js(b,'testComplete.length'),0);
  c.close();await until(()=>c.isDestroyed());await js(b,"$('close-render-queue').click()");
  await js(b,"$('cancel').click()");await until(()=>js(b,'testComplete.length===1'));assert.equal(await js(a,'testComplete.length'),0);
  saves.push(path.join(folder,'b.mp4'));await js(b,"$('export').onclick()");await until(()=>js(b,"testProgress.filter(p=>p.phase==='queued').length>=2"));
  await js(b,"$('render-open-settings').click()");await until(()=>js(b,"$('render-settings-dialog').open"));
  await js(b,"$('render-limit').value='2';$('save-render-settings').click()");
  await until(()=>js(b,"testProgress.some(p=>p.phase==='rendering')"));
  assert.equal(await js(a,'sahl.renderSettings().then(s=>s.running)'),2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'profile','render-settings.json'))).limit,2);
  await wait(600);fs.writeFileSync(path.join(folder,'settings.png'),(await b.webContents.capturePage()).toPNG());
  await js(b,"$('close-render-settings').click();$('cancel').click()");await until(()=>js(b,'testComplete.length===2'));
  await js(b,"$('render-open-queue').click()");await until(()=>js(b,"document.querySelectorAll('.queue-job').length===1"));
  await js(b,`document.querySelector('[data-job-id="${idA}"] [data-action=cancel]').click()`);await until(()=>js(a,'testComplete.length===1'));
  await until(()=>js(b,"$('queue-empty').hidden===false"));await js(b,"$('close-render-queue').click()");
  // After the first project closes, routing, rendering and edits in the other stay usable.
  a.close();await until(()=>a.isDestroyed());
  await js(b,"$('export-dialog').close();clips[0].end=1;renderTimeline();titles=[];draw()");
  saves.push(path.join(folder,'complete.mp4'));await js(b,"openExport();$('export').onclick()");await until(()=>js(b,'testComplete.length===3'));
  assert.equal(await js(b,'testComplete[2].timing.phase'),'complete');assert.ok(fs.existsSync(path.join(folder,'complete.mp4')));
  assert.deepEqual(errors.filter(e=>!e.includes('404')),[]);console.log('PASS actual multi-project isolation, editing during render, FIFO wait, cancel, parallel setting and close independence. Screenshots:',folder);
  clearTimeout(timeout);b.close();await until(()=>b.isDestroyed());app.exit(0);
 }catch(e){console.error(e);for(const win of windows)if(!win.isDestroyed())try{await js(win,'sahl.cancel()');}catch{}clearTimeout(timeout);app.exit(1);}
});

// One real Electron window with live editor tabs, isolated media and CPU encoders.
const electron=require('electron'),{app,BrowserWindow,WebContentsView}=electron,fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const folder=fs.mkdtempSync(path.resolve('test-output/multi-project-')),windows=[],hosts=[],errors=[],saves=[],answers=[];
process.on('uncaughtException',async error=>{console.error(error);for(const win of windows)if(!win.isDestroyed())try{await win.webContents.executeJavaScript('sahl.cancel()');}catch{}app.exit(1);});
app.setPath('userData',path.join(folder,'profile'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const timeout=setTimeout(()=>{console.error('Multi-project QA timed out');app.exit(1);},90000);
class TestWindow extends BrowserWindow{
 constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,backgroundThrottling:false,offscreen:true}});hosts.push(this);this.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});}
}
class TestView extends WebContentsView{
 constructor(options){super({...options,webPreferences:{...options.webPreferences,offscreen:true}});windows.push(this);this.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});}
 isDestroyed(){return !this.webContents||this.webContents.isDestroyed();}
}
const dialogs={showOpenDialog:async(_,options)=>({filePaths:[path.resolve(options.title==='اختار صور'?'test-output/photo.png':'test-output/three-colors.mp4')]}),showSaveDialog:async()=>({filePath:saves.shift()}),showMessageBox:async()=>({response:answers.shift()??1})};
const requireApp=createRequire(path.resolve('app/main.js'));
vm.runInNewContext(fs.readFileSync('app/main.js','utf8'),{require:name=>name==='electron'?{...electron,BrowserWindow:TestWindow,WebContentsView:TestView,dialog:dialogs}:name==='./encoding'?{detectEncoders:async()=>[]}:requireApp(name),__dirname:path.resolve('app'),console,URL,Response,Buffer,AbortController,setInterval,clearInterval});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await wait(100);}throw Error('Condition timed out');}
const js=(win,source)=>win.webContents.executeJavaScript(source,true);
async function ready(win){await until(()=>js(win,"typeof newProjectTab==='function'&&document.readyState==='complete'"));}
async function setup(win){await ready(win);await js(win,`(async()=>{await $('choose-image').onclick();clips[0].end=3600;renderTimeline();titles=[];draw();window.testProgress=[];window.testComplete=[];sahl.onProgress(p=>testProgress.push(p));sahl.onComplete(p=>testComplete.push(p));})()`);}
app.whenReady().then(async()=>{
 try{
  await until(()=>windows.length===1);const a=windows[0];await setup(a);
  saves.push(path.join(folder,'a.mp4'));await js(a,"openExport();$('export').onclick()");
  await until(()=>js(a,"testProgress.some(p=>p.phase==='rendering')"));
  await js(a,"$('render-new-project').click()");await until(()=>windows.length===2);const b=windows[1];await setup(b);
  assert.equal(hosts.length,1,'all projects must share one native window');
  assert.notEqual(a.webContents.session,b.webContents.session);
  await until(()=>js(hosts[0],"document.querySelectorAll('[role=tab]').length===2"));
  const tabsAB=await js(hosts[0],'workspace.state()'),tabA=tabsAB.tabs[0].id,tabB=tabsAB.tabs[1].id;
  assert.equal(tabsAB.active,tabB);
  assert.equal(b.getVisible(),true);assert.equal(a.getVisible(),false);
  answers.push(0);assert.equal((await js(hosts[0],`workspace.close('${tabA}')`)).canceled,true);
  assert.equal(a.isDestroyed(),false,'declining to cancel keeps a rendering tab');
  await js(hosts[0],`workspace.select('${tabB}')`);
  assert.equal(await js(a,'testComplete.length'),0,'switching tabs must not interrupt rendering');
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
  hosts[0].setSize(1120,740);await wait(150);
  assert.equal(await js(b,'document.documentElement.scrollWidth<=innerWidth'),true,'toolbar must fit the minimum window width');
  hosts[0].setSize(1500,960);
  await js(b,"$('title').value='مشروع ثاني';$('add-text').click();seekTo(7);checkpoint();window.preserved=JSON.stringify({titles,cursor,history})");assert.equal(await js(a,'titles.length'),0);
  await js(hosts[0],`workspace.select('${tabA}')`);await js(hosts[0],`workspace.select('${tabB}')`);
  assert.equal(await js(b,'JSON.stringify({titles,cursor,history})===preserved'),true,'switching preserves edits, cursor and undo');
  assert.equal(hosts.length,1);
  saves.push(path.join(folder,'b.mp4'));await js(b,"openExport();$('export').onclick()");
  await until(()=>js(b,"testProgress.some(p=>p.phase==='queued')"));
  assert.equal(await js(b,"testProgress.some(p=>p.phase==='rendering')"),false);
  assert.equal(await js(b,"$('cancel').disabled"),false);
  await wait(600);fs.writeFileSync(path.join(folder,'queued.png'),(await b.webContents.capturePage()).toPNG());
  // A third project lets us reorder from another tab and cancel by stable job ID.
  await js(hosts[0],"document.getElementById('new-tab').click()");await until(()=>windows.length===3);const c=windows[2];await setup(c);
  saves.push(path.join(folder,'c.mp4'));await js(c,"openExport();$('export').onclick()");await until(()=>js(c,"testProgress.some(p=>p.phase==='queued')"));
  await js(c,"$('render-open-queue').click()");await until(()=>js(c,"document.querySelectorAll('.queue-job').length===3"));
  const state=await js(c,'sahl.renderQueue()'),idA=state.jobs[0].id,idB=state.jobs[1].id,idC=state.jobs[2].id;
  await js(c,`document.querySelector('[data-job-id="${idC}"] [data-action=up]').click()`);
  await until(()=>js(b,`sahl.renderQueue().then(s=>s.jobs[1].id==='${idC}'&&s.jobs[2].id==='${idB}')`));
  assert.equal(await js(b,"testProgress.at(-1).position"),2);
  await wait(300);fs.writeFileSync(path.join(folder,'queue-list.png'),(await c.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(folder,'tabs.png'),(await hosts[0].webContents.capturePage({x:0,y:0,width:1484,height:48})).toPNG());
  await js(b,"$('render-open-queue').click()");await until(()=>js(b,"document.querySelectorAll('.queue-job').length===3"));
  await js(b,`document.querySelector('[data-job-id="${idC}"] [data-action=cancel]').click()`);await until(()=>js(c,'testComplete.length===1'));
  assert.equal(await js(a,'testComplete.length'),0);assert.equal(await js(b,'testComplete.length'),0);
  await js(hosts[0],'workspace.close('+JSON.stringify((await js(hosts[0],'workspace.state()')).tabs[2].id)+')');await until(()=>c.isDestroyed());await js(b,"$('close-render-queue').click()");
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
  await js(hosts[0],'workspace.close('+JSON.stringify((await js(hosts[0],'workspace.state()')).tabs[0].id)+')');await until(()=>a.isDestroyed());
  await js(b,"$('export-dialog').close();clips[0].end=1;renderTimeline();titles=[];draw()");
  saves.push(path.join(folder,'complete.mp4'));await js(b,"openExport();$('export').onclick()");await until(()=>js(b,'testComplete.length===3'));
  assert.equal(await js(b,'testComplete[2].timing.phase'),'complete');assert.ok(fs.existsSync(path.join(folder,'complete.mp4')));
  // Closing the only tab must never refresh it, discard edits or create another project.
  const lastId=(await js(hosts[0],'workspace.state()')).active;
  const lastState=await js(b,'JSON.stringify(projectSnapshot())');
  for(let i=0;i<3;i++)assert.equal((await js(hosts[0],`workspace.close('${lastId}')`)).lastTab,true);
  assert.equal(b.isDestroyed(),false);assert.equal(windows.length,3);assert.equal(await js(b,'JSON.stringify(projectSnapshot())'),lastState);
  await until(()=>js(hosts[0],"document.getElementById('project-count').textContent==='1'&&document.querySelector('.tab-close').hidden"));
  await js(hosts[0],"document.querySelector('.tab-select').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));document.querySelector('.tab-rename').value='اسم ملغى';document.querySelector('.tab-rename').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal((await js(hosts[0],'workspace.state()')).tabs[0].name,'مشروع 1');
  await js(hosts[0],"document.querySelector('.tab-select').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));document.querySelector('.tab-rename').value='مونتاج الألعاب';document.querySelector('.tab-rename').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await until(()=>js(b,"projectDisplayName==='مونتاج الألعاب'"));
  await js(b,'markDirty()');assert.equal((await js(hosts[0],'workspace.state()')).tabs[0].name,'مونتاج الألعاب');
  assert.ok((await js(hosts[0],`workspace.rename('${lastId}', 'x'.repeat(65))`)).error);
  saves.push(path.join(folder,'named.sahl'));await js(b,'saveCurrentProject(false)');
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'named','named.sahl'))).displayName,'مونتاج الألعاب');
  await js(hosts[0],"document.getElementById('new-tab').click()");await until(()=>windows.length===4);await ready(windows[3]);
  await js(hosts[0],`workspace.close('${lastId}')`);await until(()=>b.isDestroyed());
  assert.equal(hosts.length,1);assert.equal(await js(windows[3],'clips.length'),0);
  const clean=windows[3];await js(clean,"$('choose').onclick()");await js(clean,'seekTo(1)');await until(()=>js(clean,'!previewAbort'));
  await js(clean,"$('play').click()");await until(()=>js(clean,'playing'));
  await js(hosts[0],"document.getElementById('new-tab').click()");await until(()=>windows.length===5);await ready(windows[4]);
  await until(()=>js(clean,'!playing&&video.paused'));
  const newTabs=await js(hosts[0],'workspace.state()');
  await js(hosts[0],`workspace.select('${newTabs.tabs[0].id}')`);
  assert.equal(await js(clean,'cursor>0'),true,'switching keeps the playback cursor');
  const before=await js(clean,'JSON.stringify(projectSnapshot())');
  answers.push(2);hosts[0].close();await wait(150);
  assert.equal(hosts[0].isDestroyed(),false);assert.equal(await js(clean,'JSON.stringify(projectSnapshot())'),before,'cancel closing the window preserves edits');
  assert.deepEqual(errors.filter(e=>!e.includes('404')),[]);console.log('PASS one-window tabs, state retention, isolation, editing during render, reordering, cancel, parallel setting and tab close. Screenshots:',folder);
  clearTimeout(timeout);hosts[0].close();await until(()=>hosts[0].isDestroyed());app.exit(0);
 }catch(e){console.error(e);for(const win of windows)if(!win.isDestroyed())try{await js(win,'sahl.cancel()');}catch{}clearTimeout(timeout);app.exit(1);}
});

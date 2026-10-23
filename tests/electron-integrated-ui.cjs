// Exercise the parallel PRs together with the full editor and actual media playback.
const {app,BrowserWindow,ipcMain,protocol}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {MediaLibrary}=require('../app/library'),{mediaResponse}=require('../app/media'),Project=require('../app/project');
app.setPath('userData',path.resolve('test-output/integrated-ui-profile'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const timer=setTimeout(()=>app.exit(1),60000);
app.whenReady().then(async()=>{
 const library=new MediaLibrary(require('ffmpeg-static'),require('@ffprobe-installer/ffprobe').path),media=await library.import([path.resolve('test-output/three-colors.mp4'),path.resolve('test-output/photo.png')]);
 let recoveries=[],restores=0;
 for(const channel of ['fonts','encoders','list-templates'])ipcMain.handle(channel,()=>[]);
 ipcMain.handle('list-recovery',()=>recoveries);ipcMain.handle('update-status',()=>({phase:'disabled',installedVersion:'test'}));ipcMain.handle('choose-media',()=>media);
 for(const [channel,size]of [['frame',960],['thumbnail',176]])ipcMain.handle(channel,(_,id,t)=>library.frame(id,t,size));
 ipcMain.handle('waveform',(_,id)=>library.waveforms.get(library.assets[id]));ipcMain.on('project-state',()=>{});
 ipcMain.handle('restore-recovery',async(_,id,raw,locateMissing)=>{assert.equal(id,'older');await new Promise(r=>setTimeout(r,50));restores++;if(restores===1)return {error:'ملف الاختبار مفقود',missingFiles:[{id:'missing',name:'Original video.mp4'}]};if(restores===2){assert.equal(locateMissing,true);return {canceled:true};}recoveries=[];return {state:Project.state(raw,library.assets),assets:library.descriptors(),path:'restored.sahl'};});
 protocol.handle('sahl-media',request=>{const asset=library.assets[new URL(request.url).pathname.slice(1)];return asset?mediaResponse(asset.path,request):new Response(null,{status:404});});
 const win=new BrowserWindow({show:false,width:1120,height:740,webPreferences:{preload:path.resolve('app/preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}}),errors=[];
 win.webContents.on('console-message',(...args)=>{if(args[0].level==='error'||args[1]===3)errors.push(args[0].message||args[2]);});
 const evaluate=code=>win.webContents.executeJavaScript(code,true);
 try{
  await win.loadFile(path.resolve('app/index.html'));
  await evaluate(`window.check=(v,m)=>{if(!v)throw Error(m)};window.waitFor=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for UI');};void 0;`);
  await evaluate(`(async()=>{
   await $('choose').onclick();await waitFor(()=>!previewAbort);seekTo(.3);await waitFor(()=>!previewAbort);
   check(getComputedStyle(video).cursor==='pointer','nested video shows playback cursor');check(getComputedStyle(video).pointerEvents==='auto','nested media receives pointer events');const rect=video.getBoundingClientRect();check(document.elementFromPoint(rect.x+rect.width*.25,rect.y+rect.height*.25)===video,'actual media hit target');video.click();await waitFor(()=>playing);video.click();await waitFor(()=>!playing&&!playbackAbort);
   $('add-text').click();$('title-selection').dispatchEvent(new MouseEvent('click',{bubbles:true}));check(!playing&&!playbackAbort,'title selection cannot play video');
   selectionKind='clip';selectedClip=0;$('move-picture').checked=true;refreshClipControls();$('picture-drag').dispatchEvent(new MouseEvent('click',{bubbles:true}));check(!playing&&!playbackAbort,'picture transform cannot play video');$('move-picture').checked=false;layoutCanvas();
   seekTo(1);await waitFor(()=>!previewAbort);$('freeze-duration').value='1';freezeFrameHere();await waitFor(()=>!previewAbort);check(clips[selectedClip].freeze&&!video.hidden,'frozen frame visible');video.click();await waitFor(()=>playing);video.click();await waitFor(()=>!playing&&!playbackAbort);undo();
   insertAsset(assets.find(a=>a.kind==='image').id,total());seekTo(TL.startAt(clips,clips.length-1)+.2);await waitFor(()=>!previewAbort);$('still').click();await waitFor(()=>playing);$('still').click();await waitFor(()=>!playing&&!playbackAbort);
   setBusy(true);$('still').click();check(!playing&&!playbackAbort,'busy playback disabled');setBusy(false);
   captions=SahlCaptions.normalize({cues:[{start:0,end:1,text:'تبقى بعد الاسترجاع'}]});renderTimeline();
  })()`);
  recoveries=[{id:'newest',name:'مشروع <b>عراقي</b>.sahl',savedAt:Date.UTC(2026,9,19,10),clips:3,texts:2},{id:'older',name:'مشروع قديم.sahl',savedAt:Date.UTC(2026,9,18,9),clips:2,texts:1}];
  await evaluate(`(async()=>{await refreshRecovery(true);check($('recovery-dialog').open,'recovery opens');check(document.querySelectorAll('.recovery-card').length===2,'cards render');check(document.querySelector('.recovery-name').textContent==='مشروع <b>عراقي</b>.sahl'&&!document.querySelector('.recovery-name b'),'names stay text');check(!/[٠-٩]/.test(document.querySelector('.recovery-saved').textContent),'English digits');$('recovery-list').querySelector('[value=older]').click();await refreshRecovery();check(recoverySelection()==='older','selection retained on refresh');check($('recovery-dialog').getBoundingClientRect().height<innerHeight,'small window fit');})()`);
  fs.writeFileSync('test-output/integrated-recovery.png',(await win.webContents.capturePage()).toPNG());
  await evaluate(`(async()=>{for(let i=0;i<3;i++){const promise=$(i===1?'locate-recovery-media':'restore-recovery').onclick();check($('close-recovery').disabled&&$('restore-recovery').disabled,'recovery locks controls');await promise;if(i<2){check($('recovery-dialog').open&&!fileBusy,'failure/cancel stays recoverable');if(i===0){check($('recovery-error').textContent.includes('مفقود'),'error displayed');check(!$('locate-recovery-media').hidden&&$('recovery-missing-files').textContent.includes('Original video.mp4'),'missing sources offer explicit relinking');}}}check(!$('recovery-dialog').open&&$('restore-recovery').disabled,'successful recovery closes empty list');check(captions.cues[0].text==='تبقى بعد الاسترجاع','new project features survive restoration');openExport();setBusy(true);})()`);
  win.webContents.send('complete',{path:'test.mp4',timing:{phase:'complete',elapsedSeconds:75.4}});
  await evaluate(`(async()=>{await waitFor(()=>!busy);check(!$('export-completed').hidden&&$('export-completed-duration').textContent==='01:15','completed time remains visible');setBusy(true);check($('export-completed').hidden,'retry clears prior success');})()`);
  win.webContents.send('complete',{canceled:true,timing:{phase:'stopped',elapsedSeconds:3}});
  await evaluate(`(async()=>{await waitFor(()=>!busy);check($('export-completed').hidden,'cancel has no success banner');check(document.documentElement.scrollWidth===innerWidth,'no horizontal overflow');})()`);
  assert.equal(restores,3);assert.deepEqual(errors,[]);console.log('PASS integrated preview click/drag/freeze, recovery cards/error/cancel/restore, export duration/retry, and 1120px layout');
 }finally{clearTimeout(timer);library.waveforms.cancel();win.destroy();}app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(timer);app.exit(1);});

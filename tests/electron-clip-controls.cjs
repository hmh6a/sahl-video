// Native renderer integration: actual preload, custom media protocol and Web Audio.
const {app,BrowserWindow,protocol,ipcMain}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {MediaLibrary}=require('../app/library'),{mediaResponse}=require('../app/media'),Project=require('../app/project');
app.setPath('userData',path.resolve('test-output/clip-controls-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const deadline=setTimeout(()=>{console.error('Native clip controls test timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
  const library=new MediaLibrary(require('ffmpeg-static'),require('@ffprobe-installer/ffprobe').path),imported=await library.import([path.resolve('test-output/three-colors.mp4')]);let saved;
  protocol.handle('sahl-media',request=>{const id=new URL(request.url).pathname.slice(1),a=library.assets[id];return a?mediaResponse(a.path,request):new Response(null,{status:404});});
  for(const channel of ['fonts','encoders','list-templates','list-recovery'])ipcMain.handle(channel,()=>[]);
  ipcMain.handle('update-status',()=>({phase:'disabled',installedVersion:'test'}));ipcMain.handle('choose-media',()=>imported);
  ipcMain.handle('waveform',(_,id)=>library.waveforms.get(library.assets[id]));
  ipcMain.handle('thumbnail',(_,id,t)=>library.frame(id,t,176));ipcMain.handle('frame',(_,id,t)=>library.frame(id,t,960));
  ipcMain.handle('save-project',(_,raw)=>{saved=Project.state(raw,library.assets);return {path:'test.sahl',folder:'test-output',name:'test'};});
  ipcMain.handle('open-project',()=>({state:saved,assets:library.descriptors(),path:'test.sahl'}));ipcMain.on('project-state',()=>{});
  const win=new BrowserWindow({show:false,width:1500,height:960,webPreferences:{preload:path.resolve('app/preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',(...args)=>{const level=args[0].level??args[1],message=args[0].message??args[2];if(level==='error'||level===3)errors.push(message);});
  try{
    await win.loadFile(path.resolve('app/index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const check=(ok,message)=>{if(!ok)throw new Error(message);};
      const change=(id,value)=>{const el=$(id);if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));};
      await importResult(()=>window.sahl.choose());check(clips.length===1,'import failed');
      change('canvas-mode','9:16');change('canvas-size',720);check(meta.width===720&&meta.height===1280,'canvas dimensions');
      change('clip-fit','cover');change('clip-x',10);change('clip-rotation',90);change('clip-flip-x',true);
      change('clip-volume',150);change('clip-fade-in',.25);change('clip-fade-out',.4);
      check(clips[0].audio.volume===1.5&&clips[0].transform.x===10,'clip edits');
      const snap=snapshot();clips[0].audio.volume=.1;check(snap.clips[0].audio.volume===1.5,'snapshot must be independent');restore(snap);
      undo();check(clips[0].audio.fadeOut===0,'audio undo');redo();check(clips[0].audio.fadeOut===.4,'audio redo');
      await saveCurrentProject();change('canvas-mode','1:1');await openSavedProject();check(meta.width===720&&meta.height===1280&&clips[0].transform.rotation===90,'save/open geometry');check(clips[0].audio.volume===1.5,'save/open audio');
      const w=meta.width;change('canvas-mode','1:1');undo();check(meta.width===w&&canvasMode==='9:16','canvas undo');redo();check(canvasMode==='1:1','canvas redo');undo();
      $('move-picture').checked=true;$('move-picture').onchange();const surface=$('picture-drag'),before=history.length,box=surface.getBoundingClientRect();
      const capture=surface.setPointerCapture;surface.setPointerCapture=()=>{};surface.onpointerdown({pointerId:1,button:0,clientX:box.x+20,clientY:box.y+20,preventDefault(){}});surface.setPointerCapture=capture;
      // Exercise grouping independently from the browser's physical pointer capture.
      surface.onpointermove({pointerId:1,clientX:box.x+40,clientY:box.y+30});surface.onpointermove({pointerId:1,clientX:box.x+60,clientY:box.y+40});finishPictureDrag({pointerId:1});
      check(history.length===before+1,'drag must be one undo');undo();check(clips[0].transform.x===10,'drag undo');
      change('clip-rotation',0);change('clip-flip-x',false);$('move-picture').checked=false;layoutCanvas();
      seekTo(1);await $('play').onclick();await new Promise(resolve=>setTimeout(resolve,600));
      check(playing&&audioPreview.context.state==='running','native audio playback');audioPreview.analyser.getFloatTimeDomainData(audioPreview.samples);let peak=0;for(const sample of audioPreview.samples)peak=Math.max(peak,Math.abs(sample));check(peak>.01,'custom scheme audio must not be CORS-silenced '+JSON.stringify({peak,cursor,videoTime:video.currentTime,paused:video.paused,volume:video.volume,muted:video.muted,gain:audioPreview.gain.gain.value,contextTime:audioPreview.context.currentTime,ready:video.readyState,audio:clips[0].audio,source:video.currentSrc,decoded:video.webkitAudioDecodedByteCount}));
      pause();change('clip-muted',true);seekTo(1);await $('play').onclick();await new Promise(resolve=>setTimeout(resolve,600));audioPreview.analyser.getFloatTimeDomainData(audioPreview.samples);check(audioPreview.samples.every(s=>Math.abs(s)<1e-7),'muted native audio '+JSON.stringify({cursor,gain:audioPreview.gain.gain.value,peak:Math.max(...audioPreview.samples.map(Math.abs))}));pause();
      change('clip-muted',false);seekTo(1);refreshClipControls();
      return {peak,canvas:meta,audio:clips[0].audio,transform:clips[0].transform};
    })()`,true);
    assert.ok(result.peak>.01);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.resolve('test-output/batch-01-preview.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("$('clip-controls').scrollTop=$('clip-controls').scrollHeight");
    await win.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.resolve('test-output/batch-01-audio.png'),(await win.webContents.capturePage()).toPNG());
    win.setContentSize(1120,740);
    const layout=await win.webContents.executeJavaScript("({scrollable:$('clip-controls').scrollHeight>$('clip-controls').clientHeight&&getComputedStyle($('clip-controls')).overflowY==='auto',bodyWidth:document.body.clientWidth,viewport:innerWidth})");assert.ok(layout.scrollable);assert.ok(layout.bodyWidth<=layout.viewport);
    console.log('PASS: native preview audio, mute, geometry, grouped undo, project round trip',JSON.stringify(result));clearTimeout(deadline);win.destroy();app.exit(0);
  }catch(e){console.error(e);console.error(errors);clearTimeout(deadline);win.destroy();app.exit(1);}
}).catch(e=>{console.error(e);app.exit(1);});

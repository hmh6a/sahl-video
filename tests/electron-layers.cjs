// Native renderer integration: actual preload, custom media protocol and Web Audio.
const {app,BrowserWindow,protocol,ipcMain}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {MediaLibrary}=require('../app/library'),{mediaResponse}=require('../app/media'),Project=require('../app/project');
app.setPath('userData',path.resolve('test-output/layers-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const deadline=setTimeout(()=>{console.error('Native clip controls test timed out');app.exit(1);},90000);
app.whenReady().then(async()=>{
  const library=new MediaLibrary(require('ffmpeg-static'),require('@ffprobe-installer/ffprobe').path),imported=await library.import([path.resolve('test-output/three-colors.mp4')]);let saved;
  const {ProxyService}=require('../app/proxies'),cache=new ProxyService(require('ffmpeg-static'),path.resolve('test-output/native-proxies'));
  const extra=await library.import([path.resolve('test-output/photo.png')]);
  ipcMain.handle('proxy-create',(_,id,size)=>cache.request(library.assets[id],size));ipcMain.handle('proxy-lookup',(_,id,size)=>cache.lookup(library.assets[id],size));ipcMain.handle('proxy-cancel',(_,id)=>cache.cancel(id));ipcMain.handle('proxy-stats',()=>cache.stats());ipcMain.handle('proxy-clear',()=>cache.clear());
  protocol.handle('sahl-media',request=>{const u=new URL(request.url),id=u.pathname.slice(1),file=u.hostname==='proxy'?cache.resolve(id):library.assets[id]?.path;return file?mediaResponse(file,request):new Response(null,{status:404});});
  for(const channel of ['fonts','encoders','list-templates','list-recovery'])ipcMain.handle(channel,()=>[]);
  ipcMain.handle('update-status',()=>({phase:'disabled',installedVersion:'test'}));ipcMain.handle('choose-media',(_,kind)=>kind==='image'?extra:imported);
  ipcMain.handle('waveform',(_,id)=>library.waveforms.get(library.assets[id]));
  ipcMain.handle('thumbnail',(_,id,t)=>library.frame(id,t,176));ipcMain.handle('frame',(_,id,t)=>library.frame(id,t,960));
  ipcMain.handle('save-project',(_,raw)=>{saved=Project.state(raw,library.assets);return {path:'test.sahl',folder:'test-output',name:'test'};});
  ipcMain.handle('open-project',()=>({state:saved,assets:library.descriptors(),path:'test.sahl'}));ipcMain.on('project-state',()=>{});
  const win=new BrowserWindow({show:false,width:1500,height:960,webPreferences:{preload:path.resolve('app/preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',(...args)=>{const level=args[0].level??args[1],message=args[0].message??args[2];if(level==='error'||level===3)errors.push(message);});
  try{
    await win.loadFile(path.resolve('app/index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const check=(ok,msg)=>{if(!ok)throw new Error(msg);},wait=ms=>new Promise(r=>setTimeout(r,ms)),near=(a,b,n=.001)=>check(Math.abs(a-b)<n,a+' != '+b);
      const change=(id,value)=>{const el=$(id);if(el.type==='checkbox')el.checked=value;else el.value=String(value);return el.onchange();};
      const ready=async()=>{for(let i=0;i<300&&previewAbort;i++)await wait(10);check(!previewAbort&&previewLoad.phase!=='error','preview ready: '+$('preview-loading-detail').textContent);};
      await importResult(()=>window.sahl.choose());await importResult(()=>window.sahl.choose('image'));titles=[];draw();const id=assets.find(a=>a.kind==='video').id,photo=assets.find(a=>a.kind==='image').id;
      insertLayer(id);check(layers.length===1,'add pip');const pip=selectedLayer;change('layer-at',.5);change('layer-start',4);change('layer-end',6);change('layer-x',50);change('layer-y',50);change('layer-width',50);change('layer-height',50);change('layer-muted',false);change('layer-volume',50);mainTrack.muted=true;seekTo(.8);await ready();check(layerMedia.size===1,'one active source');const player=layerMedia.get(pip);near(player.media.currentTime,4.3,.04);
      const old=history.length;change('layer-rotation',30);check(history.length===old+1,'layer single undo');undo();near(currentLayer().rotation,0);redo();near(currentLayer().rotation,30);change('layer-rotation',0);
      change('layer-locked',true);const before=JSON.stringify(layers);change('layer-x',70);deleteTimelineSelection();check(JSON.stringify(layers)===before,'locked layer protected');change('layer-locked',false);change('layer-x',50);
      seekTo(.7);await ready();await $('play').onclick();await wait(350);check(playing&&!layerMedia.get(pip).media.paused,'layer video plays');near(layerMedia.get(pip).media.currentTime,4+cursor-.5,.17);near(layerMedia.get(pip).gain.gain.value,.5,.02);pause();check(layerMedia.get(pip).media.paused,'layer pause');
      seekTo(.2);await ready();check(layerMedia.size===0,'inactive sources released');seekTo(.8);await ready();check(layerMedia.size===1,'active source recreated');
      insertLayer(photo);const logo=selectedLayer;change('layer-at',.5);change('layer-x',50);change('layer-y',50);change('layer-width',20);change('layer-height',20);seekTo(.8);await ready();check(layerMedia.size===2,'pip and image active');check(getComputedStyle(layerStage).zIndex==='2','layer stack');
      const snapshotLayers=JSON.stringify(layers);await saveCurrentProject();await openSavedProject();await wait(100);await ready();check(JSON.stringify(layers)===snapshotLayers,'layers save and reopen');selectLayer(logo);timelineSelection=['layer:'+pip,'layer:'+logo];copyTimelineSelection();pasteTimelineSelection(3);check(layers.length===4,'multiple layer copy');undo();check(layers.length===2,'copy atomic undo');
      openProxy(id);await change('proxy-mode','540');check(previewURL(assets.find(a=>a.id===id)).startsWith('sahl-media://asset/'),'missing proxy fallback');await $('proxy-create').onclick();await ready();check(video.src.startsWith('sahl-media://proxy/'),'main uses proxy');check(layerMedia.get(pip).media.src.startsWith('sahl-media://proxy/'),'pip uses proxy');const clipTimes=JSON.stringify(clips),layerTimes=JSON.stringify(layers);await change('proxy-mode','original');await ready();check(video.src.startsWith('sahl-media://asset/'),'switch original');check(JSON.stringify(clips)===clipTimes&&JSON.stringify(layers)===layerTimes,'switch keeps edits');
      await change('proxy-mode','720');await $('proxy-create').onclick();await ready();check(proxyCache.get(id).size===720,'new size');await saveCurrentProject();await openSavedProject();await wait(100);await ready();check(proxyPreferences[id].enabled&&proxyCache.get(id).size===720,'restore cache choice');
      await $('proxy-clear').onclick();await ready();check(!proxyCache.size&&video.src.startsWith('sahl-media://asset/'),'cache cleanup fallback');await $('proxy-create').onclick();await ready();check(video.src.startsWith('sahl-media://proxy/'),'regenerate');$('proxy-dialog').close();
      selectLayer(pip);seekTo(.8);await ready();const rect=layerStage.getBoundingClientRect();return {layers:layers.length,center:{x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)},edge:{x:Math.round(rect.x+rect.width*.3),y:Math.round(rect.y+rect.height/2)}};
    })()`,true);
    assert.deepEqual(errors,[]);await new Promise(r=>setTimeout(r,100));const sample=async point=>[...(await win.webContents.capturePage({...point,width:1,height:1})).toBitmap()].slice(0,3);const center=await sample(result.center),edge=await sample(result.edge);assert.ok(center[1]>180&&center[2]>180&&center[0]<Math.min(center[1],center[2])*.5,'native image over pip '+center);assert.ok(edge[0]>180&&edge[2]<60,'native blue pip '+edge);
    fs.writeFileSync(path.resolve('test-output/batch-04-layers.png'),(await win.webContents.capturePage()).toPNG());win.setContentSize(1120,740);await win.webContents.executeJavaScript("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    fs.writeFileSync(path.resolve('test-output/batch-04-small.png'),(await win.webContents.capturePage()).toPNG());const layout=await win.webContents.executeJavaScript("({width:document.body.scrollWidth,viewport:innerWidth,scrollable:$('layer-controls').scrollHeight>$('layer-controls').clientHeight,footer:$('timeline-hint').getBoundingClientRect().bottom,status:$('status').getBoundingClientRect().top})");assert.ok(layout.width<=layout.viewport&&layout.scrollable);assert.ok(layout.footer<=layout.status,'timeline fit '+JSON.stringify(layout));
    console.log('PASS native visual layers, timed audio, locks, atomic undo/copy, active-source cleanup, project round trip, 540p/720p proxy switching, cleanup/regeneration and composited pixels',JSON.stringify({...result,center,edge,layout}));clearTimeout(deadline);win.destroy();app.exit(0);
  }catch(e){console.error(e);console.error(errors);fs.writeFileSync(path.resolve('test-output/batch-04-failure.png'),(await win.webContents.capturePage()).toPNG());clearTimeout(deadline);win.destroy();app.exit(1);}
}).catch(e=>{console.error(e);app.exit(1);});

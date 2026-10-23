const {app,BrowserWindow,ipcMain:rootIPC,dialog,shell,protocol}=require('electron');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {exportArgs}=require('./export'),timeline=require('./timeline'),Project=require('./project'),{saveBundle}=require('./project-bundle');
const {detectEncoders}=require('./encoding'),{MediaLibrary}=require('./library'),{mediaResponse}=require('./media'),{TemplateStore}=require('./template-store');
const {RecoveryStore,AutoSaver}=require('./recovery');
const appPackage=require('../package.json'),appVersion=appPackage.version,{Updates}=require('./updates');
const {randomUUID}=require('node:crypto'),{RenderQueue}=require('./render-queue'),{ProjectRouter}=require('./project-router');
const projects=new Set(),router=new ProjectRouter(rootIPC);
const queue=new RenderQueue(path.join(app.getPath('userData'),'render-settings.json'));
let installingUpdate=false,encoderPromise,fontsPromise;
const exec=promisify(execFile),unpack=p=>p.replace('app.asar','app.asar.unpacked'),ffmpeg=unpack(require('ffmpeg-static')),ffprobe=unpack(require('@ffprobe-installer/ffprobe').path);
function broadcast(channel,value){for(const project of projects)project.message(channel,value);}
const updates=new Updates(appVersion,{enabled:!!app.isPackaged&&(os.platform()!=='darwin'||appPackage.sahlAutoUpdate===true),disabledReason:!app.isPackaged?'التحديث المباشر متاح في النسخة المثبّتة.':os.platform()==='darwin'&&appPackage.sahlAutoUpdate!==true?'هذه نسخة ماك غير موقّعة. التحديث المباشر يحتاج إصداراً موقّعاً من المطوّر.':undefined,notify:value=>{if(value.phase==='error'&&installingUpdate){installingUpdate=false;for(const p of projects)p.prepareUpdate(false);}broadcast('update-status',value);}});
function capabilities(){return encoderPromise ||=detectEncoders(ffmpeg);}
async function installUpdate(){
  if(!updates.downloaded||installingUpdate)return updates.status();
  if([...projects].some(p=>p.blocked()))return updates.emit({phase:'downloaded',version:updates.available?.version,message:'التحديث جاهز. انتظر انتهاء العمليات بكل المشاريع ثم أعد المحاولة.'});
  installingUpdate=true;
  try{
    for(const p of projects)if(!await p.keepChanges()){installingUpdate=false;return updates.status();}
    for(const p of projects){p.capture();p.prepareUpdate(true);}
    const result=updates.install();if(result.phase!=='installing'){installingUpdate=false;for(const p of projects)p.prepareUpdate(false);}return result;
  }catch(e){installingUpdate=false;for(const p of projects)p.prepareUpdate(false);return updates.emit({phase:'error',message:e.message});}
}
protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
function createProjectWindow(){
const sessionId=randomUUID();
const library=new MediaLibrary(ffmpeg,ffprobe,{waveformDirectory:path.join(app.getPath('userData'),'waveforms')});
const {ProxyService}=require('./proxies');
const CaptionFiles=require('./caption-files'),ExportRange=require('./export-range');
const {RecentProjects}=require('./recent-projects'),recents=new RecentProjects(app.getPath('userData'));
async function rememberProject(file,raw){if(!file)return;try{const c=raw?.clips?.[0];const thumbnail=c?await library.frame(c.assetId,c.freeze?.time??c.start,176):null;recents.remember(file,thumbnail);}catch(e){message('recent-warning',{error:'تعذّر تحديث المشاريع الأخيرة: '+e.message});}}
const {TranscriptionService}=require('./transcription');
const speech=new TranscriptionService(ffmpeg,unpack(path.join(__dirname,'native','transcription',os.platform()+'-'+os.arch(),os.platform()==='win32'?'whisper-cli.exe':'whisper-cli')),path.join(app.getPath('userData'),'speech-models'),{notify:p=>message('transcription-progress',p)});
const proxies=new ProxyService(ffmpeg,path.join(app.getPath('userData'),'project-proxies',sessionId),{notify:p=>message('proxy-progress',p)});
let proxyMaintenance=false;
let win,active,lastOutput,recovery,autoSaver,projectPath=null,projectState=null,dirty=false,closing=false,checkingClose=false,projectPortable=false,saving=false,projectAbort=null,importingMedia=false,opening=false,exportPreparing=false;
function message(channel,value){if(win&&!win.isDestroyed())win.webContents.send(channel,value);}
function clearRecovery(){try{recovery?.clear();}catch(e){message('autosave',{phase:'error',message:e.message});}}
async function cancelExport(){return active?active.cancel():{notRunning:true};}

function title(){win?.setTitle((dirty?'● ':'')+(projectPath?path.basename(projectPath)+' — ':'')+'سهل — Sahl Video '+appVersion);}
const mediaFilter=[{name:'Video & images',extensions:['mp4','mov','mkv','webm','m4v','avi','mts','png','jpg','jpeg','webp','bmp','mp3','wav','m4a','aac','flac','ogg','opus']}];
const audioFilter=[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac','ogg','opus']}];
async function saveProject(raw,saveAs=false){
  if(saving||importingMedia)throw new Error('انتظر انتهاء الحفظ أو استيراد الملفات.');saving=true;
  try{
    let file=saveAs?null:projectPath;
    if(!file){const defaultPath=projectPath?path.join(projectPortable?path.dirname(path.dirname(projectPath)):path.dirname(projectPath),path.parse(projectPath).name+'-نسخة.sahl'):'مشروعي.sahl';
      const chosen=await dialog.showSaveDialog(win,{title:'سمّ المشروع — ينحفظ مع ملفاته بمجلد بنفس الاسم',defaultPath,filters:[{name:'Sahl project folder',extensions:['sahl']}]});if(chosen.canceled)return {canceled:true};file=chosen.filePath;if(path.extname(file).toLowerCase()!=='.sahl')file+='.sahl';}
    if(Object.values(library.assets).some(a=>a.path.toLowerCase()===path.resolve(file).toLowerCase()))throw new Error('اختار اسم مشروع مختلف عن ملفات الوسائط.');
    projectAbort=new AbortController();message('project-copy',{phase:'start',percent:0});
    const result=await saveBundle(file,raw,library.assets,{existing:!saveAs&&projectPortable,signal:projectAbort.signal,onProgress:p=>message('project-copy',p)});
    await proxies.reset();library.replace(result.assets);projectPath=result.file;projectPortable=true;projectState=raw;dirty=false;clearRecovery();title();message('autosave',{phase:'manual',savedAt:Date.now()});
    const saved={path:result.file,folder:result.folder,name:path.basename(result.file),portable:true,assets:library.descriptors()};await rememberProject(result.file,raw);message('project-saved',saved);return saved;
  }catch(e){if(e.name==='AbortError')return {canceled:true};throw e;}
  finally{projectAbort=null;saving=false;message('project-copy',{phase:'finished'});}
}
async function keepChanges(){if(!dirty||!projectState)return true;const choice=await dialog.showMessageBox(win,{type:'question',buttons:['احفظ التغييرات','تجاهل التغييرات','رجوع'],defaultId:0,cancelId:2,message:'عندك تغييرات بالمشروع ما محفوظة.',detail:'احفظها حتى ترجع تكمل القصات والنصوص بعدين.'});if(choice.response===2)return false;if(choice.response===1)return true;try{return !(await saveProject(projectState)).canceled;}catch(e){await dialog.showMessageBox(win,{type:'error',message:'تعذّر حفظ المشروع',detail:e.message});return false;}}
  recovery=new RecoveryStore(app.getPath('userData'));autoSaver=new AutoSaver(recovery,()=>({raw:projectState,assets:library.assets,dirty,blocked:saving||importingMedia||opening,projectPath,portable:projectPortable}),value=>message('autosave',value),{setIntervalFn:setInterval,clearIntervalFn:clearInterval});
  capabilities();win=new BrowserWindow({width:1500,height:960,minWidth:1120,minHeight:740,backgroundColor:'#14131a',icon:path.join(__dirname,'assets/icon.ico'),autoHideMenuBar:true,title:'سهل — Sahl Video '+appVersion,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:projects.size?sessionId:undefined}});
  win.webContents.session.protocol.handle('sahl-media',request=>{const u=new URL(request.url),a=u.hostname==='asset'?library.assets[u.pathname.slice(1)]:null;const file=a?.path||(u.hostname==='proxy'?proxies.resolve(u.pathname.slice(1)):null);return file?mediaResponse(file,request):new Response('Not found',{status:404});});
  const ipcMain=router.forWindow(win);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.on('render-process-gone',()=>autoSaver.capture());
  win.on('close',async e=>{if(closing)return;e.preventDefault();if(checkingClose||saving||exportPreparing||installingUpdate)return;checkingClose=true;
    try{if(active){const choice=await dialog.showMessageBox(win,{type:'question',buttons:['استمر بالتصدير','إلغاء التصدير وإغلاق'],defaultId:0,cancelId:0,message:'التصدير مستمر. تريد تلغيه وتغلق البرنامج؟'});if(choice.response===0)return;}
      if(speech.busy){const choice=await dialog.showMessageBox(win,{type:'question',buttons:['انتظر','إلغاء التفريغ وإغلاق'],defaultId:0,cancelId:0,message:'تجهيز التفريغ مستمر.'});if(choice.response===0)return;await speech.cancelAndWait();}if(!await keepChanges())return;if(active){const stopped=await cancelExport();if(stopped.error){await dialog.showMessageBox(win,{type:'error',message:stopped.error});return;}}clearRecovery();autoSaver.stop();closing=true;win.close();
    }finally{checkingClose=false;}
  });
  const project={message,keepChanges,capture:()=>autoSaver.capture(),prepareUpdate:value=>{closing=value;},blocked:()=>!!(active||exportPreparing||speech.busy||saving||importingMedia||opening||checkingClose),sources:()=>[...Object.values(library.assets).map(a=>a.path),projectPath].filter(Boolean),speech};
  projects.add(project);
  win.on('closed',()=>{projects.delete(project);autoSaver.stop();speech.cancel();library.waveforms.cancel();proxies.reset().then(()=>fs.promises.rm(proxies.directory,{recursive:true,force:true})).catch(()=>{});});
  ipcMain.handle('new-project-window',()=>{if(installingUpdate)return {error:'انتظر انتهاء التحديث.'};createProjectWindow();return {opened:true};});
  ipcMain.handle('render-settings',()=>queue.settings());
  ipcMain.handle('set-render-limit',(_,limit)=>{try{const settings=queue.setLimit(limit);broadcast('render-settings',settings);return settings;}catch(e){return {error:e.message};}});

ipcMain.handle('encoders',()=>capabilities());
ipcMain.handle('update-status',()=>updates.status());
ipcMain.handle('check-updates',()=>updates.check());
ipcMain.handle('download-update',async()=>{const result=await updates.download();return result.phase==='downloaded'?installUpdate():result;});
ipcMain.handle('cancel-update',()=>{updates.cancel();return updates.status();});
ipcMain.handle('install-update',installUpdate);
ipcMain.handle('fonts',()=>fontsPromise ||=(async()=>{try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; $fontCollection = New-Object System.Drawing.Text.InstalledFontCollection; ConvertTo-Json -Compress -InputObject @($fontCollection.Families.Name | Sort-Object -Unique)"],{windowsHide:true,timeout:15000,maxBuffer:2*1024*1024});const names=JSON.parse(stdout.replace(/^\uFEFF/,''));return Array.isArray(names)?names:[];}catch{return ['Segoe UI','Tahoma','Arial','Impact','Consolas'];}})());
async function importMedia(paths){importingMedia=true;try{return await library.import(paths,progress=>message('import-progress',progress));}finally{importingMedia=false;}}
ipcMain.handle('choose-media',async(_,kind)=>{if(active||exportPreparing||speech.busy||saving||importingMedia||opening||installingUpdate)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};const chosen=await dialog.showOpenDialog(win,{title:kind==='audio'?'اختار موسيقى أو تعليق صوتي':kind==='image'?'اختار صور':'استورد فيديوهات وصور وصوت',properties:['openFile','multiSelections'],filters:kind==='audio'?audioFilter:kind==='image'?[{name:'Images',extensions:['png','jpg','jpeg','webp','bmp']}]:mediaFilter});return chosen.canceled?null:importMedia(chosen.filePaths);});
ipcMain.handle('import-media',(_,paths)=>{if(active||exportPreparing||speech.busy||saving||importingMedia||opening||installingUpdate)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))return {error:'ملفات السحب غير صالحة.'};return importMedia(paths);});
ipcMain.handle('frame',(_,id,t)=>library.frame(id,t,960));
ipcMain.handle('waveform',async(_,id)=>{try{return await library.waveforms.get(library.assets[id]);}catch(e){return {error:e.message};}});
ipcMain.handle('proxy-lookup',async(_,id,size)=>{try{return await proxies.lookup(library.assets[id],size);}catch(e){return {error:e.message};}});
ipcMain.handle('proxy-create',async(_,id,size)=>{if(active||exportPreparing||speech.busy||saving||opening||proxyMaintenance)return {error:'انتظر انتهاء الحفظ أو التصدير أو تنظيف المعاينة.'};return proxies.request(library.assets[id],size);});
ipcMain.handle('proxy-cancel',(_,id)=>{proxies.cancel(id);return {canceled:true};});
ipcMain.handle('proxy-stats',async()=>{const {bytes,limit}=await proxies.stats();return {bytes,limit};});
ipcMain.handle('proxy-clear',async()=>{if(active||exportPreparing||speech.busy||saving||opening||proxyMaintenance)return {error:'انتظر انتهاء العملية الحالية.'};proxyMaintenance=true;try{const {bytes,limit}=await proxies.clear();return {bytes,limit};}catch(e){return {error:e.message};}finally{proxyMaintenance=false;}});
ipcMain.handle('thumbnail',(_,id,t)=>library.frame(id,t,176));
ipcMain.on('project-state',(_,raw,isDirty)=>{projectState=raw;if(isDirty)dirty=true;title();});
ipcMain.handle('cancel-project-save',()=>{projectAbort?.abort();});
ipcMain.handle('list-recovery',()=>recovery.list());
ipcMain.handle('save-project',async(_,raw,saveAs)=>{try{if(active||exportPreparing||speech.busy||saving||importingMedia||opening||installingUpdate)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};return await saveProject(raw,saveAs);}catch(e){return {error:e.message};}});
async function loadProject(file,recoveryId=null){
  const {raw,sources}=recoveryId?recovery.read(recoveryId):Project.readProject(file),assets={};let relinked=false;
  for(const source of sources){let location=source.resolved;if(!location){const relink=await dialog.showOpenDialog(win,{title:'حدد الملف المفقود: '+path.basename(source.path||source.relativePath),properties:['openFile'],filters:mediaFilter});if(relink.canceled)return {canceled:true};location=relink.filePaths[0];relinked=true;}const a=await library.inspect(location,source.id);if(a.kind!==source.kind)throw new Error('نوع الملف البديل مختلف عن الملف الأصلي.');a.name=source.name||path.basename(location);assets[source.id]=a;}
  const clean=Project.state(raw,assets),origin=recoveryId?raw.recovery.projectPath:file,nextPath=origin&&fs.existsSync(origin)?origin:null,nextPortable=recoveryId?raw.recovery.portable===true:raw.portable===true,nextState={...clean,assetIds:Object.keys(assets)};
  if(recoveryId){recovery.save(nextState,assets,{projectPath:nextPath,portable:nextPortable,force:true});try{recovery.clear(recoveryId);}catch{/* Keep the old recovery if Windows has it locked. */}}
  else clearRecovery();
  await proxies.reset();library.replace(assets);projectPath=nextPath;projectPortable=nextPortable;projectState=nextState;dirty=relinked||!!recoveryId;title();
  message('autosave',{phase:recoveryId?'saved':'ready',...(recoveryId?{savedAt:Date.now()}: {})});
  if(!recoveryId)await rememberProject(projectPath,clean);
  return {state:clean,dirty,portable:projectPortable,assets:library.descriptors(),path:projectPath,name:projectPath?path.basename(projectPath):'مشروع مسترجع',recovered:!!recoveryId};
}
async function openProject(current,recentFile=null,relocate=false){
  if(active||exportPreparing||speech.busy||saving||importingMedia||opening||installingUpdate)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};
  if(recentFile!==null&&(typeof recentFile!=='string'||!recents.read().some(r=>r.path===recentFile)))return {error:'اختصار المشروع غير موجود بالقائمة.'};
  opening=true;try{
    if(current)projectState=current;if(!await keepChanges())return {canceled:true};
    let file=recentFile;
    if(!file||relocate){const chosen=await dialog.showOpenDialog(win,{title:relocate?'حدد مكان المشروع المنقول':'افتح مشروع سهل',properties:['openFile'],filters:[{name:'Sahl project',extensions:['sahl']}]});if(chosen.canceled)return {canceled:true};file=chosen.filePaths[0];}
    if(!fs.existsSync(file))return {error:'ملف المشروع مفقود: '+file+' — استخدم تحديد الموقع من المشاريع الأخيرة.'};
    const result=await loadProject(file);if(!result.canceled&&relocate&&file!==recentFile)try{recents.remove(recentFile);}catch{}return result;
  }catch(e){return {error:'تعذّر فتح المشروع: '+e.message};}finally{opening=false;}
}
ipcMain.handle('open-project',(_,current)=>openProject(current));
ipcMain.handle('list-recent-projects',()=>recents.list());
ipcMain.handle('remove-recent-project',(_,file)=>{try{if(typeof file!=='string')throw new Error('مسار غير صالح.');recents.remove(file);return {removed:true};}catch(e){return {error:e.message};}});
ipcMain.handle('open-recent-project',(_,file,current,relocate)=>openProject(current,file,relocate===true));
ipcMain.handle('restore-recovery',async(_,id,current)=>{
  if(active||exportPreparing||speech.busy||saving||importingMedia||opening||installingUpdate)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};if(current)projectState=current;
  if(!await keepChanges())return {canceled:true};opening=true;
  try{return await loadProject(null,id);}catch(e){return {error:'تعذّر الاسترجاع: '+e.message};}finally{opening=false;}
});
ipcMain.handle('transcription-status',()=>speech.status());
ipcMain.handle('transcription-download',()=>{if(active||exportPreparing||saving||opening||importingMedia||installingUpdate)return {error:'انتظر انتهاء العملية الحالية.'};if([...projects].some(p=>p.speech!==speech&&p.speech.busy))return {error:'انتظر انتهاء التفريغ في المشروع الآخر.'};return speech.download();});
ipcMain.handle('transcription-cancel',()=>speech.cancel());
ipcMain.handle('transcription-clear',()=>{try{if([...projects].some(p=>p.speech.busy))return {error:'انتظر انتهاء التفريغ في كل المشاريع.'};return speech.clear();}catch(e){return {error:e.message};}});
ipcMain.handle('transcription-start',async(_,request)=>{if([...projects].some(p=>p.speech!==speech&&p.speech.job?.phase==='download'))return {error:'انتظر انتهاء تنزيل نموذج التفريغ.'};if(active||exportPreparing||speech.busy||saving||opening||importingMedia||installingUpdate)return {error:'انتظر انتهاء العملية الحالية.'};proxies.setPaused(true);if(proxies.running)proxies.cancel(proxies.running.id);try{return await speech.transcribe(request,library.assets);}finally{proxies.setPaused(false);}});
ipcMain.handle('import-srt',async()=>{if(active||exportPreparing||speech.busy||saving||opening)return {error:'انتظر انتهاء العملية الحالية.'};const chosen=await dialog.showOpenDialog(win,{title:'استيراد ترجمة SRT',properties:['openFile'],filters:[{name:'SubRip subtitles',extensions:['srt']}]});if(chosen.canceled)return {canceled:true};try{return {cues:CaptionFiles.readSRT(chosen.filePaths[0]),name:path.basename(chosen.filePaths[0])};}catch(e){return {error:e.message};}});
ipcMain.handle('export-srt',async(_,track)=>{if(active||exportPreparing||speech.busy||saving||opening)return {error:'انتظر انتهاء العملية الحالية.'};try{require('./captions').normalize(track);const chosen=await dialog.showSaveDialog(win,{title:'تصدير ترجمة SRT',defaultPath:'ترجمة.srt',filters:[{name:'SubRip subtitles',extensions:['srt']}]});if(chosen.canceled)return {canceled:true};const file=chosen.filePath.toLowerCase().endsWith('.srt')?chosen.filePath:chosen.filePath+'.srt';if(Object.values(library.assets).some(a=>path.resolve(file).toLowerCase()===a.path.toLowerCase())||projectPath&&path.resolve(file).toLowerCase()===projectPath.toLowerCase())throw new Error('اختار اسماً مختلفاً عن ملفات المشروع.');CaptionFiles.writeSRT(file,track);return {path:file};}catch(e){return {error:e.message};}});
ipcMain.handle('export',async(_,opts)=>{
  if(active||exportPreparing||speech.busy||saving||importingMedia||opening||installingUpdate)return {error:'انتظر انتهاء الحفظ أو التصدير السابق.'};exportPreparing=true;try{const meta=opts.meta,supported=await capabilities();
  if(opts.encoder!=='cpu'&&!supported.some(c=>c.id===opts.encoder))return {error:'كارت الشاشة المختار غير متاح. اختار المعالج CPU أو كارت آخر من إعدادات التصدير.'};
  // Only use a 10-bit hardware encoder that passed the native capability probe.
  opts={...opts,captionPath:null,hdrEncoder:supported.find(c=>c.id===opts.encoder)?.hdrEncoder||'cpu'};
  let titleInputs,length,captionFrames,captionRate;
  try{titleInputs=opts.titles||[];if(!Array.isArray(titleInputs)||titleInputs.length>24)throw new Error('الحد الحالي 24 نص.');let bytes=0;
    for(const t of titleInputs){if(typeof t.png!=='string'||!t.png.startsWith('data:image/png;base64,'))throw new Error('قالب كتابة غير صالح.');bytes+=t.png.length;}if(bytes>80*1024*1024)throw new Error('قوالب النص كبيرة جداً. قلّل عدد النصوص.');
    exportArgs(library.assets,titleInputs.map(t=>({...t,path:'check.png'})),'check.mp4',meta,opts);length=timeline.duration(timeline.validate(meta,opts,library.assets));captionFrames=opts.captionFrames||[];const [num,den=1]=Project.frameRate(meta.fps).split('/').map(Number);captionRate=num/den;CaptionFiles.validateFrames(captionFrames,length,captionRate);
  }catch(e){return {error:e.message};}
  const first=library.assets[opts.clips[0].assetId],chosen=await dialog.showSaveDialog(win,{title:'احفظ الفيديو',defaultPath:path.join(path.dirname(first.path),path.parse(projectPath||first.path).name+'-Sahl.mp4'),filters:[{name:'MP4 video',extensions:['mp4']}]});if(chosen.canceled)return {canceled:true};
  if([...projects].some(p=>p.sources().some(file=>path.resolve(chosen.filePath).toLowerCase()===path.resolve(file).toLowerCase())))return {error:'اختار اسم مختلف حتى تبقى ملفاتك الأصلية محفوظة.'};
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-')),tempOutput=path.join(path.dirname(chosen.filePath),'.sahl-'+randomUUID()+'.mp4'),overlays=[];
  try{titleInputs.forEach((t,i)=>{const p=path.join(work,`title-${i}.png`);fs.writeFileSync(p,Buffer.from(t.png.split(',')[1],'base64'));overlays.push({path:p,start:t.start,duration:t.duration,animation:t.animation});});
    opts.captionPath=CaptionFiles.writeFrames(work,captionFrames,captionRate);
    autoSaver.capture();const args=exportArgs(library.assets,overlays,tempOutput,meta,opts);
    const {startExport}=require('./export-job');
    active=startExport({queue,ffmpeg,args,work,tempOutput,output:chosen.filePath,duration:ExportRange.normalize(opts.range,length,meta.fps).duration,
      setIntervalFn:setInterval,clearIntervalFn:clearInterval,notify:p=>message('progress',p),onComplete:result=>{
        active=null;library.waveforms.setPaused(false);proxies.setPaused(false);if(result.path)lastOutput=result.path;message('complete',result);
      }});
    proxies.setPaused(true);if(proxies.running)proxies.cancel(proxies.running.id);library.waveforms.setPaused(true);
    return {started:true};
  }catch(e){fs.rmSync(work,{recursive:true,force:true});return {error:e.message};}
  }finally{exportPreparing=false;}
});

ipcMain.handle('cancel-export',cancelExport);ipcMain.handle('show-output',()=>{if(lastOutput)shell.showItemInFolder(lastOutput);});
ipcMain.handle('list-templates',()=>new TemplateStore(app.getPath('userData')).list());
ipcMain.handle('save-layout',(_,name,titles)=>new TemplateStore(app.getPath('userData')).save(name,titles));

return win;
}
if(app.requestSingleInstanceLock()){
  app.on('second-instance',()=>{if(!installingUpdate&&app.isReady())createProjectWindow();});
  app.whenReady().then(()=>createProjectWindow());
  app.on('window-all-closed',()=>{updates.cancel();app.quit();});
}else app.quit();

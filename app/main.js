const {app,BrowserWindow,ipcMain,dialog,shell,protocol}=require('electron');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const {exportArgs}=require('./export'),timeline=require('./timeline'),Project=require('./project'),{saveBundle}=require('./project-bundle');
const {detectEncoders}=require('./encoding'),{MediaLibrary}=require('./library'),{mediaResponse}=require('./media'),{TemplateStore}=require('./template-store');
const {RecoveryStore,AutoSaver}=require('./recovery'),{ExportProgress}=require('./export-progress');
const exec=promisify(execFile),unpack=p=>p.replace('app.asar','app.asar.unpacked'),ffmpeg=unpack(require('ffmpeg-static')),ffprobe=unpack(require('ffprobe-static').path),library=new MediaLibrary(ffmpeg,ffprobe);
let win,active,lastOutput,encoderPromise,fontsPromise,recovery,autoSaver,projectPath=null,projectState=null,dirty=false,closing=false,checkingClose=false,projectPortable=false,saving=false,projectAbort=null,importingMedia=false,opening=false;
function capabilities(){return encoderPromise ||=detectEncoders(ffmpeg);}
function message(channel,value){if(win&&!win.isDestroyed())win.webContents.send(channel,value);}
function clearRecovery(){try{recovery?.clear();}catch(e){message('autosave',{phase:'error',message:e.message});}}
async function cancelExport(){
  const job=active;if(!job)return {notRunning:true};
  if(!job.canceled){job.canceled=true;try{const killed=job.process.kill('SIGKILL');if(!killed&&job.process.exitCode===null&&job.process.signalCode===null){job.canceled=false;return {error:'تعذّر إيقاف الرندرة. حاول الإلغاء مرة ثانية.'};}}catch(e){job.canceled=false;return {error:'تعذّر إيقاف الرندرة: '+e.message};}}
  await job.done;return {canceled:true};
}
protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
function title(){win?.setTitle((dirty?'● ':'')+(projectPath?path.basename(projectPath)+' — ':'')+'سهل — Sahl Video 1.8');}
const mediaFilter=[{name:'Video & images',extensions:['mp4','mov','mkv','webm','m4v','avi','mts','png','jpg','jpeg','webp','bmp']}];
async function saveProject(raw,saveAs=false){
  if(saving||importingMedia)throw new Error('انتظر انتهاء الحفظ أو استيراد الملفات.');saving=true;
  try{
    let file=saveAs?null:projectPath;
    if(!file){const defaultPath=projectPath?path.join(projectPortable?path.dirname(path.dirname(projectPath)):path.dirname(projectPath),path.parse(projectPath).name+'-نسخة.sahl'):'مشروعي.sahl';
      const chosen=await dialog.showSaveDialog(win,{title:'سمّ المشروع — ينحفظ مع ملفاته بمجلد بنفس الاسم',defaultPath,filters:[{name:'Sahl project folder',extensions:['sahl']}]});if(chosen.canceled)return {canceled:true};file=chosen.filePath;if(path.extname(file).toLowerCase()!=='.sahl')file+='.sahl';}
    if(Object.values(library.assets).some(a=>a.path.toLowerCase()===path.resolve(file).toLowerCase()))throw new Error('اختار اسم مشروع مختلف عن ملفات الوسائط.');
    projectAbort=new AbortController();message('project-copy',{phase:'start',percent:0});
    const result=await saveBundle(file,raw,library.assets,{existing:!saveAs&&projectPortable,signal:projectAbort.signal,onProgress:p=>message('project-copy',p)});
    library.replace(result.assets);projectPath=result.file;projectPortable=true;projectState=raw;dirty=false;clearRecovery();title();message('autosave',{phase:'manual',savedAt:Date.now()});
    const saved={path:result.file,folder:result.folder,name:path.basename(result.file),portable:true};message('project-saved',saved);return saved;
  }catch(e){if(e.name==='AbortError')return {canceled:true};throw e;}
  finally{projectAbort=null;saving=false;message('project-copy',{phase:'finished'});}
}
async function keepChanges(){if(!dirty||!projectState)return true;const choice=await dialog.showMessageBox(win,{type:'question',buttons:['احفظ التغييرات','تجاهل التغييرات','رجوع'],defaultId:0,cancelId:2,message:'عندك تغييرات بالمشروع ما محفوظة.',detail:'احفظها حتى ترجع تكمل القصات والنصوص بعدين.'});if(choice.response===2)return false;if(choice.response===1)return true;try{return !(await saveProject(projectState)).canceled;}catch(e){await dialog.showMessageBox(win,{type:'error',message:'تعذّر حفظ المشروع',detail:e.message});return false;}}
app.whenReady().then(()=>{
  recovery=new RecoveryStore(app.getPath('userData'));autoSaver=new AutoSaver(recovery,()=>({raw:projectState,assets:library.assets,dirty,blocked:saving||importingMedia||opening,projectPath,portable:projectPortable}),value=>message('autosave',value),{setIntervalFn:setInterval,clearIntervalFn:clearInterval});
  protocol.handle('sahl-media',request=>{const u=new URL(request.url),a=u.hostname==='asset'?library.assets[u.pathname.slice(1)]:null;return a?mediaResponse(a.path,request):new Response('Not found',{status:404});});
  capabilities();win=new BrowserWindow({width:1500,height:960,minWidth:1120,minHeight:740,backgroundColor:'#14131a',icon:path.join(__dirname,'assets/icon.ico'),autoHideMenuBar:true,title:'سهل — Sahl Video 1.8',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.on('render-process-gone',()=>autoSaver.capture());
  win.on('close',async e=>{if(closing)return;e.preventDefault();if(checkingClose||saving)return;checkingClose=true;
    try{if(active){const choice=await dialog.showMessageBox(win,{type:'question',buttons:['استمر بالتصدير','إلغاء التصدير وإغلاق'],defaultId:0,cancelId:0,message:'التصدير مستمر. تريد تلغيه وتغلق البرنامج؟'});if(choice.response===0)return;}
      if(!await keepChanges())return;if(active){const stopped=await cancelExport();if(stopped.error){await dialog.showMessageBox(win,{type:'error',message:stopped.error});return;}}clearRecovery();autoSaver.stop();closing=true;win.close();
    }finally{checkingClose=false;}
  });
});
app.on('window-all-closed',()=>app.quit());
ipcMain.handle('encoders',()=>capabilities());
ipcMain.handle('fonts',()=>fontsPromise ||=(async()=>{try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; $fontCollection = New-Object System.Drawing.Text.InstalledFontCollection; ConvertTo-Json -Compress -InputObject @($fontCollection.Families.Name | Sort-Object -Unique)"],{windowsHide:true,timeout:15000,maxBuffer:2*1024*1024});const names=JSON.parse(stdout.replace(/^\uFEFF/,''));return Array.isArray(names)?names:[];}catch{return ['Segoe UI','Tahoma','Arial','Impact','Consolas'];}})());
async function importMedia(paths){importingMedia=true;try{return await library.import(paths);}finally{importingMedia=false;}}
ipcMain.handle('choose-media',async(_,kind)=>{if(active||saving||importingMedia||opening)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};const chosen=await dialog.showOpenDialog(win,{title:kind==='image'?'اختار صور':'استورد فيديوهات وصور',properties:['openFile','multiSelections'],filters:kind==='image'?[{name:'Images',extensions:['png','jpg','jpeg','webp','bmp']}]:mediaFilter});return chosen.canceled?null:importMedia(chosen.filePaths);});
ipcMain.handle('import-media',(_,paths)=>{if(active||saving||importingMedia||opening)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))return {error:'ملفات السحب غير صالحة.'};return importMedia(paths);});
ipcMain.handle('frame',(_,id,t)=>library.frame(id,t,960));
ipcMain.handle('thumbnail',(_,id,t)=>library.frame(id,t,176));
ipcMain.on('project-state',(_,raw,isDirty)=>{projectState=raw;if(isDirty)dirty=true;title();});
ipcMain.handle('cancel-project-save',()=>{projectAbort?.abort();});
ipcMain.handle('list-recovery',()=>recovery.list());
ipcMain.handle('save-project',async(_,raw,saveAs)=>{try{if(active||saving||importingMedia||opening)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};return await saveProject(raw,saveAs);}catch(e){return {error:e.message};}});
async function loadProject(file,recoveryId=null){
  const {raw,sources}=recoveryId?recovery.read(recoveryId):Project.readProject(file),assets={};let relinked=false;
  for(const source of sources){let location=source.resolved;if(!location){const relink=await dialog.showOpenDialog(win,{title:'حدد الملف المفقود: '+path.basename(source.path||source.relativePath),properties:['openFile'],filters:mediaFilter});if(relink.canceled)return {canceled:true};location=relink.filePaths[0];relinked=true;}const a=await library.inspect(location,source.id);if(a.kind!==source.kind)throw new Error('نوع الملف البديل مختلف عن الملف الأصلي.');a.name=source.name||path.basename(location);assets[source.id]=a;}
  const clean=Project.state(raw,assets),origin=recoveryId?raw.recovery.projectPath:file,nextPath=origin&&fs.existsSync(origin)?origin:null,nextPortable=recoveryId?raw.recovery.portable===true:raw.portable===true,nextState={...clean,assetIds:Object.keys(assets)};
  if(recoveryId){recovery.save(nextState,assets,{projectPath:nextPath,portable:nextPortable,force:true});try{recovery.clear(recoveryId);}catch{/* Keep the old recovery if Windows has it locked. */}}
  else clearRecovery();
  library.replace(assets);projectPath=nextPath;projectPortable=nextPortable;projectState=nextState;dirty=relinked||!!recoveryId;title();
  message('autosave',{phase:recoveryId?'saved':'ready',...(recoveryId?{savedAt:Date.now()}: {})});
  return {state:clean,dirty,portable:projectPortable,assets:library.descriptors(),path:projectPath,name:projectPath?path.basename(projectPath):'مشروع مسترجع',recovered:!!recoveryId};
}
ipcMain.handle('open-project',async(_,current)=>{
  if(active||saving||importingMedia||opening)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};if(current)projectState=current;
  if(!await keepChanges())return {canceled:true};
  const chosen=await dialog.showOpenDialog(win,{title:'افتح مشروع سهل',properties:['openFile'],filters:[{name:'Sahl project',extensions:['sahl']}]});if(chosen.canceled)return {canceled:true};
  opening=true;try{return await loadProject(chosen.filePaths[0]);}catch(e){return {error:'تعذّر فتح المشروع: '+e.message};}finally{opening=false;}
});
ipcMain.handle('restore-recovery',async(_,id,current)=>{
  if(active||saving||importingMedia||opening)return {error:'انتظر انتهاء الحفظ أو التصدير أولاً.'};if(current)projectState=current;
  if(!await keepChanges())return {canceled:true};opening=true;
  try{return await loadProject(null,id);}catch(e){return {error:'تعذّر الاسترجاع: '+e.message};}finally{opening=false;}
});
ipcMain.handle('export',async(_,opts)=>{
  if(active||saving||importingMedia||opening)return {error:'انتظر انتهاء الحفظ أو التصدير السابق.'};const meta=opts.meta,supported=await capabilities();
  if(opts.encoder!=='cpu'&&!supported.some(c=>c.id===opts.encoder))return {error:'كارت الشاشة المختار غير متاح. اختار المعالج CPU أو كارت آخر من إعدادات التصدير.'};
  let titleInputs,length;
  try{titleInputs=opts.titles||[];if(!Array.isArray(titleInputs)||titleInputs.length>24)throw new Error('الحد الحالي 24 نص.');let bytes=0;
    for(const t of titleInputs){if(typeof t.png!=='string'||!t.png.startsWith('data:image/png;base64,'))throw new Error('قالب كتابة غير صالح.');bytes+=t.png.length;}if(bytes>80*1024*1024)throw new Error('قوالب النص كبيرة جداً. قلّل عدد النصوص.');
    exportArgs(library.assets,titleInputs.map(t=>({...t,path:'check.png'})),'check.mp4',meta,opts);length=timeline.duration(timeline.validate(meta,opts,library.assets));
  }catch(e){return {error:e.message};}
  const first=library.assets[opts.clips[0].assetId],chosen=await dialog.showSaveDialog(win,{title:'احفظ الفيديو',defaultPath:path.join(path.dirname(first.path),path.parse(projectPath||first.path).name+'-Sahl.mp4'),filters:[{name:'MP4 video',extensions:['mp4']}]});if(chosen.canceled)return {canceled:true};
  if(Object.values(library.assets).some(a=>path.resolve(chosen.filePath).toLowerCase()===a.path.toLowerCase())||projectPath&&path.resolve(chosen.filePath).toLowerCase()===projectPath.toLowerCase())return {error:'اختار اسم مختلف حتى تبقى ملفاتك الأصلية محفوظة.'};
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-')),tempOutput=path.join(path.dirname(chosen.filePath),'.sahl-'+Date.now()+'.mp4'),overlays=[];
  try{titleInputs.forEach((t,i)=>{const p=path.join(work,`title-${i}.png`);fs.writeFileSync(p,Buffer.from(t.png.split(',')[1],'base64'));overlays.push({path:p,start:t.start,duration:t.duration,animation:t.animation});});
    autoSaver.capture();const args=exportArgs(library.assets,overlays,tempOutput,meta,opts),stats=new ExportProgress(length),child=spawn(ffmpeg,args,{windowsHide:true});let resolveDone;const job={process:child,canceled:false,done:new Promise(resolve=>{resolveDone=resolve;})};active=job;let errorLog='',progressBuffer='',settled=false;
    message('progress',stats.snapshot());const progressTimer=setInterval(()=>message('progress',stats.snapshot()),1000);
    child.stderr.on('data',d=>{errorLog=(errorLog+d).slice(-6000);});child.stdout.on('data',d=>{progressBuffer+=d.toString();const lines=progressBuffer.split(/\r?\n/);progressBuffer=lines.pop();for(const line of lines)if(line.startsWith('out_time_us='))message('progress',stats.update(Number(line.split('=')[1])/1e6));});
    const finish=(code,error)=>{if(settled)return;settled=true;clearInterval(progressTimer);const canceled=job.canceled;if(active===job)active=null;try{if(code===0&&!canceled){fs.renameSync(tempOutput,chosen.filePath);lastOutput=chosen.filePath;message('complete',{path:lastOutput,timing:stats.finish(true)});}else{fs.rmSync(tempOutput,{force:true});message('complete',{...(canceled?{canceled:true}:{error:'تعذّر التصدير. تأكد من مساحة القرص. '+(error?.message||errorLog.slice(-1200))}),timing:stats.finish(false)});}}catch(e){message('complete',{error:'تعذّر حفظ الملف: '+e.message+' — النسخة المؤقتة: '+tempOutput,timing:stats.finish(false)});}finally{try{fs.rmSync(work,{recursive:true,force:true});}finally{resolveDone();}}};
    child.on('error',e=>finish(-1,e));child.on('close',code=>finish(code));return {started:true};
  }catch(e){fs.rmSync(work,{recursive:true,force:true});return {error:e.message};}
});
ipcMain.handle('cancel-export',cancelExport);ipcMain.handle('show-output',()=>{if(lastOutput)shell.showItemInFolder(lastOutput);});
ipcMain.handle('list-templates',()=>new TemplateStore(app.getPath('userData')).list());
ipcMain.handle('save-layout',(_,name,titles)=>new TemplateStore(app.getPath('userData')).save(name,titles));

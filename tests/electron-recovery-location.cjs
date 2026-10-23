const electron=require('electron'),{app,BrowserWindow,WebContentsView}=electron,fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const {RecoveryStore}=require('../app/recovery'),{MediaLibrary}=require('../app/library');
const folder=fs.mkdtempSync(path.resolve('test-output/recovery-location-ui-')),profile=path.join(folder,'profile'),disk=path.join(folder,'other-disk'),views=[],hosts=[],errors=[],choices=[];
fs.mkdirSync(disk);app.setPath('userData',profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
electron.protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const timeout=setTimeout(()=>{console.error('Recovery location QA timed out');app.exit(1);},60000);
class TestWindow extends BrowserWindow{constructor(options){super({...options,show:false,width:1200,height:850,webPreferences:{...options.webPreferences,offscreen:true}});hosts.push(this);}}
class TestView extends WebContentsView{constructor(options){super({...options,webPreferences:{...options.webPreferences,offscreen:true}});views.push(this);this.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});}}
const wait=ms=>new Promise(r=>setTimeout(r,ms)),js=(view,source)=>view.webContents.executeJavaScript(source,true);
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await wait(50);}throw Error('Condition timed out');}
app.whenReady().then(async()=>{
 try{
  const library=new MediaLibrary(require('ffmpeg-static'),require('@ffprobe-installer/ffprobe').path);
  for(const name of ['three-colors.mp4','photo.png'])fs.copyFileSync(path.resolve('test-output',name),path.join(folder,name));
  const imported=await library.import([path.join(folder,'three-colors.mp4'),path.join(folder,'photo.png')]),[a,b]=imported.assets;
  const raw={displayName:'مشروع مسترجع',meta:{width:a.width,height:a.height,fps:a.fps},assetIds:[a.id,b.id],clips:[{assetId:a.id,start:0,end:3},{assetId:b.id,start:0,end:2}],titles:[{title:'عنوان محفوظ'}],cursor:1.25};
  const crashed=new RecoveryStore(profile,{id:'crashed',ownerPid:2147483000});await crashed.saveWithMedia(raw,library.assets);
  for(const asset of Object.values(library.assets))fs.unlinkSync(asset.path);
  const requireApp=createRequire(path.resolve('app/main.js')),dialogs={showOpenDialog:async(_,options)=>{assert.ok(options.properties.includes('openDirectory'),'recovery must not request original media');return choices.shift()||{canceled:true};},showMessageBox:async()=>({response:1})};
  const context=vm.createContext({require:name=>name==='electron'?{...electron,BrowserWindow:TestWindow,WebContentsView:TestView,dialog:dialogs,protocol:{registerSchemesAsPrivileged(){}}}:name==='./encoding'?{detectEncoders:async()=>[]}:requireApp(name),__dirname:path.resolve('app'),console,URL,Response,Buffer,AbortController,setInterval,clearInterval});
  vm.runInContext(fs.readFileSync('app/main.js','utf8'),context);
  await until(()=>views.length===1);const view=views[0];await until(()=>js(view,"typeof refreshRecovery==='function'&&document.readyState==='complete'"));
  await js(view,"refreshRecovery(true)");await js(view,"$('restore-recovery').onclick()");await until(()=>js(view,"clips.length===2&&!previewAbort"));
  await js(view,"$('title').value='تعديل محفوظ';commitTitle();checkpoint();seekTo(1.25)");
  const before=await js(view,'JSON.stringify({clips,titles,history,cursor})');
  await js(view,'sahl.newProjectTab()');await until(()=>views.length===2);await until(()=>js(views[1],"typeof openRenderSettings==='function'"));
  const ids=await js(hosts[0],'workspace.state().then(s=>s.tabs.map(t=>t.id))');await js(hosts[0],`workspace.select('${ids[0]}')`);
  await js(view,'openRenderSettings()');assert.equal(await js(view,"$('render-settings-heading').textContent"),'الإعدادات');
  const old=await js(view,"$('recovery-location-path').textContent");assert.equal(old,path.join(profile,'recovery'));
  choices.push({canceled:true});await js(view,"$('choose-recovery-location').onclick()");assert.equal(await js(view,"$('recovery-location-path').textContent"),old);
  choices.push({filePaths:[disk]});await js(view,"$('choose-recovery-location').onclick()");
  const location=await js(view,'sahl.recoverySettings()');assert.ok(location.directory.startsWith(disk));assert.equal((await js(views[1],'sahl.recoverySettings()')).directory,location.directory);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'recovery-location.json'))).directory,location.directory);
  assert.equal(await js(view,'JSON.stringify({clips,titles,history,cursor})'),before,'migration retains edits, cursor and undo');
  const bytes=await js(view,'fetch(assets[0].url).then(r=>r.arrayBuffer()).then(b=>b.byteLength)');assert.equal(bytes,fs.statSync(path.resolve('test-output/three-colors.mp4')).size);
  await vm.runInContext('Promise.all([...projects].map(p=>p.capture()))',context);
  const reader=new RecoveryStore(profile,{id:'reader',isAlive:()=>false,recoveryDirectory:location.directory});assert.ok(reader.list().length);assert.ok(reader.read(reader.list()[0].id).sources.every(s=>s.resolved?.startsWith(location.directory)));
  assert.equal(await js(view,"$('render-settings-dialog').getBoundingClientRect().height<innerHeight"),true);
  await wait(150);fs.writeFileSync(path.join(folder,'settings.png'),(await view.webContents.capturePage()).toPNG());
  assert.deepEqual(errors,[]);console.log('PASS recovery settings, folder picker cancellation, migration of restored media across tabs, persisted location and retained edits. Screenshot:',path.join(folder,'settings.png'));
  clearTimeout(timeout);hosts[0].close();await until(()=>hosts[0].isDestroyed());app.exit(0);
 }catch(e){console.error(e);clearTimeout(timeout);app.exit(1);}
});

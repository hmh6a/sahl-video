// electron-updater verifies release checksums and stages updates in its private cache.
// Installation is explicit so closing the editor never silently installs an update.
class Updates {
  constructor(version,{notify=()=>{},enabled=true,disabledReason,updater,tokenFactory}={}) {
    this.version=version;this.notify=notify;this.enabled=enabled;
    this.available=null;this.downloaded=false;this.inflight=null;this.controller=null;this.done=Promise.resolve();
    this.state={phase:enabled?'idle':'disabled',currentVersion:version,message:disabledReason};
    if(!enabled)return;
    this.updater=updater||require('electron-updater').autoUpdater;
    this.tokenFactory=tokenFactory||(()=>new (require('electron-updater').CancellationToken)());
    const u=this.updater;u.autoDownload=false;u.autoInstallOnAppQuit=false;u.autoRunAppAfterInstall=true;u.allowPrerelease=false;u.allowDowngrade=false;
    u.on('update-available',info=>{this.available=info;this.emit({phase:'available',version:info.version});});
    u.on('update-not-available',()=>{this.available=null;this.emit({phase:'current'});});
    u.on('download-progress',p=>this.emit({phase:'downloading',version:this.available?.version,percent:Math.max(0,Math.min(99,Math.floor(p.percent||0)))}));
    u.on('update-downloaded',info=>{this.downloaded=true;this.emit({phase:'downloaded',version:info.version});});
    u.on('error',error=>this.emit({phase:'error',version:this.available?.version,message:'تعذّر إكمال التحديث: '+error.message}));
  }
  status(){return {...this.state,canInstall:this.downloaded,canDownload:!!this.available&&!this.downloaded};}
  emit(value){this.state={currentVersion:this.version,...value};this.notify(this.status());return this.status();}
  check(){
    if(!this.enabled||this.controller||this.downloaded||this.state.phase==='installing')return Promise.resolve(this.status());
    if(this.inflight)return this.inflight;
    this.emit({phase:'checking'});
    this.inflight=Promise.resolve().then(()=>this.updater.checkForUpdates()).then(()=>this.status()).catch(e=>this.emit({phase:'error',message:e.message})).finally(()=>{this.inflight=null;});
    return this.inflight;
  }
  cancel(){this.controller?.cancel();}
  download(){
    if(!this.enabled||this.inflight||this.downloaded||this.state.phase==='installing')return Promise.resolve(this.status());
    if(this.controller)return this.done;
    if(!this.available)return Promise.resolve(this.emit({phase:'error',message:'افحص التحديثات أولاً.'}));
    const token=this.tokenFactory();this.controller=token;
    this.emit({phase:'downloading',version:this.available.version,percent:0});
    this.done=Promise.resolve().then(()=>this.updater.downloadUpdate(token)).then(()=>this.status()).catch(error=>this.emit(token.cancelled?{phase:'available',version:this.available.version,message:'تم إلغاء التحديث.'}:{phase:'error',version:this.available.version,message:'تعذّر تنزيل التحديث: '+error.message})).finally(()=>{this.controller=null;});
    return this.done;
  }
  install(){
    if(!this.enabled||!this.downloaded||this.state.phase==='installing')return this.status();
    this.emit({phase:'installing',version:this.available?.version});
    try{this.updater.quitAndInstall(true,true);}catch(e){this.emit({phase:'error',message:'تعذّر تثبيت التحديث: '+e.message});}
    return this.status();
  }
}
module.exports={Updates};

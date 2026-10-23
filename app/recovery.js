const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Project=require('./project');
const {RecoveryCache}=require('./recovery-cache');
const INTERVAL_MS=60000;
function alive(pid){if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
class RecoveryStore{
  constructor(directory,{id=crypto.randomUUID(),ownerPid=process.pid,isAlive=alive,now=Date.now}={}){this.directory=path.join(directory,'recovery');this.id=id;this.ownerPid=ownerPid;this.isAlive=isAlive;this.now=now;this.generation=0;this.fingerprint=null;this.cache=new RecoveryCache(this.directory);this.pending=null;this.controller=null;}
  file(id,slot){if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new Error('نسخة الاسترجاع غير صالحة.');return path.join(this.directory,id+'.'+slot+'.sahl');}
  save(raw,registry,{projectPath=null,portable=false,force=false,backups=null}={}){
    const ids=Project.assetIds(raw),assets={};
    for(const id of ids){if(!registry[id])throw new Error('ملف من ملفات المشروع مفقود.');assets[id]=registry[id];}
    const clean=Project.state(raw,assets),document={app:'sahl-video',version:Project.VERSION,...clean,assets:Object.entries(assets).map(([id,a])=>({id,kind:a.kind,name:a.name||path.basename(a.path),path:path.resolve(a.path),...(backups?.[id]?{relativePath:path.relative(this.directory,backups[id].path)}:{})}))};
    const fingerprint=JSON.stringify({document,projectPath,portable});if(!force&&fingerprint===this.fingerprint)return null;
    const savedAt=this.now(),generation=this.generation+1;
    document.recovery={id:this.id,ownerPid:this.ownerPid,generation,savedAt,projectPath,portable};
    fs.mkdirSync(this.directory,{recursive:true});const file=this.file(this.id,generation%2),temporary=file+'.'+crypto.randomUUID()+'.tmp';let fd;
    // Two alternating snapshots keep the previous complete version after a crash.
    try{fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,JSON.stringify(document),'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temporary,file);}
    finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    this.generation=generation;this.fingerprint=fingerprint;return {savedAt};
  }
  saveWithMedia(raw,registry,options={}){
    if(this.pending)return this.pending;
    const assets=Object.fromEntries(Project.assetIds(raw).map(id=>{if(!registry[id])throw new Error('ملف من ملفات المشروع مفقود.');return [id,{...registry[id]}];}));
    const clean={...Project.state(raw,assets),assetIds:Object.keys(assets)},controller=new AbortController();this.controller=controller;
    this.pending=(async()=>{
      let prepared,copied=false;
      try{prepared=await this.cache.prepare(assets,{signal:controller.signal,onProgress:value=>{copied=true;options.onProgress?.(value);}});if(controller.signal.aborted)return null;return this.save(clean,assets,{...options,force:options.force||copied,backups:prepared.backups});}
      finally{prepared?.release();this.pending=null;this.controller=null;if(controller.signal.aborted)this.cache.collect();}
    })();return this.pending;
  }
  cancelPending(){this.controller?.abort();return this.pending?.catch(()=>{});}
  entries(){
    if(!fs.existsSync(this.directory))return [];const latest=new Map();
    for(const name of fs.readdirSync(this.directory)){
      const match=/^([a-zA-Z0-9-]{1,80})\.[01]\.sahl$/.exec(name);if(!match)continue;
      try{const file=this.file(match[1],name.endsWith('.0.sahl')?0:1),{raw}=Project.readProject(file),r=raw.recovery;
        if(!r||r.id!==match[1]||!Number.isFinite(r.savedAt)||!Number.isInteger(r.generation)||r.generation<1)continue;
        if(!latest.has(r.id)||r.generation>latest.get(r.id).raw.recovery.generation)latest.set(r.id,{file,raw});
      }catch{/* A partial/corrupt snapshot never hides the other complete slot. */}
    }
    return [...latest.values()].filter(x=>x.raw.recovery.id!==this.id&&!this.isAlive(x.raw.recovery.ownerPid)).sort((a,b)=>b.raw.recovery.savedAt-a.raw.recovery.savedAt);
  }
  list(){return this.entries().map(({raw})=>({id:raw.recovery.id,savedAt:raw.recovery.savedAt,name:Project.displayName(raw.displayName)||(raw.recovery.projectPath?path.basename(raw.recovery.projectPath):'مشروع غير مسمّى'),clips:raw.clips?.length||0,texts:raw.titles?.length||0}));}
  read(id){this.file(id,0);const entry=this.entries().find(x=>x.raw.recovery.id===id);if(!entry)throw new Error('نسخة الاسترجاع غير متاحة، أو مفتوحة بنافذة ثانية.');return {file:entry.file,...Project.readProject(entry.file)};}
  clear(id=this.id){if(id===this.id)this.cancelPending();for(const slot of [0,1]){try{fs.unlinkSync(this.file(id,slot));}catch(e){if(e.code!=='ENOENT')throw e;}}if(id===this.id){this.fingerprint=null;this.generation=0;}this.cache.collect();}
}
class AutoSaver{
  constructor(store,getContext,onStatus,{setIntervalFn=setInterval,clearIntervalFn=clearInterval}={}){this.store=store;this.getContext=getContext;this.onStatus=onStatus;this.clearIntervalFn=clearIntervalFn;this.timer=setIntervalFn(()=>this.capture(),INTERVAL_MS);this.timer?.unref?.();}
  capture(){if(this.pending)return this.pending;const c=this.getContext();if(this.stopped||!c?.dirty||c.blocked||!c.raw)return Promise.resolve(null);
    this.pending=(async()=>{try{const saved=await this.store.saveWithMedia(c.raw,c.assets,{...c,onProgress:value=>this.onStatus(value)});if(saved&&!this.stopped)this.onStatus({phase:'saved',...saved});return saved;}catch(e){if(e.name!=='AbortError'&&!this.stopped)this.onStatus({phase:'error',message:e.message});return null;}})().finally(()=>{this.pending=null;});return this.pending;
  }
  async pause(){const pending=this.pending;await this.store.cancelPending();await pending;if(pending&&!this.stopped)this.onStatus({phase:'ready'});}
  stop(){this.stopped=true;this.clearIntervalFn(this.timer);this.store.cancelPending();}
}
module.exports={RecoveryStore,AutoSaver,INTERVAL_MS};

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Project=require('./project');
const INTERVAL_MS=60000;
function alive(pid){if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
class RecoveryStore{
  constructor(directory,{id=crypto.randomUUID(),ownerPid=process.pid,isAlive=alive,now=Date.now}={}){this.directory=path.join(directory,'recovery');this.id=id;this.ownerPid=ownerPid;this.isAlive=isAlive;this.now=now;this.generation=0;this.fingerprint=null;}
  file(id,slot){if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new Error('نسخة الاسترجاع غير صالحة.');return path.join(this.directory,id+'.'+slot+'.sahl');}
  save(raw,registry,{projectPath=null,portable=false,force=false}={}){
    const ids=[...new Set(raw.assetIds||raw.clips.map(c=>c.assetId))],assets={};
    for(const id of ids){if(!registry[id])throw new Error('ملف من ملفات المشروع مفقود.');assets[id]=registry[id];}
    const clean=Project.state(raw,assets),document={app:'sahl-video',version:1,...clean,assets:Object.entries(assets).map(([id,a])=>({id,kind:a.kind,name:a.name||path.basename(a.path),path:path.resolve(a.path)}))};
    const fingerprint=JSON.stringify({document,projectPath,portable});if(!force&&fingerprint===this.fingerprint)return null;
    const savedAt=this.now(),generation=this.generation+1;
    document.recovery={id:this.id,ownerPid:this.ownerPid,generation,savedAt,projectPath,portable};
    fs.mkdirSync(this.directory,{recursive:true});const file=this.file(this.id,generation%2),temporary=file+'.'+crypto.randomUUID()+'.tmp';let fd;
    // Two alternating snapshots keep the previous complete version after a crash.
    try{fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,JSON.stringify(document),'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temporary,file);}
    finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    this.generation=generation;this.fingerprint=fingerprint;return {savedAt};
  }
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
  list(){return this.entries().map(({raw})=>({id:raw.recovery.id,savedAt:raw.recovery.savedAt,name:raw.recovery.projectPath?path.basename(raw.recovery.projectPath):'مشروع غير مسمّى',clips:raw.clips?.length||0,texts:raw.titles?.length||0}));}
  read(id){this.file(id,0);const entry=this.entries().find(x=>x.raw.recovery.id===id);if(!entry)throw new Error('نسخة الاسترجاع غير متاحة، أو مفتوحة بنافذة ثانية.');return {file:entry.file,...Project.readProject(entry.file)};}
  clear(id=this.id){for(const slot of [0,1]){try{fs.unlinkSync(this.file(id,slot));}catch(e){if(e.code!=='ENOENT')throw e;}}if(id===this.id){this.fingerprint=null;this.generation=0;}}
}
class AutoSaver{
  constructor(store,getContext,onStatus,{setIntervalFn=setInterval,clearIntervalFn=clearInterval}={}){this.store=store;this.getContext=getContext;this.onStatus=onStatus;this.clearIntervalFn=clearIntervalFn;this.timer=setIntervalFn(()=>this.capture(),INTERVAL_MS);this.timer?.unref?.();}
  capture(){const c=this.getContext();if(!c?.dirty||c.blocked||!c.raw)return null;try{const saved=this.store.save(c.raw,c.assets,c);if(saved)this.onStatus({phase:'saved',...saved});return saved;}catch(e){this.onStatus({phase:'error',message:e.message});return null;}}
  stop(){this.clearIntervalFn(this.timer);}
}
module.exports={RecoveryStore,AutoSaver,INTERVAL_MS};

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const Project=require('./project'),fsp=fs.promises;
const copies=new Map(),pins=new Map(),mediaName=/^[a-f0-9]{64}\.[a-z0-9]{1,16}$/;
function abort(signal){if(signal?.aborted){const error=new Error('تم إيقاف نسخ وسائط الاسترجاع.');error.name='AbortError';throw error;}}
function pin(file){pins.set(file,(pins.get(file)||0)+1);return ()=>{const count=pins.get(file)-1;count?pins.set(file,count):pins.delete(file);};}
async function valid(file,size){try{const stat=await fsp.lstat(file);return stat.isFile()&&!stat.isSymbolicLink()&&stat.size===size;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function waitFor(promise,signal){
  abort(signal);if(!signal)return promise;
  return new Promise((resolve,reject)=>{const stopped=()=>{try{abort(signal);}catch(e){reject(e);}};signal.addEventListener('abort',stopped,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stopped));});
}
async function copy(source,destination,before,signal,progress){
  const temporary=destination+'.'+process.pid+'.'+crypto.randomUUID()+'.part';
  try{
    let bytes=0,last=0;progress(0);
    const count=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;const now=Date.now();if(now-last>=200){last=now;progress(bytes);}done(null,chunk);}});
    await pipeline(fs.createReadStream(source,{highWaterMark:1024*1024}),count,fs.createWriteStream(temporary,{flags:'wx'}),{signal});
    const after=await fsp.stat(source);
    if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||!await valid(temporary,before.size))throw new Error('تغيّر الملف أثناء النسخ. سيُعاد الحفظ: '+path.basename(source));
    const handle=await fsp.open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}
    abort(signal);await fsp.rename(temporary,destination);progress(before.size);
  }finally{await fsp.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function ensureCopy(source,destination,stat,signal,notify){
  if(await valid(destination,stat.size))return;
  let job=copies.get(destination);
  if(job?.controller.signal.aborted){await job.promise.catch(()=>{});job=null;}
  if(!job){
    job={controller:new AbortController(),listeners:new Set(),done:false};copies.set(destination,job);
    job.promise=copy(source,destination,stat,job.controller.signal,bytes=>{for(const listener of job.listeners)listener(bytes);}).finally(()=>{job.done=true;if(copies.get(destination)===job)copies.delete(destination);});
  }
  job.listeners.add(notify);
  try{await waitFor(job.promise,signal);}finally{job.listeners.delete(notify);if(!job.done&&!job.listeners.size)job.controller.abort();}
}
class RecoveryCache{
  static async drain(){await Promise.allSettled([...copies.values()].map(job=>job.promise));}
  constructor(directory){this.directory=path.join(directory,'media');this.known=new Map();try{this.cleanInterruptedCopies();}catch{/* Autosave reports access errors without blocking app startup. */}}
  cleanInterruptedCopies(){
    if(!fs.existsSync(this.directory)||fs.lstatSync(this.directory).isSymbolicLink())return;
    for(const name of fs.readdirSync(this.directory)){
      const match=/^[a-f0-9]{64}\.[a-z0-9]{1,16}\.(\d+)\.[a-f0-9-]{36}\.part$/.exec(name);if(!match)continue;
      const pid=Number(match[1]);if(!Number.isSafeInteger(pid)||pid<1)continue;
      try{process.kill(pid,0);continue;}catch(e){if(e.code!=='ESRCH')continue;}
      try{fs.unlinkSync(path.join(this.directory,name));}catch{/* A locked partial can be retried on the next launch. */}
    }
  }
  async prepare(assets,{signal,onProgress=()=>{}}={}){
    const release=[],backups={};
    try{
      await fsp.mkdir(this.directory,{recursive:true});
      if((await fsp.lstat(this.directory)).isSymbolicLink())throw new Error('مجلد وسائط الاسترجاع غير صالح.');
      const jobs=Object.entries(assets);let index=0;
      for(const [id,asset]of jobs){
        abort(signal);index++;
        const source=path.resolve(asset.path),name=asset.name||path.basename(source),key=asset.kind+':'+source;
        let stat;try{stat=await fsp.stat(source);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(!stat){
          const previous=this.known.get(key);
          if(!previous||!await valid(previous.path,previous.size))throw new Error('ملف الوسائط غير موجود ولم تكتمل نسخته الاحتياطية: '+name);
          release.push(pin(previous.path));backups[id]=previous;continue;
        }
        if(!stat.isFile())throw new Error('ملف الوسائط غير متاح: '+name);
        const managed=path.dirname(source)===this.directory&&mediaName.test(path.basename(source));
        const signature=crypto.createHash('sha256').update(JSON.stringify([source,stat.size,stat.mtimeMs,stat.ctimeMs])).digest('hex');
        const extension=path.extname(source).slice(1).toLowerCase();
        const destination=managed?source:path.join(this.directory,signature+'.'+(/^[a-z0-9]{1,16}$/.test(extension)?extension:'bin'));
        release.push(pin(destination));
        if(managed&&!await valid(source,stat.size))throw new Error('نسخة وسائط الاسترجاع غير صالحة: '+name);
        if(!managed)await ensureCopy(source,destination,stat,signal,bytes=>onProgress({phase:'copying',name,index,count:jobs.length,percent:stat.size?Math.floor(bytes/stat.size*100):100}));
        abort(signal);backups[id]={path:destination,size:stat.size};this.known.set(key,backups[id]);
      }
      return {backups,release:()=>release.forEach(fn=>fn())};
    }catch(e){release.forEach(fn=>fn());if(e.code==='ENOSPC')throw new Error('المساحة ما تكفي لنسخ وسائط الحفظ التلقائي. النسخة السابقة باقية؛ فرّغ مساحة حتى يكتمل الحفظ.');throw e;}
  }
  collect(){
    // Both generations and all open projects share immutable copies. Never touch
    // an original source, a pinned copy, or files outside this managed directory.
    if(!fs.existsSync(this.directory)||fs.lstatSync(this.directory).isSymbolicLink())return;
    const referenced=new Set();
    for(const name of fs.readdirSync(path.dirname(this.directory))){
      if(!/^[a-zA-Z0-9-]{1,80}\.[01]\.sahl$/.test(name))continue;
      let raw;try{({raw}=Project.readProject(path.join(path.dirname(this.directory),name)));}catch{return;}
      for(const asset of raw.assets){if(asset.relativePath)referenced.add(path.resolve(path.dirname(this.directory),asset.relativePath));if(asset.path)referenced.add(path.resolve(asset.path));}
    }
    for(const name of fs.readdirSync(this.directory)){
      if(!mediaName.test(name))continue;const file=path.join(this.directory,name);
      if(!referenced.has(file)&&!pins.has(file)&&!copies.has(file))try{fs.unlinkSync(file);}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}
    }
  }
}
module.exports={RecoveryCache};

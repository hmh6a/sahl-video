const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const Project=require('./project'),fsp=fs.promises;
const snapshotName=/^[a-zA-Z0-9-]{1,80}\.[01]\.sahl$/,mediaName=/^[a-f0-9]{64}\.[a-z0-9]{1,16}$/;
function mapPath(file,from,to){return typeof file==='string'&&Project.inside(from,file)?path.join(to,path.relative(from,file)):file;}
function managed(name){return snapshotName.test(name)||name.startsWith('media/')&&mediaName.test(name.slice(6));}
async function writeAtomic(file,value){
  const temp=file+'.'+crypto.randomUUID()+'.tmp';let handle;
  try{handle=await fsp.open(temp,'wx');await handle.writeFile(JSON.stringify(value),'utf8');await handle.sync();await handle.close();handle=null;await fsp.rename(temp,file);}
  finally{await handle?.close();await fsp.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
class RecoveryLocation{
  constructor(userData){
    this.userData=userData;this.file=path.join(userData,'recovery-location.json');this.directory=path.join(userData,'recovery');this.pendingCleanup=[];
    if(fs.existsSync(this.file)){
      const value=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(typeof value.directory!=='string'||!path.isAbsolute(value.directory))throw Error('مسار الحفظ التلقائي المحفوظ غير صالح.');
      this.directory=value.directory;this.pendingCleanup=Array.isArray(value.pendingCleanup)?value.pendingCleanup:[];
    }
  }
  settings(){return {directory:this.directory};}
  async persist(directory,pendingCleanup){await fsp.mkdir(this.userData,{recursive:true});await writeAtomic(this.file,{directory,pendingCleanup});}
  async inventory(){
    const files=[];
    for(const sub of ['', 'media']){
      const folder=path.join(this.directory,sub);let entries;
      try{if((await fsp.lstat(folder)).isSymbolicLink())throw Error('مجلد الحفظ التلقائي غير صالح.');entries=await fsp.readdir(folder);}
      catch(e){if(e.code==='ENOENT'&&(sub||this.directory===path.join(this.userData,'recovery')))continue;throw e;}
      for(const name of entries){
        const relative=sub?sub+'/'+name:name;if(!managed(relative))continue;
        const file=path.join(this.directory,relative),stat=await fsp.lstat(file);
        if(!stat.isFile()||stat.isSymbolicLink())throw Error('ملف الحفظ التلقائي غير صالح: '+name);
        files.push({name:relative,size:stat.size,mtimeMs:stat.mtimeMs});
      }
    }
    return files;
  }
  async move(parent,{onProgress=()=>{}}={}){
    if(this.moving)throw Error('نقل الحفظ التلقائي قيد التنفيذ.');this.moving=true;
    let destination;const oldDirectory=this.directory,created=[];
    try{
      if(typeof parent!=='string'||!path.isAbsolute(parent))throw Error('اختار مجلداً صالحاً للحفظ التلقائي.');
      parent=await fsp.realpath(parent);
      const oldReal=await fsp.realpath(oldDirectory).catch(e=>{if(e.code==='ENOENT')return oldDirectory;throw e;});
      if(!path.relative(oldReal,parent)||Project.inside(oldReal,parent))throw Error('اختار مكاناً خارج مجلد الحفظ التلقائي الحالي.');
      const files=await this.inventory();
      // A new dedicated folder avoids merging into or overwriting user files.
      for(let n=1;n<10000;n++){
        const candidate=path.join(parent,'Sahl Autosave'+(n===1?'':' ('+n+')'));
        try{await fsp.mkdir(candidate);destination=candidate;break;}catch(e){if(e.code!=='EEXIST')throw e;}
      }
      if(!destination)throw Error('تعذّر إنشاء مجلد الحفظ التلقائي.');
      await fsp.mkdir(path.join(destination,'media'));
      const totalBytes=files.reduce((sum,f)=>sum+f.size,0);let copiedBytes=0,lastTick=0;
      const progress=(name,force=false)=>{const now=Date.now();if(force||now-lastTick>=150){lastTick=now;onProgress({phase:'moving',name,percent:totalBytes?Math.min(99,Math.floor(copiedBytes/totalBytes*100)):0,directory:oldDirectory});}};
      progress('',true);
      for(const item of files){
        const source=path.join(oldDirectory,item.name),target=path.join(destination,item.name);created.push(target);
        if(item.name.startsWith('media/')){
          const count=new Transform({transform(chunk,encoding,done){copiedBytes+=chunk.length;progress(path.basename(source));done(null,chunk);}});
          await pipeline(fs.createReadStream(source,{highWaterMark:1024*1024}),count,fs.createWriteStream(target,{flags:'wx'}));
          const after=await fsp.stat(source),copied=await fsp.stat(target);
          if(after.size!==item.size||after.mtimeMs!==item.mtimeMs||copied.size!==item.size)throw Error('تغيّر ملف أثناء النقل. حاول مرة ثانية.');
          const handle=await fsp.open(target,'r+');try{await handle.sync();}finally{await handle.close();}
        }else{
          const text=await fsp.readFile(source,'utf8');let raw;
          try{raw=JSON.parse(text);}catch{/* Preserve corrupt generations for diagnostics and fallback. */}
          if(raw?.app==='sahl-video'&&Array.isArray(raw.assets)){
            for(const asset of raw.assets){
              asset.path=mapPath(asset.path,oldDirectory,destination);
              if(typeof asset.relativePath==='string')asset.relativePath=path.relative(destination,mapPath(path.resolve(oldDirectory,asset.relativePath),oldDirectory,destination));
            }
            await writeAtomic(target,raw);
          }else await fsp.writeFile(target,text,{flag:'wx'});
          copiedBytes+=item.size;
        }
        progress(path.basename(source),true);
      }
      const pendingCleanup=[...this.pendingCleanup,{directory:oldDirectory,files}];
      await this.persist(destination,pendingCleanup);this.directory=destination;this.pendingCleanup=pendingCleanup;
      return {oldDirectory,directory:destination};
    }catch(e){
      // Only files created by this transaction inside its fresh destination.
      if(destination){for(const file of created)if(Project.inside(destination,file))await fsp.unlink(file).catch(()=>{});await fsp.rmdir(path.join(destination,'media')).catch(()=>{});await fsp.rmdir(destination).catch(()=>{});}
      if(e.code==='ENOSPC')throw Error('المساحة بالقرص الجديد ما تكفي. الحفظ التلقائي ونسخه بقوا بالمكان السابق.');
      throw e;
    }finally{this.moving=false;}
  }
  async cleanup(){
    if(this.pendingCleanup.length){try{if(!(await fsp.stat(this.directory)).isDirectory())return {cleanupPending:true};}catch{return {cleanupPending:true};}}
    const remaining=[];
    for(const entry of this.pendingCleanup){
      if(typeof entry.directory!=='string'||!path.isAbsolute(entry.directory)||entry.directory===this.directory||Project.inside(entry.directory,this.directory)||!Array.isArray(entry.files))continue;
      try{if((await fsp.lstat(entry.directory)).isSymbolicLink())continue;}catch(e){if(e.code==='ENOENT')continue;remaining.push(entry);continue;}
      const files=[];
      for(const item of entry.files){
        if(typeof item.name!=='string'||!managed(item.name))continue;const file=path.resolve(entry.directory,item.name);
        if(!Project.inside(entry.directory,file))continue;
        try{
          if(item.name.startsWith('media/')&&(await fsp.lstat(path.join(entry.directory,'media'))).isSymbolicLink())continue;
          const stat=await fsp.lstat(file);
          if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===item.size&&stat.mtimeMs===item.mtimeMs)await fsp.unlink(file);
        }catch(e){if(e.code!=='ENOENT')files.push(item);}
      }
      if(files.length)remaining.push({...entry,files});
      // Empty-folder removal is deliberately non-recursive.
      await fsp.rmdir(path.join(entry.directory,'media')).catch(()=>{});await fsp.rmdir(entry.directory).catch(()=>{});
    }
    if(this.pendingCleanup.length){this.pendingCleanup=remaining;await this.persist(this.directory,remaining);}
    return {cleanupPending:remaining.length>0};
  }
}
module.exports={RecoveryLocation,mapPath};

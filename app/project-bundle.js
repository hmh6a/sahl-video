const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const Project=require('./project'),fsp=fs.promises;
function canceled(signal){if(signal?.aborted){const error=new Error('تم إلغاء حفظ المشروع.');error.name='AbortError';throw error;}}
function basename(name){const cleaned=path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_'),extension=path.extname(cleaned);return (path.basename(cleaned,extension).slice(0,120)||'media')+extension.slice(0,16);}
async function createFolder(requested){
  const parent=path.dirname(path.resolve(requested)),stem=path.basename(requested,path.extname(requested));
  for(let n=1;n<10000;n++){
    const name=stem+(n===1?'':` (${n})`),folder=path.join(parent,name);
    try{await fsp.mkdir(folder);return {folder,file:path.join(folder,name+'.sahl')};}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  throw new Error('اختار اسم مختلف للمشروع.');
}
// Only the final manifest is replaced. Existing media and the previous save remain
// intact until every new copy has finished; cancellation removes only our own files.
async function saveBundle(requested,raw,registry,{existing=false,signal,onProgress=()=>{},progressInterval=100}={}){
  const notify=value=>{try{onProgress(value);}catch{}};
  const ids=Project.assetIds(raw),sources={},jobs=[];
  for(const id of ids){if(!registry[id])throw new Error('ملف من ملفات المشروع مفقود.');sources[id]=registry[id];}
  const clean=Project.state(raw,sources);canceled(signal);
  let file,folder,newFolder=false,mediaCreated=false,mediaDir,temporary;const created=[];
  try{
    if(existing){file=path.resolve(requested);folder=path.dirname(file);}else{({file,folder}=await createFolder(requested));newFolder=true;}
    mediaDir=path.join(folder,'media');try{await fsp.mkdir(mediaDir);mediaCreated=true;}catch(e){if(e.code!=='EEXIST')throw e;}
    if((await fsp.lstat(mediaDir)).isSymbolicLink()||!(await fsp.stat(mediaDir)).isDirectory())throw new Error('مجلد الوسائط غير صالح.');
    const mediaReal=await fsp.realpath(mediaDir);let totalBytes=0;
    // Validate every source before writing any media.
    for(const [id,a]of Object.entries(sources)){
      canceled(signal);const stat=await fsp.stat(a.path);if(!stat.isFile())throw new Error('الملف غير متوفر: '+path.basename(a.path));
      const actual=await fsp.realpath(a.path),reuse=Project.inside(mediaReal,actual)&&!(await fsp.lstat(a.path)).isSymbolicLink();
      jobs.push({id,asset:a,stat,reuse,name:a.name||path.basename(a.path)});totalBytes+=stat.size;
    }
    let copiedBytes=0,index=0,lastTick=0;const assets={};
    const progress=(name,force=false)=>{const now=Date.now();if(force||now-lastTick>=progressInterval){lastTick=now;notify({phase:'copying',name,index,count:jobs.length,copiedBytes,totalBytes,percent:totalBytes?Math.min(99,copiedBytes/totalBytes*100):99});}};
    progress('',true);
    for(const job of jobs){
      canceled(signal);index++;const a=job.asset;let destination;
      if(job.reuse){destination=a.path;copiedBytes+=job.stat.size;progress(job.name,true);}
      else{
        destination=path.join(mediaDir,crypto.randomUUID()+'-'+basename(job.name));temporary=destination+'.part';created.push(temporary);
        progress(job.name,true);
        const count=new Transform({transform(chunk,encoding,callback){copiedBytes+=chunk.length;progress(job.name);callback(null,chunk);}});
        await pipeline(fs.createReadStream(a.path,{highWaterMark:1024*1024}),count,fs.createWriteStream(temporary,{flags:'wx'}),{signal});
        const after=await fsp.stat(a.path),copy=await fsp.stat(temporary);
        if(after.size!==job.stat.size||after.mtimeMs!==job.stat.mtimeMs||copy.size!==job.stat.size)throw new Error('تغيّر الملف أثناء النسخ. حاول الحفظ مرة ثانية: '+job.name);
        canceled(signal);await fsp.rename(temporary,destination);created.push(destination);temporary=null;
      }
      assets[job.id]={...a,path:destination,name:job.name};
    }
    canceled(signal);
    const document={app:'sahl-video',version:Project.VERSION,portable:true,...clean,assets:Object.entries(assets).map(([id,a])=>({id,kind:a.kind,name:a.name,relativePath:path.relative(folder,a.path)}))};
    const manifest=file+'.'+crypto.randomUUID()+'.tmp';created.push(manifest);await fsp.writeFile(manifest,JSON.stringify(document,null,2),'utf8');canceled(signal);Project.backupLegacy(file);await fsp.rename(manifest,file);
    notify({phase:'saved',percent:100,index:jobs.length,count:jobs.length,copiedBytes,totalBytes});
    return {file,folder,document,assets};
  }catch(e){
    // All paths below were created by this call under the chosen project folder.
    for(const item of created.reverse())if(folder&&Project.inside(folder,item))await fsp.unlink(item).catch(()=>{});
    if(mediaCreated)await fsp.rmdir(mediaDir).catch(()=>{});
    if(newFolder)await fsp.rmdir(folder).catch(()=>{});
    if(e.name==='AbortError')throw e;
    if(e.code==='ENOSPC')throw new Error('المساحة ما تكفي لنسخ ملفات المشروع. اختار قرص بيه مساحة أكثر.');
    throw e;
  }
}
module.exports={saveBundle};

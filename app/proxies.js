const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),Color=require('./color');
// Cache files never replace registry paths. Only this service can resolve proxy URLs.
class ProxyService{
  constructor(ffmpeg,directory,{limit=2*1024**3,notify=()=>{}}={}){this.ffmpeg=ffmpeg;this.directory=directory;this.limit=limit;this.notify=notify;this.queue=[];this.running=null;this.paused=false;this.epoch=0;this.urls=new Map();}
  async key(asset,size){if(!asset||asset.kind!=='video'||![540,720].includes(size))throw new Error('اختار فيديو ودقة 540p أو720p.');const stat=await fs.promises.stat(asset.path);return crypto.createHash('sha256').update(JSON.stringify([4,path.resolve(asset.path),stat.size,stat.mtimeMs,size,asset.meta])).digest('hex');}
  file(key){return path.join(this.directory,key+'.mp4');}
  resolve(key){return /^[a-f0-9]{64}$/.test(key||'')?this.urls.get(key):null;}
  async lookup(asset,size=540){const key=await this.key(asset,size),file=this.file(key);try{const s=await fs.promises.stat(file);if(s.size){this.urls.set(key,file);await fs.promises.utimes(file,new Date(),new Date());return {id:asset.id,size,key,url:'sahl-media://proxy/'+key,hdr:!!asset.meta.hdr};}}catch{}return null;}
  async initialize(){
    if(!this.initializing)this.initializing=(async()=>{await fs.promises.mkdir(this.directory,{recursive:true});for(const name of await fs.promises.readdir(this.directory)){const match=/^[a-f0-9]{64}\.(\d+)\.[a-f0-9-]+\.tmp\.mp4$/.exec(name);if(!match)continue;let alive=true;try{process.kill(Number(match[1]),0);}catch(e){alive=e.code==='EPERM';}if(!alive)await fs.promises.rm(path.join(this.directory,name),{force:true});}})();return this.initializing;
  }
  async stats(){await this.initialize();const files=await fs.promises.readdir(this.directory);const entries=[];for(const name of files)if(/^[a-f0-9]{64}\.mp4$/.test(name)){try{const stat=await fs.promises.stat(path.join(this.directory,name));entries.push({name,size:stat.size,time:stat.mtimeMs});}catch{}}return {entries,bytes:entries.reduce((n,e)=>n+e.size,0),limit:this.limit};}
  async prune(extra=0,keep=null){const stats=await this.stats();let bytes=stats.bytes;for(const e of stats.entries.sort((a,b)=>a.time-b.time)){if(bytes+extra<=this.limit)break;if(e.name===keep)continue;await fs.promises.rm(path.join(this.directory,e.name),{force:true});this.urls.delete(e.name.slice(0,-4));bytes-=e.size;}if(bytes+extra>this.limit)throw new Error('النسخة أكبر من حد ذاكرة المعاينة (2 GB). قلّل المدة أو استخدم الأصل.');}
  request(asset,size=540){const existing=[this.running,...this.queue].find(j=>j&&j.id===asset?.id&&j.size===size);if(existing)return existing.promise;const job={id:asset?.id,asset,size,epoch:this.epoch,canceled:false};job.promise=new Promise(resolve=>job.resolve=resolve);this.queue.push(job);this.emit(job,{phase:'queued',percent:0});this.pump();return job.promise;}
  emit(job,data){if(job.epoch===this.epoch)this.notify({id:job.id,size:job.size,...data});}
  cancel(id){for(const job of [this.running,...this.queue])if(job&&(!id||job.id===id)){job.canceled=true;job.child?.kill('SIGKILL');}this.pump();}
  async reset(){this.epoch++;this.cancel();this.urls.clear();await Promise.all([this.running,...this.queue].filter(Boolean).map(j=>j.promise));}
  setPaused(value){this.paused=value;this.pump();}
  async clear(){await this.reset();const {entries}=await this.stats();for(const e of entries)await fs.promises.rm(path.join(this.directory,e.name),{force:true});return this.stats();}
  pump(){for(const job of this.queue.filter(j=>j.canceled)){this.queue.splice(this.queue.indexOf(job),1);job.resolve({canceled:true});this.emit(job,{phase:'canceled'});}if(this.running||this.paused||!this.queue.length)return;const job=this.running=this.queue.shift();this.generate(job).then(result=>{this.running=null;this.emit(job,{phase:result.canceled?'canceled':'ready',percent:100,...result});job.resolve(result);this.pump();},e=>{this.running=null;this.emit(job,{phase:'error',error:e.message});job.resolve({error:e.message});this.pump();});}
  async generate(job){
    const {asset,size}=job,key=await this.key(asset,size),file=this.file(key),temporary=file+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp.mp4';
    const cached=await this.lookup(asset,size);if(job.canceled)return {canceled:true};if(cached)return cached;
    await this.prune();const factor=Math.min(1,size/asset.meta.height,size*16/9/asset.meta.width),width=Math.max(2,Math.round(asset.meta.width*factor/2)*2),height=Math.max(2,Math.round(asset.meta.height*factor/2)*2);
    // Keep FFmpeg's common input timestamp origin, including delayed audio.
    const color=Color.previewToSDR(asset.meta),args=['-hide_banner','-y','-i',asset.path,'-map','0:v:0','-map','0:a:0?','-vf',`${color?color+',':''}scale=${width}:${height},setsar=1`,'-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-threads','2','-fps_mode','passthrough','-c:a','aac','-b:a','128k','-ac','2','-ar','48000','-map_metadata','-1','-movflags','+faststart','-progress','pipe:1','-nostats',temporary];
    try{
      if(job.canceled)return {canceled:true};this.emit(job,{phase:'generating',percent:0});if(job.canceled)return {canceled:true};
      await new Promise((resolve,reject)=>{let errors='',pending='';const child=job.child=spawn(this.ffmpeg,args,{windowsHide:true});
        let checking=false;const guard=setInterval(async()=>{if(checking||!job.child)return;checking=true;try{await this.prune((await fs.promises.stat(temporary)).size);}catch(e){if(e.code!=='ENOENT'){job.tooLarge=true;child.kill('SIGKILL');}}finally{checking=false;}},1000);
        child.stderr.on('data',d=>errors=(errors+d).slice(-1000));child.stdout.on('data',d=>{pending+=d;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)if(line.startsWith('out_time_us='))this.emit(job,{phase:'generating',percent:Math.min(99,Number(line.slice(12))/1e6/asset.meta.duration*100)});});
        child.once('error',e=>{clearInterval(guard);reject(e);});child.once('close',code=>{clearInterval(guard);job.child=null;if(job.canceled)resolve();else if(job.tooLarge)reject(new Error('النسخة تتجاوز حد ذاكرة المعاينة (2 GB).'));else code===0?resolve():reject(new Error('تعذّر تجهيز المعاينة: '+errors));});
      });
      if(job.canceled||job.epoch!==this.epoch)return {canceled:true};if(await this.key(asset,size)!==key)throw new Error('تغيّر الملف الأصلي أثناء التجهيز. أعد المحاولة.');
      await this.prune((await fs.promises.stat(temporary)).size);if(job.canceled)return {canceled:true};await fs.promises.rename(temporary,file);return await this.lookup(asset,size);
    }finally{await fs.promises.rm(temporary,{force:true});}
  }
}
module.exports={ProxyService};

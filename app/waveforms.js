const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
class WaveformService{
  constructor(ffmpeg,directory){this.ffmpeg=ffmpeg;this.directory=directory;this.pending=[];this.requests=new Map();this.active=null;this.paused=false;this.generation=0;}
  async get(asset){
    if(!asset||!(asset.meta.audio||asset.kind==='audio'))return {peaks:[],duration:asset?.meta.duration||0};
    const generation=this.generation,stat=await fs.promises.stat(asset.path),key=crypto.createHash('sha256').update(JSON.stringify([2,asset.path,stat.size,stat.mtimeMs])).digest('hex'),file=this.directory&&path.join(this.directory,key+'.json');
    if(this.requests.has(key))return this.requests.get(key);
    if(file){try{const s=await fs.promises.stat(file);if(s.size<150000){const cached=JSON.parse(await fs.promises.readFile(file,'utf8'));if(cached.duration===asset.meta.duration&&Array.isArray(cached.peaks)&&cached.peaks.length<=4096&&cached.peaks.every(n=>Number.isFinite(n)&&n>=0&&n<=1))return cached;}}catch{}}
    if(generation!==this.generation)throw new Error('تم إلغاء تجهيز الموجة.');
    if(this.requests.has(key))return this.requests.get(key);
    const promise=new Promise((resolve,reject)=>{this.pending.push({key,file,asset,resolve,reject,generation:this.generation});});this.requests.set(key,promise);this.pump();
    try{return await promise;}finally{if(this.requests.get(key)===promise)this.requests.delete(key);}
  }
  setPaused(value){this.paused=value;if(!value)this.pump();}
  cancel(){this.generation++;for(const job of this.pending)job.reject(new Error('تم إلغاء تجهيز الموجة.'));this.pending=[];this.active?.child.kill();this.requests.clear();}
  pump(){if(this.paused||this.active||!this.pending.length)return;const job=this.pending.shift(),duration=job.asset.meta.duration,bin=Math.max(1,Math.ceil(duration*8000/4096)),peaks=[];let remainder=Buffer.alloc(0),samples=0,peak=0,error='',settled=false;
    const child=spawn(this.ffmpeg,['-v','error','-i',job.asset.path,'-vn','-map','0:a:0','-ac','2','-ar','8000','-f','f32le','pipe:1'],{windowsHide:true});this.active={job,child};
    const timer=setTimeout(()=>child.kill(),Math.min(300000,Math.max(30000,duration*1000)));
    child.stdout.on('data',data=>{const buffer=remainder.length?Buffer.concat([remainder,data]):data,complete=buffer.length-buffer.length%8;for(let i=0;i<complete;i+=8){peak=Math.max(peak,Math.abs(buffer.readFloatLE(i)),Math.abs(buffer.readFloatLE(i+4)));if(++samples===bin){if(peaks.length<4096)peaks.push(Math.min(1,peak));samples=0;peak=0;}}remainder=Buffer.from(buffer.subarray(complete));});
    child.stderr.on('data',data=>{error=(error+data).slice(-1000);});
    const finish=async(code,failure)=>{if(settled)return;settled=true;clearTimeout(timer);try{
      if(failure||code!==0||job.generation!==this.generation)throw new Error(failure?.message||error||'تعذّر تجهيز الموجة الصوتية.');if(samples&&peaks.length<4096)peaks.push(Math.min(1,peak));const result={duration,peaks};
      if(job.file){await fs.promises.mkdir(this.directory,{recursive:true});const temp=job.file+'.'+crypto.randomUUID()+'.tmp';try{await fs.promises.writeFile(temp,JSON.stringify(result));await fs.promises.rename(temp,job.file);}finally{await fs.promises.unlink(temp).catch(()=>{});}await this.prune();}
      job.resolve(result);
    }catch(e){job.reject(e);}finally{this.active=null;this.pump();}};
    child.on('error',e=>finish(null,e));child.on('close',code=>finish(code));
  }
  async prune(){try{const files=(await fs.promises.readdir(this.directory)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));if(files.length<=128)return;const entries=await Promise.all(files.map(async n=>({file:path.join(this.directory,n),time:(await fs.promises.stat(path.join(this.directory,n))).mtimeMs})));entries.sort((a,b)=>a.time-b.time);for(const e of entries.slice(0,files.length-128))await fs.promises.unlink(e.file);}catch{}}
}
module.exports={WaveformService};

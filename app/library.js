const {randomUUID}=require('node:crypto'),path=require('node:path'),fs=require('node:fs'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {inspect}=require('./export'),{FrameService}=require('./frames'),{format}=require('./project');
const {WaveformService}=require('./waveforms');
const exec=promisify(execFile),images=['.png','.jpg','.jpeg','.webp','.bmp'];
class MediaLibrary{
  constructor(ffmpeg,ffprobe,{waveformDirectory,createFrames=()=>new FrameService(ffmpeg)}={}){this.waveforms=new WaveformService(ffmpeg,waveformDirectory);this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.assets={};this.frames=new Map();this.pending=[];this.running=0;this.backgroundRunning=0;this.requests=new Map();this.createFrames=createFrames;}
  async inspect(file,id=randomUUID()){
    file=path.resolve(file);if(!(await fs.promises.stat(file)).isFile())throw new Error('مو ملف وسائط.');
    let kind=images.includes(path.extname(file).toLowerCase())?'image':'video';
    const {stdout}=await exec(this.ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
    const data=JSON.parse(stdout),v=data.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic),audio=data.streams.find(s=>s.codec_type==='audio');
    if(!v&&audio){const duration=Number(data.format?.duration||audio.duration);if(!Number.isFinite(duration)||duration<=0||duration>86400)throw new Error('مدة الصوت غير صالحة.');return {id,path:file,kind:'audio',name:path.basename(file),meta:{duration,audio:true,codec:audio.codec_name,sampleRate:Number(audio.sample_rate)}};}
    if(!v)throw new Error('الملف ما يحتوي صورة أو فيديو أو صوت.');
    const rotation=Number(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation||v.tags?.rotate||0),rotated=Math.abs(rotation)%180===90;
    const meta=kind==='image'?{width:rotated?v.height:v.width,height:rotated?v.width:v.height,duration:5,fps:'30',codec:v.codec_name,audio:false,hdr:false}:inspect(data);
    format(meta);return {id,path:file,kind,meta,name:path.basename(file)};
  }
  async import(paths,onProgress=()=>{}){const result=[],errors=[],files=paths.slice(0,128);for(const [index,file] of files.entries()){onProgress({index:index+1,count:files.length,name:path.basename(file)});try{if(Object.keys(this.assets).length>=128)throw new Error('الحد الحالي 128 ملف.');const existing=Object.values(this.assets).find(a=>a.path.toLowerCase()===path.resolve(file).toLowerCase());const a=existing||await this.inspect(file);this.assets[a.id]=a;result.push(this.describe(a));}catch(e){errors.push(path.basename(file)+': '+e.message);}}return {assets:result,errors};}
  describe(a){return {...a.meta,id:a.id,kind:a.kind,name:a.name||path.basename(a.path),url:'sahl-media://asset/'+a.id};}
  descriptors(){return Object.values(this.assets).map(a=>this.describe(a));}
  frame(id,t,width){
    const a=this.assets[id];if(!a||a.kind==='audio')return Promise.resolve(null);
    const key=id+':'+width+':'+Number(t||0).toFixed(3);if(this.requests.has(key))return this.requests.get(key);
    let f=this.frames.get(id);if(!f){f=this.createFrames();f.setSource(a.path,a.meta.duration,a.meta);this.frames.set(id,f);}
    const promise=new Promise(resolve=>{const job={f,time:a.kind==='image'?0:t,width,resolve};width>176?this.pending.unshift(job):this.pending.push(job);});
    this.requests.set(key,promise);promise.finally(()=>{if(this.requests.get(key)===promise)this.requests.delete(key);});this.pump();return promise;
  }
  pump(){
    // Leave the second decoder slot for a requested preview, not a thumbnail.
    while(this.running<2){
      const index=this.pending.findIndex(job=>job.width>176||this.backgroundRunning===0);if(index<0)return;
      const job=this.pending.splice(index,1)[0],background=job.width<=176;this.running++;if(background)this.backgroundRunning++;
      job.f.get(job.time,job.width).then(job.resolve,()=>job.resolve(null)).finally(()=>{this.running--;if(background)this.backgroundRunning--;this.pump();});
    }
  }
  replace(assets){this.waveforms.cancel();for(const job of this.pending)job.resolve(null);this.pending=[];this.requests.clear();for(const f of this.frames.values())f.setSource('',0);this.frames.clear();this.assets=assets;}
}
module.exports={MediaLibrary,images};

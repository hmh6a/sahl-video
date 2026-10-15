const {randomUUID}=require('node:crypto'),path=require('node:path'),fs=require('node:fs'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {inspect}=require('./export'),{FrameService}=require('./frames'),{format}=require('./project');
const exec=promisify(execFile),images=['.png','.jpg','.jpeg','.webp','.bmp'];
class MediaLibrary{
  constructor(ffmpeg,ffprobe){this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.assets={};this.frames=new Map();this.pending=[];this.running=0;}
  async inspect(file,id=randomUUID()){
    file=path.resolve(file);if(!fs.statSync(file).isFile())throw new Error('مو ملف وسائط.');
    const kind=images.includes(path.extname(file).toLowerCase())?'image':'video';
    const {stdout}=await exec(this.ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
    const data=JSON.parse(stdout),v=data.streams.find(s=>s.codec_type==='video');
    if(!v)throw new Error('الملف ما يحتوي صورة أو فيديو.');
    const rotation=Number(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation||v.tags?.rotate||0),rotated=Math.abs(rotation)%180===90;
    const meta=kind==='image'?{width:rotated?v.height:v.width,height:rotated?v.width:v.height,duration:5,fps:'30',codec:v.codec_name,audio:false,hdr:false}:inspect(data);
    format(meta);return {id,path:file,kind,meta,name:path.basename(file)};
  }
  async import(paths){const result=[],errors=[];for(const file of paths.slice(0,128)){try{if(Object.keys(this.assets).length>=128)throw new Error('الحد الحالي 128 ملف.');const existing=Object.values(this.assets).find(a=>a.path.toLowerCase()===path.resolve(file).toLowerCase());const a=existing||await this.inspect(file);this.assets[a.id]=a;result.push(this.describe(a));}catch(e){errors.push(path.basename(file)+': '+e.message);}}return {assets:result,errors};}
  describe(a){return {...a.meta,id:a.id,kind:a.kind,name:a.name||path.basename(a.path),url:'sahl-media://asset/'+a.id};}
  descriptors(){return Object.values(this.assets).map(a=>this.describe(a));}
  frame(id,t,width){const a=this.assets[id];if(!a)return Promise.resolve(null);let f=this.frames.get(id);if(!f){f=new FrameService(this.ffmpeg);f.setSource(a.path,a.meta.duration);this.frames.set(id,f);}return new Promise(resolve=>{const job={f,time:a.kind==='image'?0:t,width,resolve};width>176?this.pending.unshift(job):this.pending.push(job);this.pump();});}
  pump(){while(this.running<2&&this.pending.length){const job=this.pending.shift();this.running++;job.f.get(job.time,job.width).then(job.resolve,()=>job.resolve(null)).finally(()=>{this.running--;this.pump();});}}
  replace(assets){for(const job of this.pending)job.resolve(null);this.pending=[];for(const f of this.frames.values())f.setSource('',0);this.frames.clear();this.assets=assets;}
}
module.exports={MediaLibrary,images};

const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
// Sparse seeks: a 20-minute recording never needs decoding from the start.
class FrameService {
  constructor(ffmpeg){this.ffmpeg=ffmpeg;this.generation=0;this.jobs=[];this.running=0;this.cache=new Map();}
  setSource(path,duration){this.path=path;this.duration=duration;this.generation++;this.cache.clear();for(const job of this.jobs)job.resolve(null);this.jobs=[];}
  get(time,width=176){
    if(!this.path)return Promise.resolve(null);
    const t=Math.max(0,Math.min(this.duration-.02,Number(time)||0));
    const key=width+':'+t.toFixed(3);
    if(this.cache.has(key))return this.cache.get(key);
    const generation=this.generation,path=this.path;
    const promise=new Promise(resolve=>{const job={path,t,width,generation,resolve};width>176?this.jobs.unshift(job):this.jobs.push(job);this.pump();});
    this.cache.set(key,promise);if(this.cache.size>180)this.cache.delete(this.cache.keys().next().value);
    return promise;
  }
  pump(){while(this.running<2&&this.jobs.length){
    const job=this.jobs.shift();this.running++;
    exec(this.ffmpeg,['-hide_banner','-loglevel','error','-threads','2','-ss',job.t.toFixed(3),'-i',job.path,'-frames:v','1','-vf',`scale=${job.width}:-2`,'-q:v','4','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true,encoding:'buffer',timeout:20000,maxBuffer:4*1024*1024})
      .then(({stdout})=>job.resolve(job.generation===this.generation?'data:image/jpeg;base64,'+stdout.toString('base64'):null),()=>job.resolve(null))
      .finally(()=>{this.running--;this.pump();});
  }}
}
module.exports={FrameService};

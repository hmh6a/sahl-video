const {performance}=require('node:perf_hooks');
class ExportProgress{
  constructor(duration,{now=()=>performance.now()}={}){this.now=now;this.duration=duration;this.started=now();this.processed=0;this.lastAdvance=this.started;this.samples=[{time:this.started,processed:0}];}
  update(seconds){const time=this.now();if(Number.isFinite(seconds)&&seconds>this.processed){this.processed=Math.min(this.duration,seconds);this.lastAdvance=time;this.samples.push({time,processed:this.processed});while(this.samples.length>2&&this.samples[1].time<time-30000)this.samples.shift();}return this.snapshot();}
  snapshot(){const time=this.now(),elapsedSeconds=Math.max(0,(time-this.started)/1000),base=this.samples[0],windowSeconds=(time-base.time)/1000;
    const rate=windowSeconds>0?(this.processed-base.processed)/windowSeconds:0,finalizing=this.processed>=this.duration;
    const remainingSeconds=!finalizing&&elapsedSeconds>=3&&this.processed>.05&&time-this.lastAdvance<15000&&rate>0?Math.ceil(Math.max(0,this.duration-this.processed)/rate):null;
    return {percent:Math.min(99,Math.max(0,this.processed/this.duration*100)),elapsedSeconds,remainingSeconds,phase:finalizing?'finalizing':'rendering'};
  }
  finish(success){return {...this.snapshot(),...(success?{percent:100,remainingSeconds:0}:{}),phase:success?'complete':'stopped'};}
}
module.exports={ExportProgress};

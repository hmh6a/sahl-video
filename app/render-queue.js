const fs=require('node:fs'),path=require('node:path');
class RenderQueue{
  constructor(file){this.file=file;this.jobs=[];this.limit=1;try{const {limit}=JSON.parse(fs.readFileSync(file,'utf8'));if(this.valid(limit))this.limit=limit;}catch{}}
  valid(limit){return Number.isInteger(limit)&&limit>=1&&limit<=4;}
  settings(){return {limit:this.limit,running:this.jobs.filter(j=>j.state==='running').length,waiting:this.jobs.filter(j=>j.state==='queued').length};}
  setLimit(limit){
    if(!this.valid(limit))throw Error('اختار عدد من 1 إلى 4.');
    fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';
    fs.writeFileSync(temp,JSON.stringify({limit}));fs.renameSync(temp,this.file);this.limit=limit;this.pump();return this.settings();
  }
  acquire(output,notify=()=>{}){
    const key=path.resolve(output).toLowerCase();
    if(this.jobs.some(j=>j.key===key))throw Error('هذا الملف محجوز لتصدير آخر. اختار اسم مختلف.');
    let resolve;const job={key,state:'queued',notify,ready:new Promise(r=>{resolve=r;}),resolve:allowed=>resolve(allowed)};
    job.release=()=>{if(job.state==='finished')return;job.state='finished';this.jobs=this.jobs.filter(j=>j!==job);this.pump();};
    job.cancel=()=>{if(job.state!=='queued')return false;job.resolve(false);job.release();return true;};
    this.jobs.push(job);this.pump();return job;
  }
  pump(){
    let running=this.jobs.filter(j=>j.state==='running').length,position=0;
    for(const job of this.jobs){
      if(job.state!=='queued')continue;
      if(running<this.limit){job.state='running';running++;job.resolve(true);}
      else job.notify({phase:'queued',position:++position,percent:0,elapsedSeconds:0,remainingSeconds:null});
    }
  }
}
module.exports={RenderQueue};

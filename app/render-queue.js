const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
class RenderQueue{
  constructor(file,{onChange=()=>{}}={}){this.file=file;this.onChange=onChange;this.jobs=[];this.limit=1;this.revision=0;try{const {limit}=JSON.parse(fs.readFileSync(file,'utf8'));if(this.valid(limit))this.limit=limit;}catch{}}
  valid(limit){return Number.isInteger(limit)&&limit>=1&&limit<=4;}
  settings(){return {limit:this.limit,running:this.jobs.filter(j=>j.state==='running').length,waiting:this.jobs.filter(j=>j.state==='queued').length};}
  setLimit(limit){
    if(!this.valid(limit))throw Error('اختار عدد من 1 إلى 4.');
    fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';
    fs.writeFileSync(temp,JSON.stringify({limit}));fs.renameSync(temp,this.file);this.limit=limit;this.pump();return this.settings();
  }
  snapshot(){
    const ordered=[...this.jobs.filter(j=>j.state==='running'),...this.jobs.filter(j=>j.state==='queued')];let position=0;
    return {...this.settings(),revision:this.revision,jobs:ordered.map(j=>({id:j.id,name:j.name,output:j.output,encoder:j.encoder,state:j.state,canceling:!!j.canceling,position:j.state==='queued'?++position:null,...j.progress}))};
  }
  emit(){this.revision++;this.onChange(this.snapshot());}
  move(id,direction){
    if(!['up','down'].includes(direction))throw Error('اتجاه الترتيب غير صالح.');
    const waiting=this.jobs.filter(j=>j.state==='queued'),index=waiting.findIndex(j=>j.id===id),other=index+(direction==='up'?-1:1);
    if(index<0)throw Error('هذا التصدير بدأ أو انتهى؛ الترتيب للمنتظرة فقط.');
    if(waiting[index].canceling)throw Error('التصدير قيد الإلغاء.');
    if(other>=0&&other<waiting.length){const a=this.jobs.indexOf(waiting[index]),b=this.jobs.indexOf(waiting[other]);[this.jobs[a],this.jobs[b]]=[this.jobs[b],this.jobs[a]];this.pump();}
    return this.snapshot();
  }
  async cancelExport(id){const job=this.jobs.find(j=>j.id===id);return job?.cancelExport?job.cancelExport():{notRunning:true};}
  acquire(output,notify=()=>{},{name,encoder}={}){
    const key=path.resolve(output).toLowerCase();
    if(this.jobs.some(j=>j.key===key))throw Error('هذا الملف محجوز لتصدير آخر. اختار اسم مختلف.');
    let resolve;const job={id:randomUUID(),name:name||path.basename(output),output,encoder:encoder||'CPU',key,state:'queued',progress:{percent:0,elapsedSeconds:0,remainingSeconds:null,phase:'queued'},notify,ready:new Promise(r=>{resolve=r;}),resolve:allowed=>resolve(allowed)};
    job.update=p=>{if(job.state==='finished')return;job.progress={percent:p.percent,elapsedSeconds:p.elapsedSeconds,remainingSeconds:p.remainingSeconds,phase:p.phase};this.emit();};
    job.setCanceling=value=>{job.canceling=value;this.emit();};
    job.release=()=>{if(job.state==='finished')return;job.state='finished';this.jobs=this.jobs.filter(j=>j!==job);this.pump();};
    job.cancel=()=>{if(job.state!=='queued')return false;job.resolve(false);job.release();return true;};
    this.jobs.push(job);this.pump();return job;
  }
  pump(){
    let running=this.jobs.filter(j=>j.state==='running').length,position=0;
    for(const job of this.jobs){
      if(job.state!=='queued')continue;
      if(running<this.limit){job.state='running';job.progress.phase='starting';running++;job.resolve(true);}
      else job.notify({phase:'queued',position:++position,percent:0,elapsedSeconds:0,remainingSeconds:null});
    }this.emit();
  }
}
module.exports={RenderQueue};

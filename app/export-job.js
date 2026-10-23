const fs=require('node:fs'),{spawn}=require('node:child_process'),{ExportProgress}=require('./export-progress');
function startExport({queue,ffmpeg,args,work,tempOutput,output,duration,name,encoder,notify,onComplete,spawnFn=spawn,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
  const ticket=queue.acquire(output,notify,{name,encoder});
  const progress=p=>{ticket.update(p);notify(p);};
  let child,stats,timer,settled=false,canceled=false,resolveDone,errorLog='',buffer='';
  const job={done:new Promise(resolve=>{resolveDone=resolve;}),async cancel(){
    if(settled)return {notRunning:true};
    if(!canceled){
      canceled=true;ticket.setCanceling(true);
      if(child)try{const killed=child.kill('SIGKILL');if(!killed&&child.exitCode===null&&child.signalCode===null){canceled=false;ticket.setCanceling(false);return {error:'تعذّر إيقاف الرندرة. حاول مرة ثانية.'};}}catch(e){canceled=false;ticket.setCanceling(false);return {error:'تعذّر إيقاف الرندرة: '+e.message};}
      else ticket.cancel();
    }
    await job.done;return {canceled:true};
  }};
  ticket.cancelExport=()=>job.cancel();
  function finish(code,error){
    if(settled)return;settled=true;if(timer)clearIntervalFn(timer);
    let result;
    try{
      if(code===0&&!canceled){fs.renameSync(tempOutput,output);result={path:output,timing:stats.finish(true)};}
      else{fs.rmSync(tempOutput,{force:true});result={...(canceled?{canceled:true}:{error:'تعذّر التصدير. '+(error?.message||errorLog.slice(-1200))}),timing:stats?.finish(false)||{phase:'stopped',elapsedSeconds:0}};}
    }catch(e){result={error:'تعذّر حفظ الملف: '+e.message+' — النسخة المؤقتة: '+tempOutput,timing:stats?.finish(false)};}
    finally{
      try{fs.rmSync(work,{recursive:true,force:true});}catch{/* A locked temporary file must not block other projects. */}
      try{onComplete(result);}finally{ticket.release();resolveDone(result);}
    }
  }
  ticket.ready.then(allowed=>{
    if(!allowed||canceled){canceled=true;finish(-1);return;}
    try{
      stats=new ExportProgress(duration);child=spawnFn(ffmpeg,args,{windowsHide:true});
      progress(stats.snapshot());timer=setIntervalFn(()=>progress(stats.snapshot()),1000);
      child.stderr.on('data',d=>{errorLog=(errorLog+d).slice(-6000);});
      child.stdout.on('data',d=>{buffer+=d.toString();const lines=buffer.split(/\r?\n/);buffer=lines.pop();for(const line of lines)if(line.startsWith('out_time_us='))progress(stats.update(Number(line.split('=')[1])/1e6));});
      child.on('error',e=>finish(-1,e));child.on('close',code=>finish(code));
    }catch(e){finish(-1,e);}
  });
  return job;
}
module.exports={startExport};

let latestRenderQueue=null;
const queueRows=new Map(),queuePending=new Set();
function receiveRenderQueue(value){
 if(!value||!Array.isArray(value.jobs)||latestRenderQueue&&value.revision<latestRenderQueue.revision)return;
 latestRenderQueue=value;$('open-render-queue').textContent='التصديرات ('+value.jobs.length+')';
 if($('render-queue-dialog').open)drawRenderQueue();
}
function queueRow(job){
 const row=document.createElement('article');row.className='queue-job';row.dataset.jobId=job.id;
 row.innerHTML='<div class="queue-job-heading"><h3></h3><span class="queue-state"></span></div><p class="queue-file" dir="auto"></p><progress max="100"></progress><div class="queue-stats"><span class="queue-percent" dir="ltr"></span><span class="queue-time"></span></div><div class="queue-actions"><button data-action="up">↑ تقديم</button><button data-action="down">↓ تأخير</button><button data-action="cancel" class="queue-cancel">إلغاء التصدير</button></div>';
 for(const button of row.querySelectorAll('button'))button.onclick=()=>queueAction(job.id,button.dataset.action);
 return row;
}
function drawRenderQueue(){
 const data=latestRenderQueue;if(!data)return;
 const focused=document.activeElement,ids=new Set(data.jobs.map(j=>j.id));
 for(const [id,row]of queueRows)if(!ids.has(id)){row.remove();queueRows.delete(id);}
 const summary=data.running+' جاري · '+data.waiting+' منتظر · الحد المتزامن '+data.limit;
 if($('queue-summary').textContent!==summary)$('queue-summary').textContent=summary;
 $('queue-empty').hidden=data.jobs.length>0;
 data.jobs.forEach((job,index)=>{
  let row=queueRows.get(job.id);if(!row){row=queueRow(job);queueRows.set(job.id,row);}
  if($('queue-jobs').children[index]!==row)$('queue-jobs').insertBefore(row,$('queue-jobs').children[index]||null);
  row.querySelector('h3').textContent=job.name;
  const file=row.querySelector('.queue-file');file.textContent=job.output.split(/[\\/]/).pop()+' · '+job.encoder;file.title=job.output;
  const waiting=job.state==='queued',pending=queuePending.has(job.id)||job.canceling;
  row.querySelector('.queue-state').textContent=job.canceling?'جارٍ الإلغاء…':waiting?'منتظر · '+job.position:job.phase==='finalizing'?'حفظ الملف…':'جاري';
  row.classList.toggle('is-waiting',waiting);
  const progress=row.querySelector('progress');progress.value=waiting?0:job.percent||0;progress.setAttribute('aria-label','تقدّم '+job.name);
  row.querySelector('.queue-percent').textContent=waiting?'—':Math.floor(job.percent||0)+'%';
  row.querySelector('.queue-time').textContent=waiting?'يبدأ تلقائياً عند وصول دوره':'مرّ '+seconds(job.elapsedSeconds)+(Number.isFinite(job.remainingSeconds)?' · المتبقي تقريباً '+seconds(job.remainingSeconds):'');
  for(const button of row.querySelectorAll('button')){
   const action=button.dataset.action;button.setAttribute('aria-label',(action==='up'?'تقديم':action==='down'?'تأخير':'إلغاء تصدير')+' '+job.name);
   button.hidden=action!=='cancel'&&!waiting;button.disabled=pending||(action==='up'&&job.position<=1)||(action==='down'&&job.position>=data.waiting);
  }
 });
 if(focused?.isConnected&&!focused.disabled&&document.activeElement!==focused)focused.focus({preventScroll:true});
}
async function queueAction(id,action){
 if(queuePending.has(id))return;queuePending.add(id);$('queue-message').textContent='';drawRenderQueue();
 try{
  const result=action==='cancel'?await window.sahl.cancelQueuedExport(id):await window.sahl.moveQueuedExport(id,action);
  if(result.error)$('queue-message').textContent=result.error;
  else if(action==='cancel')$('queue-message').textContent=result.notRunning?'التصدير انتهى أو انلغى مسبقاً.':'تم إلغاء التصدير المحدد.';
  else{receiveRenderQueue(result);$('queue-message').textContent='تغيّر ترتيب الطابور.';}
  receiveRenderQueue(await window.sahl.renderQueue());
 }catch(e){$('queue-message').textContent='تعذّر تنفيذ الطلب: '+e.message;}
 finally{queuePending.delete(id);drawRenderQueue();}
}
async function openRenderQueue(){
 $('queue-message').textContent='';if(!$('render-queue-dialog').open)$('render-queue-dialog').showModal();drawRenderQueue();
 try{receiveRenderQueue(await window.sahl.renderQueue());}catch(e){$('queue-message').textContent=e.message;}
}
$('open-render-queue').onclick=$('render-open-queue').onclick=openRenderQueue;
$('close-render-queue').onclick=()=>$('render-queue-dialog').close();
window.sahl.onRenderQueue?.(receiveRenderQueue);
if(window.sahl.renderQueue)window.sahl.renderQueue().then(receiveRenderQueue).catch(()=>{});

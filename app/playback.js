(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlPlayback=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  async function seekReady(video,target,signal){
    if(signal?.aborted)throw new Error('canceled');
    if(video.readyState<1)await wait(video,'loadedmetadata',signal);
    if(signal?.aborted)throw new Error('canceled');
    if(!video.seeking&&Math.abs(video.currentTime-target)<.003)return;
    // Attach first: short cached seeks can complete immediately.
    const ready=wait(video,'seeked',signal);video.currentTime=target;await ready;
    if(Math.abs(video.currentTime-target)>.15)throw new Error('تعذّر الوصول للمكان المحدد بالفيديو.');
  }
  function wait(video,event,signal){return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',cancel);};
    const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('تعذّر قراءة الفيديو.'));},cancel=()=>{cleanup();reject(new Error('canceled'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error('الانتقال أخذ وقت طويل. جرّب مكان آخر.'));},20000);
    video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',cancel,{once:true});
  });}
  return {seekReady};
});

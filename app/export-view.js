// Keep the real form mounted: cancellation restores the exact selections.
let exportViewAnimations=[];
function setExportPresentation(active,details){
  const dialog=$('export-dialog'),settings=$('export-settings'),activity=$('export-activity');
  const changed=dialog.classList.contains('is-exporting')!==active;
  for(const animation of exportViewAnimations)animation.cancel();exportViewAnimations=[];
  if(active){
    resetExportTiming();
    for(const key of ['resolution','fps','duration','encoder','quality','format'])$('render-'+key).textContent=details[key];
    $('export-status').textContent='';$('export-status').classList.toggle('error',false);
    showExportTiming({elapsedSeconds:0,phase:'starting'});
  }else resetExportTiming();
  settings.hidden=active;activity.hidden=!active;$('export-details').hidden=!active;
  dialog.classList.toggle('is-exporting',active);
  $('export-heading').textContent=active?'جارٍ تصدير الفيديو':'إعدادات التصدير';
  $('export-eyebrow').textContent=active?'التصدير قيد التنفيذ':'هل الفيديو جاهز؟';
  if(!changed)return;
  dialog.scrollTop=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduced){
    // Bring timing up into view; reverse the transition when returning to settings.
    const targets=active?[activity,$('export-details')]:[settings];
    for(const [index,element] of targets.entries())exportViewAnimations.push(element.animate([
      {opacity:0,transform:`translateY(${active?64: -16}px)`},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:active?420:260,delay:index*70,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
  }
  if(dialog.open)(active?activity:$('export')).focus({preventScroll:true});
}

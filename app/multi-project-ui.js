async function newProjectTab(){
 try{const result=await window.sahl.newProjectTab();if(result?.error)status(result.error,true);}
 catch(e){status('تعذّر فتح تاب المشروع: '+e.message,true);}
}
for(const id of ['new-project-tab','render-new-project'])$(id).onclick=newProjectTab;
window.sahl.onProjectActive?.(active=>{if(!active)pause();});
async function openRenderSettings(){
 $('render-settings-message').textContent='';
 try{
  const settings=await window.sahl.renderSettings();$('render-limit').value=String(settings.limit);
  const recoverySettings=await window.sahl.recoverySettings();$('recovery-location-path').textContent=recoverySettings.directory;
  if(!$('render-settings-dialog').open)$('render-settings-dialog').showModal();
  const encoders=await window.sahl.encoders();$('render-hardware').textContent='الترميز المتاح: '+[...encoders.map(c=>c.name),'CPU'].join(' · ');
 }catch(e){status('تعذّر قراءة الإعدادات: '+e.message,true);}
}
for(const id of ['open-render-settings','render-open-settings'])$(id).onclick=openRenderSettings;
$('close-render-settings').onclick=()=>{if(!recoveryLocationBusy)$('render-settings-dialog').close();};
$('save-render-settings').onclick=async()=>{
 const button=$('save-render-settings');button.disabled=true;
 try{
  const result=await window.sahl.setRenderLimit(Number($('render-limit').value));
  $('render-settings-message').textContent=result.error||'انحفظ الإعداد لكل المشاريع: '+result.limit+' تصدير بنفس الوقت.';
 }catch(e){$('render-settings-message').textContent=e.message;}
 finally{button.disabled=false;}
};
window.sahl.onRenderSettings?.(settings=>{$('render-limit').value=String(settings.limit);});
let recoveryLocationBusy=false,recoveryMoving=false;
function recoveryLocationState(value){
  if(value.directory)$('recovery-location-path').textContent=value.directory;
  const moving=value.phase==='moving';
  if(moving&&!recoveryMoving){
    recoveryMoving=true;pause();previewAbort?.abort();previewLoad.cancel();sourceId=null;
    video.removeAttribute('src');video.load();$('still').removeAttribute('src');
    resetTrackPreview();resetLayerPreview();resetMotionPreview();
  }
  if(!moving&&recoveryMoving){recoveryMoving=false;resetProxyPreview();sourceId=null;seekTo(cursor);}
  $('recovery-location-progress').hidden=!moving;$('recovery-location-progress').value=value.percent||0;
  if(moving)$('recovery-location-message').textContent='جاري نقل النسخ… '+(value.percent||0)+'%';
  else if(value.error)$('recovery-location-message').textContent=value.error;
  else if(value.phase==='ready')$('recovery-location-message').textContent='تم تغيير المكان ونقل النسخ الموجودة.'+(value.cleanupPending?' بعض النسخ القديمة قيد الاستخدام؛ تُنظّف عند تشغيل البرنامج مرة ثانية.':'');
}
window.sahl.onRecoveryLocation?.(recoveryLocationState);
$('choose-recovery-location').onclick=async()=>{
  if(recoveryLocationBusy)return;recoveryLocationBusy=true;
  for(const id of ['choose-recovery-location','close-render-settings','save-render-settings'])$(id).disabled=true;
  $('recovery-location-message').textContent='';
  try{const result=await window.sahl.chooseRecoveryLocation();if(!result.canceled)recoveryLocationState(result);}
  catch(e){recoveryLocationState({phase:'error',error:e.message});}
  finally{recoveryLocationBusy=false;for(const id of ['choose-recovery-location','close-render-settings','save-render-settings'])$(id).disabled=false;}
};
$('render-settings-dialog').addEventListener('cancel',event=>{if(recoveryLocationBusy)event.preventDefault();});

async function newProjectWindow(){
 try{const result=await window.sahl.newProjectWindow();if(result?.error)status(result.error,true);}
 catch(e){status('تعذّر فتح نافذة المشروع: '+e.message,true);}
}
for(const id of ['new-project-window','render-new-project'])$(id).onclick=newProjectWindow;
async function openRenderSettings(){
 $('render-settings-message').textContent='';
 try{
  const settings=await window.sahl.renderSettings();$('render-limit').value=String(settings.limit);
  if(!$('render-settings-dialog').open)$('render-settings-dialog').showModal();
  const encoders=await window.sahl.encoders();$('render-hardware').textContent='الترميز المتاح: '+[...encoders.map(c=>c.name),'CPU'].join(' · ');
 }catch(e){status('تعذّر قراءة الإعدادات: '+e.message,true);}
}
for(const id of ['open-render-settings','render-open-settings'])$(id).onclick=openRenderSettings;
$('close-render-settings').onclick=()=>$('render-settings-dialog').close();
$('save-render-settings').onclick=async()=>{
 const button=$('save-render-settings');button.disabled=true;
 try{
  const result=await window.sahl.setRenderLimit(Number($('render-limit').value));
  $('render-settings-message').textContent=result.error||'انحفظ الإعداد لكل المشاريع: '+result.limit+' تصدير بنفس الوقت.';
 }catch(e){$('render-settings-message').textContent=e.message;}
 finally{button.disabled=false;}
};
window.sahl.onRenderSettings?.(settings=>{$('render-limit').value=String(settings.limit);});

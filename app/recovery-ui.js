function autosavePending(){if(!$('autosave-status').classList.contains('error'))$('autosave-status').textContent='حفظ تلقائي كل دقيقة · تعديلات جديدة';}
function autosaveStatus(value){const label=$('autosave-status');label.classList.toggle('error',value.phase==='error');
  if(value.phase==='error'){label.textContent='تعذّر الحفظ التلقائي';label.title=value.message+' — سيحاول مجدداً خلال دقيقة. تقدر تحفظ يدوياً.';return;}
  label.title='نسخة استرجاع محلية كل دقيقة. استخدم حفظ مع الملفات لجمع الوسائط ونقل المشروع.';
  label.textContent=value.savedAt?(value.phase==='manual'?'المشروع محفوظ · ':'حُفظ تلقائياً · ')+new Date(value.savedAt).toLocaleTimeString('ar-IQ',{numberingSystem:'latn',hour:'2-digit',minute:'2-digit'}):'حفظ تلقائي كل دقيقة';
}
window.sahl.onAutosave?.(autosaveStatus);
async function refreshRecovery(show=false){
  try{const items=await window.sahl.listRecovery?.()||[];$('open-recovery').hidden=!items.length;$('recovery-list').replaceChildren();
    for(const item of items){const label=item.name+' — '+new Date(item.savedAt).toLocaleString('ar-IQ',{numberingSystem:'latn'})+' · '+item.clips+' قطع / '+item.texts+' نص';$('recovery-list').add(new Option(label,item.id));}
    if(show&&items.length&&!busy&&!fileBusy){$('recovery-error').textContent='';$('recovery-dialog').showModal();}
  }catch(e){autosaveStatus({phase:'error',message:e.message});}
}
$('open-recovery').onclick=()=>{if(!busy&&!fileBusy&&!importing)refreshRecovery(true);};
$('recovery-later').onclick=()=>$('recovery-dialog').close();
$('restore-recovery').onclick=async()=>{
  if(busy||fileBusy||importing)return;const id=$('recovery-list').value;if(!id)return;pause();commitTitle();fileButtons(true);$('restore-recovery').disabled=$('recovery-later').disabled=true;
  try{const result=await window.sahl.restoreRecovery(id,projectSnapshot());if(result.error){$('recovery-error').textContent=result.error;return;}if(result.canceled)return;
    applyProjectResult(result);$('recovery-dialog').close();status('رجعت آخر حفظ تلقائي مع القصات والنصوص وتوقيتها. تكدر تكمل وتستخدم «حفظ مع الملفات».');await refreshRecovery();
  }catch(e){$('recovery-error').textContent='تعذّر الاسترجاع: '+e.message;}finally{fileButtons(false);$('restore-recovery').disabled=$('recovery-later').disabled=false;}
};
$('recovery-dialog').addEventListener('cancel',e=>{if(fileBusy)e.preventDefault();});
refreshRecovery(true);

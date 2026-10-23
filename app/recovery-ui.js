function autosavePending(){if(!$('autosave-status').classList.contains('error'))$('autosave-status').textContent='حفظ تلقائي كل دقيقة · تعديلات جديدة';}
function autosaveStatus(value){const label=$('autosave-status');label.classList.toggle('error',value.phase==='error');
  if(value.phase==='error'){label.textContent='تعذّر الحفظ التلقائي';label.title=value.message+' — سيحاول مجدداً خلال دقيقة. تقدر تحفظ يدوياً.';return;}
  label.title='نسخة استرجاع محلية كل دقيقة. استخدم حفظ مع الملفات لجمع الوسائط ونقل المشروع.';
  label.textContent=value.savedAt?(value.phase==='manual'?'المشروع محفوظ · ':'حُفظ تلقائياً · ')+new Date(value.savedAt).toLocaleTimeString('ar-IQ-u-nu-latn',{hour:'2-digit',minute:'2-digit'}):'حفظ تلقائي كل دقيقة';
}
window.sahl.onAutosave?.(autosaveStatus);
function recoverySelection(){return $('recovery-list').querySelector('input:checked')?.value;}
function recoveryCard(item,selected,index){
  const card=document.createElement('label');card.className='recovery-card';
  const radio=document.createElement('input');radio.type='radio';radio.name='recovery-project';radio.value=item.id;radio.checked=selected;radio.setAttribute('aria-labelledby','recovery-name-'+index);
  const content=document.createElement('span');content.className='recovery-card-content';
  const heading=document.createElement('span');heading.className='recovery-card-heading';
  const name=document.createElement('bdi');name.id='recovery-name-'+index;name.className='recovery-name';name.textContent=item.name;heading.append(name);
  if(index===0){const badge=document.createElement('span');badge.className='recovery-latest';badge.textContent='الأحدث';heading.append(badge);}
  const saved=document.createElement('span');saved.className='recovery-saved';
  const date=new Date(item.savedAt),time=document.createElement('time');time.dateTime=date.toISOString();time.dir='ltr';time.textContent=date.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false});saved.append('آخر حفظ ',time);
  const counts=document.createElement('span');counts.className='recovery-counts';
  for(const [icon,count,label]of [['split',item.clips,'المقاطع'],['text',item.texts,'النصوص']]){const detail=document.createElement('span'),number=document.createElement('bdi');number.textContent=String(count);detail.append(UIIcons.node(icon),label+' ',number);counts.append(detail);}
  content.append(heading,saved,counts);
  if(item.missingCount){const missing=document.createElement('span');missing.className='recovery-missing-note';missing.textContent=item.missingCount+' ملف وسائط يحتاج تحديد موقعه';content.append(missing);}
  card.append(radio,content);return card;
}
function recoveryBusy(value){
  for(const id of ['restore-recovery','locate-recovery-media','recovery-later','close-recovery'])$(id).disabled=value;
  for(const radio of $('recovery-list').querySelectorAll('input'))radio.disabled=value;
  $('restore-recovery').textContent=value?'جاري الاسترجاع…':'استرجع المشروع';
  $('recovery-dialog').setAttribute('aria-busy',String(value));
}
async function refreshRecovery(show=false){
  try{const items=await window.sahl.listRecovery?.()||[],previous=recoverySelection(),selected=items.some(item=>item.id===previous)?previous:items[0]?.id;
    $('open-recovery').hidden=!items.length;$('recovery-list').replaceChildren(...items.map((item,index)=>recoveryCard(item,item.id===selected,index)));$('recovery-empty').hidden=!!items.length;$('restore-recovery').disabled=!items.length;
    if(show&&items.length&&!busy&&!fileBusy){clearMissingRecovery();if(!$('recovery-dialog').open)$('recovery-dialog').showModal();}
  }catch(e){autosaveStatus({phase:'error',message:e.message});}
}
$('open-recovery').onclick=()=>{if(!busy&&!fileBusy&&!importing)refreshRecovery(true);};
$('recovery-later').onclick=$('close-recovery').onclick=()=>{if(!fileBusy)$('recovery-dialog').close();};
function clearMissingRecovery(){$('recovery-error').textContent='';$('recovery-missing-files').replaceChildren();$('locate-recovery-media').hidden=true;}
$('recovery-list').addEventListener('change',clearMissingRecovery);
async function restoreSelectedRecovery(locateMissing=false){
  if(busy||fileBusy||importing)return;const id=recoverySelection();if(!id)return;pause();commitTitle();fileButtons(true);$('recovery-error').textContent='';recoveryBusy(true);
  try{const result=await window.sahl.restoreRecovery(id,projectSnapshot(),locateMissing);if(result.error){$('recovery-error').textContent=result.error;$('recovery-missing-files').replaceChildren(...(result.missingFiles||[]).map(file=>{const row=document.createElement('li');row.dir='auto';row.textContent=file.name;return row;}));$('locate-recovery-media').hidden=!result.missingFiles?.length;return;}if(result.canceled)return;
    applyProjectResult(result);$('recovery-dialog').close();status('رجعت آخر حفظ تلقائي مع القصات والنصوص وتوقيتها. تكدر تكمل وتستخدم «حفظ مع الملفات».');await refreshRecovery();
  }catch(e){$('recovery-error').textContent='تعذّر الاسترجاع: '+e.message;}finally{fileButtons(false);recoveryBusy(false);$('restore-recovery').disabled=!recoverySelection();}
}
$('restore-recovery').onclick=()=>restoreSelectedRecovery();
$('locate-recovery-media').onclick=()=>restoreSelectedRecovery(true);
$('recovery-dialog').addEventListener('cancel',e=>{if(fileBusy)e.preventDefault();});
$('recovery-symbol').append(UIIcons.node('undo'));UIIcons.button('close-recovery','close');
refreshRecovery(true);

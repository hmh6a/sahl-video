/* Presentation preferences never change project data or its undo history. */
function setInspectorTab(name,focus=false){
 const tabs=[...document.querySelectorAll('[data-inspector-tab]')];
 if(!tabs.some(tab=>tab.dataset.inspectorTab===name))name='text';
 for(const tab of tabs){
  const selected=tab.dataset.inspectorTab===name;
  tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  $(tab.getAttribute('aria-controls')).hidden=!selected;
  if(selected&&focus)tab.focus();
 }
 $('text-fields').hidden=name==='templates'||!currentTitle();
 if($('no-title'))$('no-title').hidden=!!currentTitle()||name==='templates';
 try{localStorage.setItem('sahl-inspector-tab',name);}catch{}
}
for(const tab of document.querySelectorAll('[data-inspector-tab]')){
 tab.onclick=()=>setInspectorTab(tab.dataset.inspectorTab);
 tab.onkeydown=e=>{
  const tabs=[...document.querySelectorAll('[data-inspector-tab]')],index=tabs.indexOf(tab);
  let next;if(e.key==='ArrowLeft')next=(index+1)%tabs.length;else if(e.key==='ArrowRight')next=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
  e.preventDefault();e.stopPropagation();setInspectorTab(tabs[next].dataset.inspectorTab,true);
 };
}
try{setInspectorTab(localStorage.getItem('sahl-inspector-tab')||'text');}catch{setInspectorTab('text');}
$('media-search').addEventListener('input',renderAssets);
for(const button of document.querySelectorAll('[data-media-filter]'))button.onclick=()=>{
 document.querySelectorAll('[data-media-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderAssets();
};
$('clear-media-search').onclick=()=>{$('media-search').value='';document.querySelector('[data-media-filter=all]').click();$('media-search').focus();};
$('fit-timeline').onclick=()=>{$('zoom').value='1';$('timeline-scroll').scrollLeft=0;renderTimeline();};
for(const button of document.querySelectorAll('.left-rail .rail-button:not(#open-shortcuts)'))button.addEventListener('click',()=>{
 document.querySelectorAll('.left-rail .rail-button').forEach(b=>b.classList.toggle('selected',b===button));
});
const resizeHandle=$('timeline-resize');
let timelineDrag=null;
function resizeTimeline(height,save=false){
 const max=Math.max(300,Math.min(420,Math.floor(innerHeight*.48))),value=Math.round(Math.max(300,Math.min(max,Number(height)||320)));
 document.documentElement.style.setProperty('--timeline-height',value+'px');
 resizeHandle.setAttribute('aria-valuemin','300');resizeHandle.setAttribute('aria-valuemax',String(max));resizeHandle.setAttribute('aria-valuenow',String(value));resizeHandle.setAttribute('aria-valuetext',value+' بكسل');
 if(save)try{localStorage.setItem('sahl-timeline-height',String(value));}catch{}
 renderRuler();scheduleFilmstrip();return value;
}
try{resizeTimeline(localStorage.getItem('sahl-timeline-height')||320);}catch{resizeTimeline(320);}
resizeHandle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();timelineDrag={id:e.pointerId,y:e.clientY,height:Number(resizeHandle.getAttribute('aria-valuenow'))};resizeHandle.setPointerCapture(e.pointerId);document.body.classList.add('resizing-timeline');};
resizeHandle.onpointermove=e=>{if(timelineDrag?.id===e.pointerId)resizeTimeline(timelineDrag.height+timelineDrag.y-e.clientY);};
function finishTimelineResize(e){if(timelineDrag?.id!==e.pointerId)return;timelineDrag=null;document.body.classList.remove('resizing-timeline');if(resizeHandle.hasPointerCapture(e.pointerId))resizeHandle.releasePointerCapture(e.pointerId);resizeTimeline(resizeHandle.getAttribute('aria-valuenow'),true);}
resizeHandle.onpointerup=resizeHandle.onpointercancel=resizeHandle.onlostpointercapture=finishTimelineResize;
resizeHandle.ondblclick=()=>resizeTimeline(320,true);
resizeHandle.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const height=Number(resizeHandle.getAttribute('aria-valuenow'));resizeTimeline(e.key==='Home'?300:e.key==='End'?420:height+(e.key==='ArrowUp'?20:-20),true);};
window.addEventListener('resize',()=>resizeTimeline(resizeHandle.getAttribute('aria-valuenow')));
const shortcutModifier=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
const shortcuts=[['تشغيل / إيقاف مؤقت','Space'],['تقسيم عند المؤشر','S'],['تفعيل المقص / التحديد','C / V'],['إطار سابق / لاحق','← / →'],['تقديم / تأخير ثانية','Shift + ← / →'],['بداية / نهاية الفيديو','Home / End'],['عرض الشريط كامل','F'],['تراجع',shortcutModifier+' + Z'],['إعادة',shortcutModifier+' + Shift + Z'],['استيراد ملفات',shortcutModifier+' + I'],['فتح مشروع',shortcutModifier+' + O'],['حفظ مع الملفات',shortcutModifier+' + S'],['حفظ باسم',shortcutModifier+' + Shift + S'],['إعدادات التصدير',shortcutModifier+' + Shift + E'],['حذف المحدد','Delete / Backspace']];
for(const [label,key]of shortcuts){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),kbd=document.createElement('kbd');dt.textContent=label;kbd.textContent=key;dd.append(kbd);row.append(dt,dd);$('shortcuts-list').append(row);}
$('open-shortcuts').onclick=()=>{$('shortcuts-dialog').showModal();};
$('close-shortcuts').onclick=()=>{$('shortcuts-dialog').close();};
for(const [id,key]of [['save-project','S'],['save-project-as','Shift + S'],['open-project','O'],['choose','I'],['undo','Z'],['redo','Shift + Z'],['open-export','Shift + E']])$(id).title=($(id).textContent.trim()||$(id).getAttribute('aria-label'))+' — '+shortcutModifier+' + '+key;
$('toggle-properties').title='إظهار / إخفاء الخصائص — Alt + P للوصول إلى المحدد';$('remove-text').setAttribute('aria-label','حذف النص');$('remove-text').title='حذف النص';
$('back-frame').setAttribute('aria-label','إطار سابق');$('next-frame').setAttribute('aria-label','إطار لاحق');$('back-frame').title='إطار سابق — ←';$('next-frame').title='إطار لاحق — →';$('play').title='تشغيل / إيقاف مؤقت — Space';
renderAssets();

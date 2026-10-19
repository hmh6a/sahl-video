// Keyboard and context actions share the existing selection, locks and undo commands.
function contextualSelection(target){const chip=target.closest('[data-clip-id],[data-audio-id],[data-title-id],[data-layer-id],[data-caption-id]');if(!chip)return null;for(const kind of ['clip','audio','title','layer','caption']){const id=chip.dataset[kind+'Id'];if(id)return {kind,id,chip,key:kind+':'+id};}return null;}
function focusSelectedProperties(){
 if(busy)return;showProperties();refreshClipControls();
 const panels={clip:'clip-controls',audio:'audio-controls',layer:'layer-controls',caption:'caption-controls',title:'text-fields'},preferred={clip:'clip-fit',audio:'audio-at',layer:'layer-at',caption:'caption-text',title:'title'};
 if(selectionKind==='title')setInspectorTab('text');
 const panel=$(panels[selectionKind]||'clip-controls'),field=$(preferred[selectionKind]);
 const control=field&&!field.disabled&&field.getClientRects().length?field:[...panel.querySelectorAll('input,select,textarea,button')].find(el=>!el.disabled&&el.getClientRects().length);
 (control||$('inspect-'+(selectionKind==='title'?'text':selectionKind)))?.focus();
}
function openContextActions(target){
 if(busy||fileBusy||document.querySelector('dialog[open]'))return;const item=contextualSelection(target);if(!item)return;pause();
 if(!selectedKeys().includes(item.key))resetSelection(item.kind,item.id);else{selectionKind=item.kind;if(item.kind==='clip')selectedClip=clips.findIndex(c=>c.id===item.id);else if(item.kind==='title')selectedTitle=item.id;else if(item.kind==='audio')selectedAudio=item.id;else if(item.kind==='layer')selectedLayer=item.id;else selectedCaption=item.id;}
 updateButtons();const names={clip:assetFor(clips[selectedClip])?.name,audio:$('audio-clip-name').textContent,layer:assetFor(currentLayer())?.name,title:currentTitle()?.title,caption:currentCaption()?.text};$('context-heading').textContent=names[selectionKind]||'العنصر المحدد';$('context-note').textContent=lockedSelection(selectedKeys())?'التحديد مقفول؛ افتح قفله من الخصائص حتى تعدّله.':selectedKeys().length+' عنصر محدد';
 const actions=$('context-actions');actions.replaceChildren();
 const add=(label,fn,disabled=false)=>{const button=document.createElement('button');button.textContent=label;button.disabled=disabled;button.onclick=()=>{$('context-dialog').close();fn();};actions.append(button);};
 add('خصائص المحدد — Alt + P',focusSelectedProperties);
 for(const [label,id]of [['نسخ','copy-selection'],['تكرار','duplicate-selection'],['حذف التحديد','delete']])add(label,()=>$(id).click(),$(id).disabled);
 if(['clip','audio','caption'].includes(selectionKind))add('تقسيم عند المؤشر',()=>{$('split').click();},$('split').disabled);
 add('مساعدة عن هذا العنصر',()=>openHelp(selectionKind));$('context-dialog').showModal();
}
$('close-context').onclick=()=>$('context-dialog').close();
$('timeline-scroll').addEventListener('contextmenu',e=>{if(contextualSelection(e.target)){e.preventDefault();openContextActions(e.target);}});
document.addEventListener('keydown',e=>{
 if(busy||e.isComposing||document.querySelector('dialog[open]'))return;
 if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyP'){e.preventDefault();focusSelectedProperties();return;}
 const item=contextualSelection(e.target);if(!item)return;
 if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();e.stopImmediatePropagation();openContextActions(e.target);}
 else if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();resetSelection(item.kind,item.id);updateButtons();focusSelectedProperties();}
},true);
$('property-switch').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...$('property-switch').querySelectorAll('button')],index=tabs.indexOf(e.target);if(index<0)return;e.preventDefault();e.stopPropagation();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();});

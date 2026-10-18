const fieldMap={animation:'animation',title:'title',subtitle:'subtitle',font:'font','font-weight':'weight',accent:'accent',size:'size',enabled:'enabled','title-start':'titleStart','title-duration':'titleDuration',position:'position','text-x':'textX','text-y':'textY'};
function fillTitleFields(){
  const t=currentTitle();$('text-fields').hidden=!t||$('tab-templates')?.getAttribute('aria-selected')==='true';if($('no-title'))$('no-title').hidden=!!t||!$('panel-templates').hidden;$('enabled').disabled=!t||busy;
  if(!t){titleBounds=null;layoutCanvas();return;}
  if(![...$('font').options].some(o=>o.value===t.font))$('font').add(new Option(t.font,t.font));
  for(const [id,key]of Object.entries(fieldMap)){if(id==='enabled')$(id).checked=t[key];else $(id).value=t[key];}
  $('font-note').hidden=t.font!=='Anton';template=t.template;document.querySelectorAll('.template').forEach(b=>b.classList.toggle('selected',b.dataset.template===template));
}
function renderTitleList(){
  document.querySelectorAll('.template').forEach(b=>b.disabled=busy||titlesLocked||!currentTitle());if($('templates-empty'))$('templates-empty').hidden=!!currentTitle();
  $('text-list').replaceChildren();titles.forEach((t,i)=>$('text-list').add(new Option(`${i+1}. ${t.title||t.subtitle||'نص بدون عنوان'} — ${seconds(t.titleStart)}`,t.id)));
  $('text-list').value=selectedTitle||'';$('text-count').textContent=titles.length+' نص · لكل نص وقت ومكان مستقل';
  $('duplicate-text').disabled=$('remove-text').disabled=busy||titlesLocked||!currentTitle();$('add-text').disabled=busy||titlesLocked||titles.length>=24;$('duplicate-text').disabled ||=titles.length>=24;
}
function selectTitle(id,preview=false){selectionKind='title';timelineSelection=['title:'+id];selectedTitle=id;fillTitleFields();draw();renderTitleList();renderTitleTracks();updateButtons();if(preview)previewTitle();}
function previewTitle(){if(!meta||busy)return;pause();const t=currentTitleTime();if(t.duration)seekTo(t.start+Math.min(t.duration/2,Math.max(Math.min(.5,t.duration/3),.05)));else status('هذا النص يبدأ بعد نهاية الفيديو. غيّر وقت البداية حتى يظهر.');}
function renderTitleTracks(){
  const track=$('title-track');track.replaceChildren();track.style.height=Math.max(26,titles.length*26)+'px';$('timeline-surface').style.height='auto';
  if(!titles.length){const empty=document.createElement('span');empty.className='empty-titles';empty.textContent='اضغط «إضافة نص» حتى تضيف كتابة';track.append(empty);}
  titles.forEach((t,i)=>{
    const row=document.createElement('div');row.className='title-row';row.style.top=i*26+'px';track.append(row);
    let time;try{time=SahlTitle.timing(total(),t.titleStart,t.titleDuration);}catch{return;}
    if(!total()||!time.duration)return;
    const chip=document.createElement('div');chip.className='title-chip'+(timelineSelection.includes('title:'+t.id)||!timelineSelection.length&&t.id===selectedTitle&&selectionKind==='title'?' selected':'')+(!t.enabled?' muted-title':'');chip.dataset.titleId=t.id;chip.role='button';chip.tabIndex=0;chip.setAttribute('aria-label',`النص ${i+1}: ${t.title||t.subtitle} — اسحب لتغيير وقته`);
    chip.style.left=time.start/total()*100+'%';chip.style.width=time.duration/total()*100+'%';
    for(const edge of ['start','end']){const handle=document.createElement('span');handle.className='title-edge';handle.dataset.edge=edge;handle.title=edge==='start'?'غيّر بداية النص':'غيّر نهاية النص';chip.append(handle);}
    const label=document.createElement('span');label.className='title-chip-text';label.textContent=t.title||t.subtitle||'نص';chip.append(label);row.append(chip);
  });
}
$('text-list').onchange=()=>selectTitle($('text-list').value,true);
$('add-text').onclick=()=>{if(busy||titlesLocked||titles.length>=24)return;pause();checkpoint();const t=SahlTitles.create({title:'نص جديد '+(titles.length+1),titleStart:meta?Math.min(cursor,Math.max(0,total()-.1)):0,titleDuration:meta?Math.min(5,Math.max(.1,total()-cursor)):5,position:titles.length%2?'top-right':'left'});titles.push(t);selectTitle(t.id,true);updateButtons();showProperties('text');$('title').focus();};
$('duplicate-text').onclick=()=>{if(busy||titlesLocked||!currentTitle()||titles.length>=24)return;pause();checkpoint();const t=SahlTitles.create({...currentTitle(),id:undefined,title:currentTitle().title+' — نسخة',titleStart:meta?Math.min(total()-.1,currentTitle().titleStart+currentTitle().titleDuration):currentTitle().titleStart});if(t.link){const parent=SahlAudioTracks.offsets(clips).get(t.link.clipId);t.titleStart=Math.max(parent.at,t.titleStart);t.link.offset=t.titleStart-parent.at;}titles.push(t);selectTitle(t.id,true);updateButtons();};
function removeTitle(){if(busy||titlesLocked||!currentTitle())return;pause();checkpoint();const index=titles.findIndex(t=>t.id===selectedTitle);titles.splice(index,1);selectedTitle=titles[Math.min(index,titles.length-1)]?.id||null;fillTitleFields();draw();renderTitleList();renderTimeline();}
$('remove-text').onclick=removeTitle;
$('play-title-animation').onclick=()=>{const t=currentTitle();if(!t||busy||!meta)return;pause();seekTo(t.titleStart);$('play').click();};
function writeTitleTime(value){changed();const t=currentTitle();if(!t)return;t.titleStart=Number(Math.max(0,value.start).toFixed(2));t.titleDuration=Number(Math.max(.1,value.duration).toFixed(2));if(t.link){const parent=SahlAudioTracks.offsets(clips).get(t.link.clipId);if(parent){t.titleStart=Math.max(parent.at,t.titleStart);t.link.offset=t.titleStart-parent.at;}}$('title-start').value=t.titleStart;$('title-duration').value=t.titleDuration;renderTitleTracks();if(typeof renderAudioTracks==='function')renderAudioTracks();renderTitleList();updateButtons();previewTitle();}
$('preview-title').onclick=previewTitle;
$('title-start-here').onclick=()=>{if(!meta||busy||titlesLocked||!currentTitle())return;pause();checkpoint();writeTitleTime({start:Math.min(cursor,Math.max(0,total()-.1)),duration:currentTitle().titleDuration});};
let titleDrag=null;
$('title-track').onpointerdown=e=>{
  const chip=e.target.closest('.title-chip');if(!chip||!meta||busy||titlesLocked||e.button!==0)return;e.preventDefault();e.stopPropagation();pause();showProperties();
  const id=chip.dataset.titleId,edge=e.target.dataset.edge;selectTitle(id);const t=currentTitleTime();
  titleDrag={pointer:e.pointerId,x:e.clientX,start:t.start,duration:t.duration,edge,scale:total()/$('ruler').getBoundingClientRect().width,changed:false};
  $('title-track').setPointerCapture(e.pointerId);previewTitle();
};
$('title-track').onpointermove=e=>{if(!titleDrag||titleDrag.pointer!==e.pointerId)return;const d=titleDrag;let delta=(e.clientX-d.x)*d.scale;if(typeof snapTimelineTime==='function'){const edge=d.edge==='end'?d.start+d.duration:d.start;delta=snapTimelineTime(edge+delta,['title:'+selectedTitle])-edge;}if(!d.changed&&Math.abs(e.clientX-d.x)<2)return;if(!d.changed){checkpoint();d.changed=true;}writeTitleTime(d.edge?SahlTitle.resize(d.start,d.duration,delta,d.edge,total()):SahlTitle.move(d.start,d.duration,delta,total()));};
function finishTitleDrag(e){if(!titleDrag||titleDrag.pointer!==e.pointerId)return;titleDrag=null;if($('title-track').hasPointerCapture(e.pointerId))$('title-track').releasePointerCapture(e.pointerId);updateButtons();}
$('title-track').onpointerup=$('title-track').onpointercancel=finishTitleDrag;
$('title-track').onkeydown=e=>{const chip=e.target.closest('.title-chip');if(!chip||busy||titlesLocked)return;if(e.key==='Enter'){e.preventDefault();selectTitle(chip.dataset.titleId,true);showProperties('text');$('title').focus();}if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopPropagation();selectedTitle=chip.dataset.titleId;timelineSelection=['title:'+selectedTitle];deleteSelected();}};
let positionDrag=null;
function moveTitle(x,y){changed();const t=currentTitle();if(!t||!titleBounds)return;const p=SahlTitle.place(x,y,titleBounds.width,titleBounds.height,meta.width,meta.height);t.position='custom';t.textX=Number((p.x/meta.width*100).toFixed(1));t.textY=Number((p.y/meta.height*100).toFixed(1));$('position').value='custom';$('text-x').value=t.textX;$('text-y').value=t.textY;draw();}
$('title-selection').onpointerdown=e=>{if(!meta||busy||titlesLocked||!titleBounds||e.button!==0)return;e.preventDefault();selectionKind='title';pause();showProperties();const r=$('stage').getBoundingClientRect();positionDrag={pointer:e.pointerId,x:e.clientX,y:e.clientY,bounds:{...titleBounds},scale:Math.min(r.width/meta.width,r.height/meta.height),changed:false};$('title-selection').setPointerCapture(e.pointerId);$('title-selection').focus({preventScroll:true});};
$('title-selection').onpointermove=e=>{if(!positionDrag||positionDrag.pointer!==e.pointerId)return;const d=positionDrag;if(!d.changed&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<2)return;if(!d.changed){checkpoint();d.changed=true;}moveTitle(d.bounds.x+(e.clientX-d.x)/d.scale,d.bounds.y+(e.clientY-d.y)/d.scale);};
function finishPositionDrag(e){if(!positionDrag||positionDrag.pointer!==e.pointerId)return;positionDrag=null;if($('title-selection').hasPointerCapture(e.pointerId))$('title-selection').releasePointerCapture(e.pointerId);updateButtons();}
$('title-selection').onpointerup=$('title-selection').onpointercancel=finishPositionDrag;
$('title-selection').onkeydown=e=>{if(!meta||busy||titlesLocked||!titleBounds)return;const step=e.shiftKey?10:1,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];if(delta){e.preventDefault();e.stopPropagation();checkpoint();moveTitle(titleBounds.x+delta[0],titleBounds.y+delta[1]);updateButtons();}if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopPropagation();removeTitle();}};
for(const id of titleFields){
  let before;
  $(id).addEventListener('focus',()=>{selectionKind='title';timelineSelection=selectedTitle?['title:'+selectedTitle]:[];before=snapshot();updateButtons();});
  $(id).oninput=()=>{if(!currentTitle()||busy||titlesLocked)return;if(id==='text-x'||id==='text-y')$('position').value='custom';commitTitle();$('font-note').hidden=$('font').value!=='Anton';draw();renderTitleList();renderTitleTracks();updateButtons();changed();};
  $(id).addEventListener('change',()=>{if(before&&JSON.stringify(before.titles)!==JSON.stringify(titles)){history.push(before);future=[];before=snapshot();}if(id==='title-start'||id==='title-duration'||id==='position')previewTitle();updateButtons();});
}
for(const id of ['title','subtitle','font','font-weight','size','accent'])$(id).addEventListener('focus',()=>{if(currentTitleTime().duration&&SahlTitle.opacity(cursor,currentTitleTime())===0)previewTitle();});
document.querySelectorAll('.template').forEach(button=>button.onclick=()=>{if(!currentTitle()||busy||titlesLocked)return;checkpoint();template=button.dataset.template;currentTitle().template=template;fillTitleFields();draw();updateButtons();previewTitle();});
let savedLayouts=[];
function renderSavedLayouts(selected=''){const list=$('saved-layout');list.replaceChildren(new Option('اختار من قوالبك',''));for(const p of savedLayouts)list.add(new Option(p.name+' · '+p.titles.length+' نص',p.id));list.value=selected;$('apply-layout').disabled=busy||!selected;}
$('saved-layout').onchange=()=>{$('apply-layout').disabled=busy||!$('saved-layout').value;};
$('save-template').onclick=async()=>{if(busy)return;const name=$('layout-name').value.trim();if(!name){status('اكتب اسم للقالب حتى تحفظ ترتيب النصوص.');$('layout-name').focus();return;}commitTitle();try{const saved=await window.sahl.saveLayout(name,structuredClone(titles));savedLayouts=saved.entries;renderSavedLayouts(saved.entry.id);status('حفظت قالب «'+saved.entry.name+'» بكل النصوص وأماكنها وتوقيتها.');}catch(e){status('تعذّر حفظ القالب: '+e.message,true);}};
$('apply-layout').onclick=()=>{const p=savedLayouts.find(p=>p.id===$('saved-layout').value);if(!p||busy||titlesLocked)return;pause();checkpoint();titles=SahlTitles.normalize(structuredClone(p.titles)).map(t=>{delete t.link;return t;});selectedTitle=titles[0]?.id||null;fillTitleFields();draw();renderTitleList();renderTimeline();previewTitle();status('طبّقت قالب «'+p.name+'». اختار كل نص وغيّر الكتابة؛ التوقيت والمكان والخط محفوظة.');};
window.sahl.listTemplates().then(list=>{savedLayouts=list;renderSavedLayouts();}).catch(e=>status('تعذّر قراءة القوالب المحفوظة: '+e.message,true));
for(const [id,icon,label]of [
 ['nav-media','folder','ملفاتي'],['nav-templates','grid','القوالب'],['nav-text','text','الكتابة'],['nav-transitions','transition','انتقالات'],['right-text','text','كتابة'],['right-export','cpu','رندرة'],['open-export','upload','تصدير'],['choose','plus','استيراد ملفات'],['choose-image','image','إضافة صورة'],['open-project','folder','فتح مشروع'],['save-project','save','حفظ مع الملفات'],['save-project-as','save','حفظ باسم'],['choose-empty','folder','اختار فيديو من الجهاز'],['back-frame','previous'],['next-frame','next'],['undo','undo'],['redo','redo'],['razor','scissors','المقص'],['split','split','تقسيم هنا'],['delete','trash','حذف'],['save-template','save','حفظ ترتيب النصوص كقالب'],['close-export','close'],['toggle-properties','text','الكتابة والخط'],['add-text','plus','إضافة نص'],['remove-text','trash','حذف النص']
])UIIcons.button(id,icon,label);
$('undo').setAttribute('aria-label','تراجع');$('redo').setAttribute('aria-label','إعادة');document.querySelector('.brand .logo').replaceChildren(UIIcons.node('play'));document.querySelector('.media-empty>span').replaceChildren(UIIcons.node('image'));document.querySelector('.empty-icon').replaceChildren(UIIcons.node('play'));setPlayIcon(false);fillTitleFields();renderTitleList();draw();renderTimeline();

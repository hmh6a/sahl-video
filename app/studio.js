function updateEncoderNote(hdr=false){
 const selected=availableEncoders.find(e=>e.id===$('encoder').value);
 $('encoder-note').textContent=$('encoder').value==='cpu'?'يُصدَّر الفيديو باستخدام المعالج CPU.':hdr&&selected&&!selected.hdrEncoder?'تدعم بطاقة الرسومات هذه الفيديو العادي؛ ويُستخدم المعالج CPU تلقائياً لتصدير HDR.':selected?'يُرمَّز الفيديو باستخدام بطاقة الرسومات: '+selected.name+'؛ وتُعالَج بعض المؤثرات باستخدام المعالج.':'بطاقة الرسومات غير متاحة. اختر المعالج CPU.';
}
function updateExportColor(){
 const hdr=clips.some(c=>assetFor(c)?.hdr)||(typeof layers!=='undefined'&&layers.some(c=>!c.hidden&&c.at<total()&&assetFor(c)?.hdr)),note=$('export-color-note'),selected=availableEncoders.find(e=>e.id===$('encoder').value);
 note.hidden=!hdr;updateEncoderNote(hdr);
 if(hdr)note.textContent='يُصدَّر الفيديو تلقائياً بتقنية HDR وبصيغة HEVC بعمق ألوان 10-bit، مع الحفاظ على دقة المشروع ومعدل إطاراته. '+(selected?.hdrEncoder?'تُستخدم بطاقة الرسومات في الترميز.':$('encoder').value==='cpu'?'يُستخدم المعالج CPU في الترميز.':'لا تدعم بطاقة الرسومات المحددة تصدير HDR؛ لذا يُستخدم المعالج CPU تلقائياً.')+' يتطلب عرض نطاق السطوع الكامل شاشة ومشغّلاً يدعمان HDR.';
 $('export-format').textContent=hdr?'MP4 · HDR · HEVC 10-bit · بدون علامة مائية':'MP4 · بدون علامة مائية';
}
let availableEncoders=[];
function showProperties(section){if(section){selectionKind='title';if(typeof refreshClipControls==='function')refreshClipControls();}document.body.classList.remove('properties-hidden');$('toggle-properties').setAttribute('aria-expanded','true');if(section&&typeof setInspectorTab==='function')setInspectorTab(section);layoutCanvas();}
function openExport(){updateExportInfo();updateButtons();if($('export-duration'))$('export-duration').textContent=seconds(total());if(typeof refreshExportRange==='function')refreshExportRange();$('export-dialog').showModal();$('export-status').textContent=meta?'':'استورد فيديو أولاً حتى تقدر تصدّره.';}
$('open-export').onclick=$('right-export').onclick=openExport;
$('close-export').onclick=()=>{if(!busy)$('export-dialog').close();};
$('export-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('toggle-properties').onclick=()=>{document.body.classList.toggle('properties-hidden');$('toggle-properties').setAttribute('aria-expanded',String(!document.body.classList.contains('properties-hidden')));layoutCanvas();};
$('right-text').onclick=$('nav-text').onclick=()=>{showProperties('text');$('title').focus();};
$('nav-templates').onclick=()=>{showProperties('templates');$('tab-templates').focus();};
$('nav-media').onclick=()=>{$('choose').focus();};
$('nav-transitions').onclick=()=>{if(clips.length<2){status('قسّم الفيديو أولاً بالمقص، بعدها اضغط ◇ بين القطعتين.');return;}if(selectedClip<0||selectedClip>=clips.length-1)selectedClip=0;renderTimeline();$('transition').focus();};
$('back-frame').onclick=()=>{pause();seekTo(cursor-1/fps(meta.fps));};
$('next-frame').onclick=()=>{pause();seekTo(cursor+1/fps(meta.fps));};
$('encoder').onchange=()=>{updateEncoderNote();updateButtons();};
window.sahl.encoders().then(list=>{
  availableEncoders=list;const previous=$('encoder').value;$('encoder').replaceChildren();
  if(!list.length){const unavailable=new Option('بطاقة الرسومات GPU — غير مدعومة حالياً','gpu-auto');unavailable.disabled=true;$('encoder').add(unavailable);}
  for(const e of list)$('encoder').add(new Option('بطاقة الرسومات · '+e.name,e.id));
  $('encoder').add(new Option('المعالج CPU','cpu'));
  $('encoder').value=previous==='cpu'||list.some(e=>e.id===previous)?previous:list[0]?.id||'cpu';$('encoder').onchange();
}).catch(()=>{$('encoder').value='cpu';$('encoder').onchange();$('encoder-note').textContent='تعذّر فحص بطاقة الرسومات. تم اختيار المعالج CPU لإتاحة التصدير.';});
const fontsReady=window.sahl.fonts().then(fonts=>{
  for(const name of fonts){if(![...$('font').options].some(o=>o.value===name))$('font').add(new Option(name,name));}
}).catch(()=>{});
new ResizeObserver(layoutCanvas).observe($('stage'));

function updateExportInfo(preferred=$('resolution').value){
 const options=SahlResolution.choices(meta),select=$('resolution');select.replaceChildren();
 for(const option of options)select.add(new Option(option.label,option.value));
 select.value=options.some(o=>o.value===preferred)?preferred:'source';
 if(!meta){$('output-info').textContent='نفس الفيديو الأصلي';$('export-fps').textContent='معدل الإطارات: نفس المصدر';return;}
 const {width,height}=SahlResolution.outputSize(meta,select.value);$('output-info').textContent=width+' × '+height;$('export-fps').textContent='معدل الإطارات: \u2066'+fps(meta.fps).toFixed(2)+' fps\u2069 — نفس المصدر';
}
$('resolution').onchange=()=>{updateExportInfo();changed();};$('quality').onchange=changed;$('encoder').addEventListener('change',changed);

function exportSnapshot(){
 const hdr=clips.some(c=>assetFor(c)?.hdr)||(typeof layers!=='undefined'&&layers.some(c=>!c.hidden&&c.at<total()&&assetFor(c)?.hdr)),selected=availableEncoders.find(e=>e.id===$('encoder').value),size=SahlResolution.outputSize(meta,$('resolution').value);
 return {resolution:size.width+' × '+size.height,fps:fps(meta.fps).toFixed(2)+' fps',duration:typeof selectedExportRange==='function'&&selectedExportRange().enabled?precise(selectedExportRange().duration):seconds(total()),encoder:selected&&(!hdr||selected.hdrEncoder)?selected.name:'المعالج CPU',quality:$('quality').selectedOptions[0].textContent,format:hdr?'MP4 · HEVC · HDR 10-bit':'MP4 · H.264 · SDR'};
}

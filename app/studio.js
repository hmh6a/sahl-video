let availableEncoders=[];
function showProperties(){document.body.classList.remove('properties-hidden');layoutCanvas();}
function openExport(){updateExportInfo();$('export-dialog').showModal();$('export-status').textContent=meta?'':'استورد فيديو أولاً حتى تقدر تصدّره.';}
$('open-export').onclick=$('right-export').onclick=openExport;
$('close-export').onclick=()=>{if(!busy)$('export-dialog').close();};
$('export-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('toggle-properties').onclick=()=>{document.body.classList.toggle('properties-hidden');layoutCanvas();};
$('right-text').onclick=$('nav-text').onclick=()=>{showProperties();$('title').focus();};
$('nav-templates').onclick=()=>{showProperties();$('templates-heading').scrollIntoView({block:'center',behavior:'smooth'});};
$('nav-media').onclick=()=>{$('choose').focus();};
$('nav-transitions').onclick=()=>{if(clips.length<2){status('قسّم الفيديو أولاً بالمقص، بعدها اضغط ◇ بين القطعتين.');return;}if(selectedClip<0||selectedClip>=clips.length-1)selectedClip=0;renderTimeline();$('transition').focus();};
$('back-frame').onclick=()=>{pause();seekTo(cursor-1/fps(meta.fps));};
$('next-frame').onclick=()=>{pause();seekTo(cursor+1/fps(meta.fps));};
$('encoder').onchange=()=>{const name=availableEncoders.find(e=>e.id===$('encoder').value)?.name;$('encoder-note').textContent=$('encoder').value==='cpu'?'التصدير على المعالج. مناسب إذا تريد توافق أوسع.':name?'ترميز الفيديو على كارت الشاشة: '+name+'؛ بعض المؤثرات تُعالج على المعالج.':'كارت الشاشة غير متاح. اختار المعالج CPU.';updateButtons();};
window.sahl.encoders().then(list=>{
  availableEncoders=list;const previous=$('encoder').value;$('encoder').replaceChildren();
  if(!list.length){const unavailable=new Option('كارت الشاشة GPU — غير مدعوم حالياً','gpu-auto');unavailable.disabled=true;$('encoder').add(unavailable);}
  for(const e of list)$('encoder').add(new Option('كارت الشاشة · '+e.name,e.id));
  $('encoder').add(new Option('المعالج CPU','cpu'));
  $('encoder').value=previous==='cpu'?'cpu':list[0]?.id||'gpu-auto';$('encoder').onchange();
}).catch(()=>{$('encoder-note').textContent='تعذّر فحص كارت الشاشة. تقدر تختار المعالج CPU.';});
const fontsReady=window.sahl.fonts().then(fonts=>{
  for(const name of fonts){if(![...$('font').options].some(o=>o.value===name))$('font').add(new Option(name,name));}
}).catch(()=>{});
new ResizeObserver(layoutCanvas).observe($('stage'));

function updateExportInfo(){if(!meta)return;const resolution=$('resolution').value,short=Math.min(meta.width,meta.height),scale=resolution==='source'?1:Number(resolution)/short,width=resolution==='source'?Math.ceil(meta.width/2)*2:Math.round(meta.width*scale/2)*2,height=resolution==='source'?Math.ceil(meta.height/2)*2:Math.round(meta.height*scale/2)*2;$('output-info').textContent=width+' × '+height;$('export-fps').textContent='معدل الإطارات: '+fps(meta.fps).toFixed(2)+' fps — نفس المصدر';}
$('resolution').onchange=()=>{updateExportInfo();changed();};$('quality').onchange=changed;$('encoder').addEventListener('change',changed);

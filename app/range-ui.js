function resetExportRange(){$('range-enabled').checked=false;$('range-start').value='0';$('range-end').value='0';}
function exportRangeRequest(){return $('range-enabled').checked?{start:Number($('range-start').value),end:Number($('range-end').value)}:null;}
function selectedExportRange(){return SahlExportRange.normalize(exportRangeRequest(),total(),meta?.fps);}
function refreshExportRange(){
 const enabled=$('range-enabled').checked;for(const id of ['range-start','range-end']){$(id).disabled=!enabled;$(id).max=String(total());}
 if(!enabled){$('range-start').value='0';$('range-end').value=String(total());}
 try{const r=selectedExportRange();$('range-info').textContent=r.enabled?`${r.start.toFixed(3)} → ${r.end.toFixed(3)} · ${r.duration.toFixed(3)} ثانية · ${r.last-r.first} إطار`:'تصدير المشروع كامل.';$('range-info').classList.remove('error');$('export-duration').textContent=precise(r.duration);}catch(e){$('range-info').textContent=e.message;$('range-info').classList.add('error');$('export-duration').textContent='—';}
}
for(const id of ['range-enabled','range-start','range-end'])$(id).oninput=refreshExportRange;
function setRangeEdge(edge){if(!meta||!clips.length||busy)return;if(!$('range-enabled').checked){$('range-start').value='0';$('range-end').value=String(total());}$('range-enabled').checked=true;$('range-'+edge).value=String(Math.round(cursor*1e6)/1e6);refreshExportRange();status(edge==='start'?'حددت بداية التصدير عند المؤشر.':'حددت نهاية التصدير عند المؤشر.');}
$('range-in').onclick=()=>setRangeEdge('start');$('range-out').onclick=()=>setRangeEdge('end');$('range-reset').onclick=()=>{resetExportRange();refreshExportRange();};
document.addEventListener('keydown',e=>{if(busy||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.isComposing||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(['i','o'].includes(e.key.toLowerCase())){e.preventDefault();setRangeEdge(e.key.toLowerCase()==='i'?'start':'end');}});

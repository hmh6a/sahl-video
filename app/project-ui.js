let projectFile=null,projectDirty=false,projectQueued=false,fileBusy=false;
function projectSnapshot(){return {...snapshot(),meta:meta?{width:meta.width,height:meta.height,fps:meta.fps}:null,assetIds:assets.map(a=>a.id),zoom:Number($('zoom').value),encoder:$('encoder').value,quality:$('quality').value,resolution:$('resolution').value};}
function projectLabel(name){$('project-name').textContent=(projectDirty?'● ':'')+(name||projectFile?.split(/[\\/]/).pop()||'مشروع جديد');$('project-name').title=projectFile||'مشروع جديد';}
function markDirty(){projectDirty=true;projectLabel();if(typeof autosavePending==='function')autosavePending();if(projectQueued)return;projectQueued=true;queueMicrotask(()=>{projectQueued=false;window.sahl.projectState(projectSnapshot(),true);});}
function fileButtons(value){fileBusy=value;for(const id of ['open-project','save-project','save-project-as'])$(id).disabled=value;}
async function saveCurrentProject(saveAs=false){
 if(busy||fileBusy)return;if(importing)return status('انتظر انتهاء استيراد الملفات حتى تحفظ أو تفتح مشروع.');pause();commitTitle();fileButtons(true);
 try{const result=await window.sahl.saveProject(projectSnapshot(),saveAs);if(result.error)return status('تعذّر حفظ المشروع: '+result.error,true);if(result.canceled){status('تم إلغاء الحفظ؛ التعديلات تبقى مفتوحة بالبرنامج.');return;}projectFile=result.path;projectDirty=false;projectLabel(result.name);status('حفظت المشروع ونسخت ملفاته. انقل المجلد كامل حتى تفتحه بأي مكان: '+result.folder);}
 catch(e){status('تعذّر حفظ المشروع: '+e.message,true);}finally{fileButtons(false);}
}
async function openSavedProject(){
 if(busy||fileBusy)return;if(importing)return status('انتظر انتهاء استيراد الملفات حتى تحفظ أو تفتح مشروع.');pause();commitTitle();fileButtons(true);
 try{const result=await window.sahl.openProject(projectSnapshot());if(result.error)return status(result.error,true);if(result.canceled)return;applyProjectResult(result);status('فتحت المشروع. القصات والنصوص والصور ومسارات الصوت وتوقيتها رجعت مثل ما حفظتها.');
 }catch(e){status('تعذّر فتح المشروع: '+e.message,true);}finally{fileButtons(false);}
}
function applyProjectResult(result){
 previewAbort?.abort();frameSerial++;sourceId=null;unsupported=false;unsupportedAssets.clear();thumbnailQueue.clear();previewLoad.cancel();
 const s=result.state;audioTracks=structuredClone(s.audioTracks||[]);mainTrack={muted:false,solo:false,locked:false,...s.mainTrack};markers=structuredClone(s.markers||[]);titlesLocked=!!s.titlesLocked;snapEnabled=s.snapEnabled!==false;selectedAudio=s.selectedAudio||null;timelineSelection=[];lastMainClips=null;if(typeof resetTrackPreview==='function')resetTrackPreview();if(typeof resetTimelineClipboard==='function')resetTimelineClipboard();assets=result.assets;meta=s.meta;sourceMeta=s.sourceMeta||s.meta;canvasMode=s.canvasMode||'source';clips=s.clips;cursor=s.cursor;selectedClip=s.selectedClip;selectionKind=s.selectionKind;titles=s.titles;selectedTitle=s.selectedTitle;history=[];future=[];razor=false;
 $('zoom').value=s.zoom;updateExportInfo(s.resolution);$('quality').value=s.quality;if([...$('encoder').options].some(o=>o.value===s.encoder))$('encoder').value=s.encoder;
 $('badge').textContent=meta?`${meta.width} × ${meta.height}`:'4K READY';projectFile=result.path;projectDirty=!!result.dirty;projectLabel(result.name);
 fillTitleFields();draw();renderTitleList();renderAssets();renderTimeline();seekTo(cursor);updateExportInfo();$('show-output').hidden=true;
}
$('save-project').onclick=()=>saveCurrentProject(false);$('save-project-as').onclick=()=>saveCurrentProject(true);$('open-project').onclick=openSavedProject;
projectLabel();

window.sahl.onProjectSaved?.(result=>{projectFile=result.path;projectDirty=false;projectLabel(result.name);});

function projectCopyProgress(p){
 if(p.phase==='finished'){if($('project-copy-dialog').open)$('project-copy-dialog').close();busy=false;updateButtons();renderTitleList();return;}
 if(p.phase==='start'){pause();busy=true;updateButtons();$('project-copy-progress').value=0;$('project-copy-label').textContent='جاري تجهيز مجلد المشروع…';$('project-copy-file').textContent='';$('cancel-project-copy').disabled=false;if(!$('project-copy-dialog').open)$('project-copy-dialog').showModal();return;}
 $('project-copy-progress').value=p.percent||0;$('project-copy-label').textContent=Math.floor(p.percent||0)+'% · '+p.index+' / '+p.count+' ملف';$('project-copy-file').textContent=p.name||'';
}
window.sahl.onProjectCopy?.(projectCopyProgress);
$('project-copy-dialog').addEventListener('cancel',e=>e.preventDefault());
$('cancel-project-copy').onclick=()=>{$('cancel-project-copy').disabled=true;$('project-copy-label').textContent='جاري إلغاء الحفظ…';window.sahl.cancelProjectSave();};

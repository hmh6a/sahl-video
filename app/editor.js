const TL=window.SahlTimeline;
let assets=[],clips=[],selectedClip=-1,selectionKind='clip',cursor=0,razor=false,history=[],future=[],playing=false,playIndex=0,raf;
let filmTimer,scrubDrag=null,seekRaf,pendingSeek,playbackAbort=null,previewAbort=null,sourceId=null,imageClock=0,imageLocal=0,segmentPending=false;
const unsupportedAssets=new Set(),titleFields=['title','subtitle','font','font-weight','accent','size','enabled','title-start','title-duration','position','text-x','text-y','animation'];
let captions=SahlCaptions.normalize(),selectedCaption=null;
let layers=[],selectedLayer=null,proxyPreferences={};
let audioTracks=[],mainTrack={muted:false,solo:false,locked:false},markers=[],titlesLocked=false,snapEnabled=true,selectedAudio=null,timelineSelection=[],lastMainClips=null;
const assetFor=c=>assets.find(a=>a.id===c?.assetId);
const thumbnailQueue=new SahlMediaLoading.ThumbnailQueue({onChange:({pending,paused})=>{
 const el=$('thumbnail-progress');if(!el)return;el.hidden=!pending;el.textContent=paused?'صور الشريط مؤجلة':'تجهيز صور الشريط…';el.title=paused?'تتأجل أثناء تجهيز المعاينة أو التشغيل أو التصدير، وتستأنف تلقائياً.':pending+' صور متبقية — تقدر تكمل التحرير';
}});
const previewLoad=new SahlMediaLoading.PreviewState(state=>{
 const loading=state.phase==='loading',failed=state.phase==='error';
 $('preview-loading').hidden=!(failed||loading&&state.elapsed>=.25);$('preview-loading').classList.toggle('failed',failed);
 $('stage').setAttribute('aria-busy',String(loading));
 $('preview-loading-title').textContent=failed?'المعاينة تحتاج محاولة ثانية':state.elapsed>=8?'المعاينة بعدها تتحمّل…':'جاري تجهيز المعاينة…';
 $('preview-loading-detail').textContent=failed?state.error:state.elapsed>=8?'الفيديو الكبير ممكن يحتاج وقت أكثر. تقدر تكمل القص والكتابة.':'تقدر ترتّب القطع وتعدّل النصوص أثناء التحميل.';
 $('preview-loading-time').textContent=loading&&state.elapsed>=1?seconds(state.elapsed):'';
 $('retry-preview').hidden=!failed;refreshBackgroundWork();
});
function refreshBackgroundWork(){thumbnailQueue.setPaused(busy||previewLoad.phase==='loading'||playing||!!playbackAbort);}
function showImportProgress(progress){
 $('import-state').hidden=false;$('import-label').textContent=progress?.count?'جاري قراءة الملف '+progress.index+' من '+progress.count+'…':'جاري استيراد الملفات…';$('import-file').textContent=progress?.name||'تقدر تكمل التعديل على مشروعك.';
}
window.sahl.onImportProgress?.(showImportProgress);
$('retry-preview').onclick=()=>{if(busy)return;pause();video.load();seekTo(cursor);};

function total(){return TL.duration(clips);}
function snapshot(){return {captions:structuredClone(captions),selectedCaption,layers:structuredClone(layers),selectedLayer,proxyPreferences:structuredClone(proxyPreferences),audioTracks:structuredClone(audioTracks),mainTrack:{...mainTrack},markers:structuredClone(markers),titlesLocked,snapEnabled,selectedAudio,timelineSelection:[...timelineSelection],meta:meta?{...meta}:null,sourceMeta:sourceMeta?{...sourceMeta}:null,canvasMode,resolution:$('resolution').value,clips:structuredClone(clips),selectedClip,selectionKind,cursor,titles:structuredClone(titles),selectedTitle};}
function changed(){if(typeof markDirty==='function')markDirty();}
function checkpoint(){history.push(snapshot());if(history.length>100)history.shift();future=[];changed();}
function restore(s){pause();captions=SahlCaptions.normalize(s.captions);selectedCaption=s.selectedCaption||null;if(typeof invalidateCaptionPreview==='function')invalidateCaptionPreview();layers=structuredClone(s.layers||[]);selectedLayer=s.selectedLayer||null;proxyPreferences=structuredClone(s.proxyPreferences||{});if(typeof resetLayerPreview==='function')resetLayerPreview();sourceId=null;if(typeof resetMotionPreview==='function')resetMotionPreview();audioTracks=structuredClone(s.audioTracks||[]);mainTrack={muted:false,solo:false,locked:false,...s.mainTrack};markers=structuredClone(s.markers||[]);titlesLocked=!!s.titlesLocked;snapEnabled=s.snapEnabled!==false;selectedAudio=s.selectedAudio||null;timelineSelection=[...(s.timelineSelection||[])];lastMainClips=null;meta=s.meta;sourceMeta=s.sourceMeta;canvasMode=s.canvasMode||'source';updateExportInfo(s.resolution);$('badge').textContent=meta?`${meta.width} × ${meta.height}`:'4K READY';clips=structuredClone(s.clips);selectedClip=s.selectedClip;selectionKind=s.selectionKind||'clip';cursor=s.cursor;titles=structuredClone(s.titles);selectedTitle=s.selectedTitle;fillTitleFields();draw();renderTitleList();renderTimeline();seekTo(cursor);changed();if(typeof restoreProxyChoices==='function'&&Object.values(proxyPreferences).some(p=>p.enabled))restoreProxyChoices();}
function setPlayIcon(active){UIIcons.button('play',active?'pause':'play');$('play').dataset.playing=String(active);$('play').setAttribute('aria-label',active?'إيقاف مؤقت':'تشغيل');}
function pause(){if(typeof pauseLayerPreview==='function')pauseLayerPreview();if(typeof pauseMotion==='function')pauseMotion();if(typeof pauseTrackAudio==='function')pauseTrackAudio();const pending=!!playbackAbort;playbackAbort?.abort();playbackAbort=null;playing=false;segmentPending=false;cancelAnimationFrame(raf);video.pause();setPlayIcon(false);if(pending)previewLoad.cancel();refreshBackgroundWork();if(typeof updateClipAudio==='function')updateClipAudio();}
function currentTitleTime(){const t=currentTitle();try{return t?SahlTitle.timing(total(),t.titleStart,t.titleDuration):{duration:0};}catch{return {start:0,end:0,duration:0,fade:0};}}
function updateOverlayVisibility(){
 const rect=$('stage').getBoundingClientRect(),scale=meta?Math.min(rect.width/meta.width,rect.height/meta.height):1;
 for(const t of titles){const layer=titleLayers.get(t.id);if(layer){let a={opacity:0,x:0,y:0};try{if(t.enabled)a=SahlAnimation.sample(t.animation,cursor,SahlTitle.timing(total(),t.titleStart,t.titleDuration),meta?.width||1920,meta?.height||1080);}catch{}layer.canvas.style.opacity=String(a.opacity);layer.canvas.style.transform=`translate(-50%,-50%) translate(${a.x*scale}px,${a.y*scale}px)`;}}
 if(typeof updateCaptionPreview==='function')updateCaptionPreview();if(typeof refreshProxyNotice==='function')refreshProxyNotice();if(typeof updateMotionVisuals==='function')updateMotionVisuals();const g=TL.gain(clips,cursor);for(const el of [video,$('fallback'),$('still')])el.style.filter=`brightness(${g})`;if(typeof updateClipAudio==='function')updateClipAudio();else video.volume=g;layoutCanvas();
}
function precise(t){const ms=Math.round(Math.max(0,t)*1000);return seconds(ms/1000)+'.'+String(ms%1000).padStart(3,'0');}
function updateTime(t){cursor=Math.max(0,Math.min(total(),t));$('seek').value=cursor;$('clock').textContent=precise(cursor)+' / '+seconds(total());$('playhead').style.left=(total()?cursor/total()*100:0)+'%';updateOverlayVisibility();}
function updateButtons(){
 const has=!!meta&&clips.length>0,selected=selectedClip>=0&&selectedClip<clips.length,c=clips[selectedClip];
 for(const id of ['razor','split'])$(id).disabled=!has||busy;
 $('delete').disabled=busy||(selectionKind==='title'?!currentTitle():!selected);$('undo').disabled=!history.length||busy;$('redo').disabled=!future.length||busy;
 $('reset').disabled=!selected||busy;$('seek').disabled=!has||busy;$('play').disabled=!has||unsupported||busy;
 const titleOK=titles.every(t=>!t.enabled||(Number.isFinite(t.titleStart)&&t.titleStart>=0&&Number.isFinite(t.titleDuration)&&t.titleDuration>=.1));
 $('export').disabled=!has||busy||$('encoder').value==='gpu-auto'||!titleOK;$('transition').disabled=busy;
 const blocker=$('export-blocker');if(blocker){blocker.textContent=!has?'أضف فيديو أو صورة للشريط حتى تقدر تصدّر.':!titleOK?'راجع توقيت النصوص: البداية من 0 والمدة 0.1 ثانية أو أكثر.':$('encoder').value==='gpu-auto'?'جاري فحص كارت الشاشة. تقدر تختار المعالج CPU.':'';blocker.hidden=busy||!blocker.textContent;}

 if(typeof updateExportColor==='function')updateExportColor();if(typeof updateTimelineTools==='function')updateTimelineTools();
 $('back-frame').disabled=$('next-frame').disabled=!has||busy;
 $('transition-controls').hidden=!selected||selectedClip>=clips.length-1;if(selected)$('transition').value=c.transition||'none';
 $('image-controls').hidden=!selected||assetFor(c)?.kind!=='image';if(selected&&assetFor(c)?.kind==='image'&&document.activeElement!==$('image-duration'))$('image-duration').value=(TL.length(c)).toFixed(2);
 if(typeof refreshClipControls==='function')refreshClipControls();if(typeof refreshMotionControls==='function')refreshMotionControls();if(typeof updateTimelineTools==='function')updateTimelineTools();if(typeof refreshLayerControls==='function')refreshLayerControls();if(typeof refreshCaptionControls==='function')refreshCaptionControls();
 $('razor').classList.toggle('active',razor);$('razor').setAttribute('aria-pressed',String(razor));$('clips-track').classList.toggle('razor',razor);
}
function clipInfo(){const c=clips[selectedClip],a=assetFor(c);$('clip-info').textContent=c?`${a?.kind==='image'?'صورة':'قطعة'} ${selectedClip+1} · ${a?.name||''} · ${precise(TL.length(c))}`:'اختار قطعة للحذف أو التعديل';}
function renderTimeline(){
 clips=TL.ids(clips);if(typeof reconcileTimeline==='function')reconcileTimeline();
 const length=total();$('seek').max=length||1;$('timeline-surface').style.width=Math.pow(2,(Number($('zoom').value)-1)/10)*100+'%';$('clips-track').replaceChildren();$('ruler').replaceChildren();
 if(!clips.length){const empty=document.createElement('span');empty.className='empty-timeline';empty.textContent='اسحب صورة أو فيديو لهنا، أو اضغط + من المكتبة';$('clips-track').append(empty);}
 let offset=0;
 clips.forEach((clip,i)=>{
  const start=TL.startAt(clips,i),d=TL.length(clip),a=assetFor(clip);offset=start+d;
  const b=document.createElement('button');b.className='clip'+(timelineSelection.includes('clip:'+clip.id)||!timelineSelection.length&&i===selectedClip&&selectionKind==='clip'?' selected':'');b.style.left=start/length*100+'%';b.style.width=d/length*100+'%';b.disabled=busy;b.dataset.clipId=clip.id;b.dataset.index=i;b.dataset.offset=start;b.setAttribute('aria-label',`${a?.kind==='image'?'الصورة':'القطعة'} ${i+1}: ${a?.name} من ${clip.start.toFixed(2)} إلى ${clip.end.toFixed(2)}`);
  const strip=document.createElement('div');strip.className='filmstrip';const name=document.createElement('b');name.append(UIIcons.node(a?.kind==='image'?'image':'play'),document.createTextNode(a?.name||`قطعة ${i+1}`));const times=document.createElement('small');times.textContent=clip.freeze?'تجميد · '+precise(TL.length(clip)):`${seconds(clip.start)} → ${seconds(clip.end)}${TL.rate(clip)!==1?' · '+TL.rate(clip)+'×':''}`;
  const move=document.createElement('span');move.className='clip-reorder';move.draggable=true;move.title='اسحب لتغيير ترتيب القطعة';move.append(UIIcons.node('move'));move.ondragstart=e=>{e.stopPropagation();pause();e.dataTransfer.setData('application/x-sahl-clip',String(i));e.dataTransfer.effectAllowed='move';};b.append(strip,name,times,move);for(const edge of ['start','end']){const handle=document.createElement('span');handle.className='clip-edge';handle.dataset.edge=edge;handle.title=edge==='start'?'قص بداية القطعة':'قص نهاية القطعة';b.append(handle);}
  b.onclick=e=>{if(e.detail!==0||busy)return;pause();selectedClip=i;selectionKind='clip';timelineSelection=['clip:'+clip.id];seekTo(start+d/2);renderTimeline();};$('clips-track').append(b);
  if(i<clips.length-1){const join=document.createElement('button');join.className='join'+(clip.transition!=='none'?' on':'');join.style.left=(offset-TL.overlap(clips,i)/2)/length*100+'%';join.append(UIIcons.node('transition'));join.disabled=busy||mainTrack.locked;
join.setAttribute('aria-label',`انتقال بين القطعتين ${i+1} و${i+2}`);join.title='إضافة أو إزالة انتقال';join.onclick=e=>{e.stopPropagation();if(typeof mainEditBlocked==='function'&&mainEditBlocked())return;pause();checkpoint();selectedClip=i;selectionKind='clip';clips[i].transition=clips[i].transition==='none'?'fade':'none';renderTimeline();seekTo(Math.max(0,start+d-.2));status(clips[i].transition==='fade'?'أضفت تلاشي للصورة والصوت بين القطعتين.':'أزلت الانتقال.');};$('clips-track').append(join);const overlap=TL.overlap(clips,i);if(overlap){const band=document.createElement('span');band.className='crossfade-band';band.style.left=TL.startAt(clips,i+1)/length*100+'%';band.style.width=overlap/length*100+'%';band.setAttribute('aria-label','تداخل '+overlap.toFixed(3)+' ثانية');$('clips-track').append(band);}}
 });
 renderRuler();$('result-duration').textContent=seconds(length)+' · '+clips.length+' قطع';if(typeof renderTitleTracks==='function')renderTitleTracks();if(typeof renderAudioTracks==='function')renderAudioTracks();if(typeof renderLayerTracks==='function')renderLayerTracks();if(typeof renderCaptionTrack==='function')renderCaptionTrack();clipInfo();updateButtons();updateTime(Math.min(cursor,length));scheduleFilmstrip();
}
function renderRuler(){const width=$('timeline-surface').clientWidth||1,viewport=$('timeline-scroll'),ticks=Math.max(8,Math.ceil(width/110)),length=total();const first=Math.max(0,Math.floor(viewport.scrollLeft/width*ticks)-1),last=Math.min(ticks,Math.ceil((viewport.scrollLeft+viewport.clientWidth)/width*ticks)+1);$('ruler').replaceChildren();if(!length)return;for(let i=first;i<=last;i++){const mark=document.createElement('span');mark.style.left=i/ticks*100+'%';mark.textContent=length/ticks<1?precise(length*i/ticks):seconds(length*i/ticks);if(i===0)mark.style.transform='none';if(i===ticks)mark.style.transform='translateX(-100%)';$('ruler').append(mark);}}
function scheduleFilmstrip(){clearTimeout(filmTimer);filmTimer=setTimeout(paintFilmstrip,80);}
function paintFilmstrip(){
 if(!meta||!clips.length){thumbnailQueue.retain('timeline',new Set());return;}const viewport=$('timeline-scroll'),surface=$('timeline-surface'),visibleKeys=new Set();
 document.querySelectorAll('.clip').forEach(button=>{const c=clips[Number(button.dataset.index)],a=assetFor(c);if(!a)return;const strip=button.querySelector('.filmstrip');strip.replaceChildren();const width=button.clientWidth,left=Number(button.dataset.offset)/total()*surface.clientWidth,count=Math.max(1,Math.ceil(width/112)),cell=width/count;
 const first=Math.max(0,Math.floor((viewport.scrollLeft-left-112)/cell)),last=Math.min(count-1,Math.ceil((viewport.scrollLeft+viewport.clientWidth-left+112)/cell));
 for(let j=first;j<=last;j++){const time=a.kind==='image'?0:TL.sourceTime(c,(j+.5)/count*TL.length(c)),key=a.id+':'+time.toFixed(3),tile=document.createElement('span');tile.className='film-frame pending';tile.style.left=j/count*100+'%';tile.style.width=100/count+'%';tile.dataset.sourceTime=time.toFixed(3);tile.title='لقطة من '+precise(time);strip.append(tile);
 visibleKeys.add(key);
 thumbnailQueue.request(key,()=>a.kind==='image'?a.url:window.sahl.thumbnail(a.id,time)).then(src=>{if(!tile.isConnected)return;tile.className='film-frame '+(src?'loaded':'error');if(src){const img=document.createElement('img');img.alt='لقطة '+precise(time);img.src=src;tile.append(img);}}).catch(()=>{tile.className='film-frame error';});}
 });
 thumbnailQueue.retain('timeline',visibleKeys);
}
$('timeline-scroll').addEventListener('scroll',()=>{renderRuler();scheduleFilmstrip();},{passive:true});
async function frame(a,t,token=previewLoad.start(a.name)){
 const serial=++frameSerial;
 try{const src=await window.sahl.frame(a.id,t);if(serial!==frameSerial||!unsupported||sourceId!==a.id)return;
  if(!src)throw new Error('تعذّر تجهيز اللقطة. جرّب موضع آخر أو أعد المحاولة.');
  $('fallback').src=src;await $('fallback').decode();if(serial!==frameSerial||sourceId!==a.id)return;
  $('fallback').hidden=false;previewLoad.ready(token);
 }catch(e){if(serial===frameSerial&&sourceId===a.id)previewLoad.fail(token,e.message);}
}
function showSource(a){
 if(!a)return;unsupported=unsupportedAssets.has(a.id);$('empty').hidden=true;$('filename').textContent=a.name;
 if(sourceId!==a.id||video.getAttribute('src')!==(typeof previewURL==='function'?previewURL(a):a.url)&&a.kind==='video'){video.pause();sourceId=a.id;$('fallback').hidden=true;if(a.kind==='video'){video.src=typeof previewURL==='function'?previewURL(a):a.url;video.load();}else{$('still').src=a.url;video.removeAttribute('src');video.load();}}
 video.hidden=a.kind==='image'||unsupported;$('still').hidden=a.kind!=='image';if(!unsupported)$('fallback').hidden=true;$('preview-note').textContent=a.kind==='image'?'معاينة الصورة':unsupported?'معاينة لقطات':'معاينة ترتيب القطع';if(typeof refreshProxyNotice==='function')refreshProxyNotice();layoutCanvas();updateButtons();
}
function seekTo(t){if(typeof motionSeek==='function')return motionSeek(t);
 previewAbort?.abort();previewAbort=null;clearTimeout(frameTimer);frameSerial++;updateTime(t);const at=TL.locate(clips,cursor);
 if(!at){video.hidden=true;$('still').hidden=$('fallback').hidden=true;$('empty').hidden=false;previewLoad.cancel();return;}
 playIndex=at.index;const a=assetFor(clips[at.index]);showSource(a);const token=previewLoad.start(a.name);
 if(a.kind==='image'){$('still').decode().then(()=>previewLoad.ready(token),()=>previewLoad.fail(token,'تعذّر عرض الصورة. جرّب إعادة المحاولة.'));return;}
 if(unsupported){frameTimer=setTimeout(()=>frame(a,Math.min(a.duration-.001,at.source),token),100);return;}
 const controller=new AbortController();previewAbort=controller;
 SahlPlayback.seekReady(video,Math.min(a.duration-.001,at.source),controller.signal).then(()=>{if(!controller.signal.aborted)previewLoad.ready(token);}).catch(e=>{if(!controller.signal.aborted&&!unsupported)previewLoad.fail(token,e.message);}).finally(()=>{if(previewAbort===controller)previewAbort=null;});
}
function splitHere(){if(selectionKind==='caption')return splitCaption();if(selectionKind==='layer')return status('قص بداية ونهاية الطبقة من خصائصها.');if(selectionKind==='audio'&&typeof splitAudioHere==='function')return splitAudioHere();if(!clips.length||busy||typeof mainEditBlocked==='function'&&mainEditBlocked())return;if(clips.length>=64)return status('وصلت للحد الحالي: 64 قطعة.',true);const result=TL.split(clips,cursor,Math.max(.1,2/fps(meta.fps)));if(!result)return status('قسّم داخل القطعة بعيداً عن أطرافها ومنطقة التداخل.');if(typeof audioLimitAllows==='function'&&!audioLimitAllows(result.clips))return;pause();checkpoint();clips=result.clips;selectedClip=result.index;selectionKind='clip';timelineSelection=['clip:'+clips[selectedClip].id];renderTimeline();status('انقسمت القطعة. اختار الجزء اللي تريد تحذفه أو أدخل صورة عند المؤشر.');}
function deleteSelected(){if(typeof deleteTimelineSelection==='function')return deleteTimelineSelection();if(selectionKind==='title'){removeTitle();return;}if(busy||selectedClip<0||!clips[selectedClip])return;pause();checkpoint();const at=TL.startAt(clips,selectedClip);clips=TL.remove(clips,selectedClip);selectedClip=Math.min(selectedClip,clips.length-1);cursor=Math.min(at,total());renderTimeline();seekTo(cursor);status('حذفت القطعة من الترتيب. تكدر ترجعها بزر التراجع.');}
function undo(){if(!history.length||busy)return;future.push(snapshot());restore(history.pop());status('تم التراجع.');}
function redo(){if(!future.length||busy)return;history.push(snapshot());restore(future.pop());status('أعدت الخطوة.');}
async function playSegment(index,local,controller){return startMotion(TL.startAt(clips,index)+local,controller);}
function tick(){return tickMotion();}
$('play').onclick=async()=>{
 if(playing||playbackAbort){pause();return;}if(!meta||busy||unsupported||!clips.length)return;if(cursor>=total()-.5/fps(meta.fps))updateTime(0);
 cancelAnimationFrame(seekRaf);seekRaf=null;previewAbort?.abort();const at=TL.locate(clips,cursor),controller=new AbortController();playbackAbort=controller;setPlayIcon(true);
 try{await playSegment(at.index,at.local,controller);if(controller.signal.aborted)return;playing=true;raf=requestAnimationFrame(tick);}catch(e){if(!controller.signal.aborted)status(e.message,true);}
};
video.addEventListener('error',()=>{const a=assets.find(a=>a.id===sourceId);if(!a||a.kind!=='video'||!video.getAttribute('src'))return;if(typeof proxyFailed==='function'&&proxyFailed(a.id))return;unsupportedAssets.add(a.id);pause();unsupported=true;video.hidden=true;$('preview-note').textContent='معاينة لقطات';frame(a,TL.locate(clips,cursor)?.source||0);updateButtons();status('هذا الترميز يُعرض كلقطات. القص والانتقالات تعمل بالتصدير.');});
let bufferingToken=null;
video.addEventListener('waiting',()=>{if(typeof pauseTrackAudio==='function')pauseTrackAudio();if(playing&&!segmentPending)bufferingToken=previewLoad.start();});
video.addEventListener('playing',()=>{if(bufferingToken!==null){previewLoad.ready(bufferingToken);bufferingToken=null;}});
function renderAssets(){
 $('asset-list').replaceChildren();$('media-empty').hidden=assets.length>0;
 const query=($('media-search')?.value||'').trim().toLocaleLowerCase(),filter=document.querySelector('[data-media-filter][aria-pressed=true]')?.dataset.mediaFilter||'all';
 const visible=assets.filter(a=>(filter==='all'||a.kind===filter)&&a.name.toLocaleLowerCase().includes(query));
 if($('media-count'))$('media-count').textContent=String(assets.length);
 if($('media-no-results'))$('media-no-results').hidden=!assets.length||visible.length>0;
 const libraryKeys=new Set();
 for(const a of visible){const card=document.createElement('div');card.className='asset-card';card.draggable=true;card.dataset.assetId=a.id;card.ondragstart=e=>{if(busy)return e.preventDefault();e.dataTransfer.setData('application/x-sahl-asset',a.id);e.dataTransfer.effectAllowed='copy';};
 const thumb=document.createElement('div');thumb.className='media-thumb';const img=document.createElement('img');img.alt=a.name;thumb.append(img);const label=document.createElement('span');label.textContent=a.kind==='image'?'صورة · 5 ثواني':seconds(a.duration);thumb.append(label);
 if(a.kind==='audio'){img.remove();const music=document.createElement('span');music.className='audio-library-icon';music.textContent='♫';thumb.append(music);}else if(a.kind==='image')img.src=a.url;else{const key='library:'+a.id;libraryKeys.add(key);thumbnailQueue.request(key,()=>window.sahl.thumbnail(a.id,Math.min(1,a.duration/2)),'library').then(src=>{if(src&&img.isConnected)img.src=src;});}
 const name=document.createElement('strong');name.textContent=a.name;name.title=a.name;const info=document.createElement('small');info.textContent=a.kind==='audio'?'صوت · '+seconds(a.duration):`${a.width} × ${a.height}${a.kind==='video'?' · '+fps(a.fps).toFixed(2)+' fps':''}`;
 const add=document.createElement('button');add.className='asset-add';add.append(UIIcons.node('plus'));add.setAttribute('aria-label','أضف '+a.name+' عند المؤشر');add.title='إضافة عند المؤشر';add.onclick=e=>{e.stopPropagation();if(e.detail<=1)insertAsset(a.id,cursor);};add.disabled=busy;card.ondblclick=e=>{if(!e.target.closest('button'))insertAsset(a.id,cursor);};card.append(thumb,name,info,add);if(a.kind!=='audio'){const layer=document.createElement('button');layer.className='asset-layer';layer.textContent='＋ طبقة';layer.title='أضف '+a.name+' فوق الفيديو';layer.disabled=busy;layer.onclick=e=>{e.stopPropagation();insertLayer(a.id);};card.append(layer);}if(a.kind==='video'){const proxy=document.createElement('button');proxy.className='asset-proxy';proxy.textContent='معاينة';proxy.title='خيارات المعاينة الخفيفة لـ '+a.name;proxy.disabled=busy;proxy.onclick=e=>{e.stopPropagation();openProxy(a.id);};card.append(proxy);}$('asset-list').append(card);
 }
 thumbnailQueue.retain('library',libraryKeys);
}
function insertAsset(id,time=cursor,record=true){
 if(busy)return;const a=assets.find(a=>a.id===id);if(!a)return;if(a.kind==='audio')return insertAudioAsset(id,time,record);if(!TL.canInsert(clips,time))return status('حرّك المؤشر بعيداً عن التداخل وأطرافه قبل إدخال قطعة.',true);if(typeof mainEditBlocked==='function'&&mainEditBlocked())return;if(clips.length>=63)return status('الحد الحالي 64 قطعة. احذف قطعة أولاً.',true);const inserted={id:TL.uid(),assetId:a.id,kind:a.kind,start:0,end:a.kind==='image'?5:a.duration,transition:'none'},result=TL.insert(clips,inserted,time);if(typeof audioLimitAllows==='function'&&!audioLimitAllows(result.clips))return;pause();if(record)checkpoint();
 if(!meta){const firstVideo=assets.find(a=>a.kind==='video'),base=firstVideo||a;meta={width:base.width,height:base.height,fps:base.kind==='video'?base.fps:'30'};sourceMeta={...meta};canvasMode='source';$('resolution').value='source';$('badge').textContent=`${meta.width} × ${meta.height}`;draw();}
 clips=result.clips;selectedClip=result.index;selectionKind='clip';timelineSelection=['clip:'+clips[selectedClip].id];cursor=TL.startAt(clips,selectedClip);renderTimeline();seekTo(cursor+(a.kind==='image'?Math.min(.4,(clips[selectedClip].end-clips[selectedClip].start)/2):0));updateExportInfo();changed();status('أضفت '+(a.kind==='image'?'الصورة. غيّر مدتها من أسفل الشريط.':'الفيديو عند المؤشر.'));
}
let importing=false;
async function importResult(task,{insert=false,time=cursor}={}){
 if(importing||busy)return;importing=true;showImportProgress();for(const id of ['choose','choose-image','choose-audio','choose-empty'])$(id).disabled=true;try{const result=await task();if(!result)return;if(result.error)return status(result.error,true);const empty=!assets.length,hadVideo=assets.some(a=>a.kind==='video');for(const a of result.assets)if(!assets.some(x=>x.id===a.id))assets.push(a);if(!hadVideo&&meta&&canvasMode==='source'){const firstVideo=assets.find(a=>a.kind==='video');if(firstVideo){meta={width:firstVideo.width,height:firstVideo.height,fps:firstVideo.fps};sourceMeta={...meta};$('badge').textContent=`${meta.width} × ${meta.height}`;draw();updateExportInfo();}}renderAssets();
 if(result.assets.length){changed();if(empty||insert){checkpoint();let next=time;for(const a of [...result.assets].sort((a,b)=>(a.kind==='audio')-(b.kind==='audio'))){insertAsset(a.id,next,false);if(a.kind!=='audio')next=TL.startAt(clips,selectedClip)+TL.length(clips[selectedClip]);}}else status('استوردت الملفات. اسحبها للشريط، أو اضغط + حتى تضيفها عند المؤشر.');}
 if(result.errors?.length)status(result.errors.join(' • '),true);
 }catch(e){status(e.message,true);}finally{importing=false;$('import-state').hidden=true;for(const id of ['choose','choose-image','choose-audio','choose-empty'])$(id).disabled=busy;}
}
$('choose').onclick=$('choose-empty').onclick=()=>importResult(()=>window.sahl.choose());$('choose-image').onclick=()=>importResult(()=>window.sahl.choose('image'),{insert:true});
$('seek').oninput=()=>{pause();seekTo(Number($('seek').value));};
function timeAtPointer(e){const rect=$('ruler').getBoundingClientRect(),t=Math.max(0,Math.min(total(),(e.clientX-rect.left)/rect.width*total()));return Math.min(total(),Math.round(t*fps(meta?.fps))/fps(meta?.fps));}
function applyScrub(e){const time=timeAtPointer(e);updateTime(time);pendingSeek=time;if(!seekRaf)seekRaf=requestAnimationFrame(()=>{seekRaf=null;seekTo(pendingSeek);});}
$('timeline-surface').onpointerdown=e=>{
 if(!meta||busy||!clips.length||e.button!==0||e.target.closest('.join,.title-chip,.clip-reorder,.clip-edge,.audio-chip,.audio-row,.visual-chip,.visual-row,.caption-chip,.caption-row,.marker-button,.track-heading'))return;e.preventDefault();pause();const time=timeAtPointer(e),at=TL.locate(clips,time);if(at)selectedClip=at.index;selectionKind='clip';timelineSelection=at?['clip:'+clips[at.index].id]:[];
 document.querySelectorAll('.clip').forEach((b,i)=>b.classList.toggle('selected',i===selectedClip));updateButtons();seekTo(time);clipInfo();$('timeline-scroll').focus({preventScroll:true});
 if(razor&&e.target.closest('.clip')){splitHere();return;}scrubDrag=e.pointerId;$('timeline-surface').setPointerCapture(e.pointerId);
};
$('timeline-surface').onpointermove=e=>{if(scrubDrag===e.pointerId)applyScrub(e);};$('timeline-surface').onpointerup=e=>{if(scrubDrag!==e.pointerId)return;cancelAnimationFrame(seekRaf);seekRaf=null;seekTo(timeAtPointer(e));scrubDrag=null;$('timeline-surface').releasePointerCapture(e.pointerId);};$('timeline-surface').onpointercancel=()=>{scrubDrag=null;cancelAnimationFrame(seekRaf);seekRaf=null;};
$('timeline-scroll').tabIndex=0;
$('razor').onclick=()=>{razor=!razor;updateButtons();status(razor?'المقص شغال: اضغط داخل القطعة حتى تنقسم.':'وضع الاختيار: اختار قطعة حتى تحذفها أو تضيف انتقال بعدها.');};
$('split').onclick=splitHere;$('delete').onclick=deleteSelected;$('undo').onclick=undo;$('redo').onclick=redo;
$('reset').onclick=()=>{if(!clips[selectedClip]||busy||typeof mainEditBlocked==='function'&&mainEditBlocked())return;pause();checkpoint();const c=clips[selectedClip],a=assetFor(c);if(c.freeze){c.freeze.duration=2;renderTimeline();seekTo(cursor);return;}c.start=0;c.end=a.kind==='image'?5:a.duration;renderTimeline();seekTo(cursor);status('رجّعت مدة الملف المختار كاملة.');};
$('zoom').oninput=()=>{renderTimeline();if(total())$('timeline-scroll').scrollLeft=Math.max(0,cursor/total()*$('timeline-surface').clientWidth-$('timeline-scroll').clientWidth/2);renderRuler();scheduleFilmstrip();};
$('transition').onchange=()=>{if(typeof changeTransition==='function')return changeTransition();if(selectedClip<0||selectedClip>=clips.length-1||busy||typeof mainEditBlocked==='function'&&mainEditBlocked())return;pause();checkpoint();clips[selectedClip].transition=$('transition').value;renderTimeline();status('تم تحديث الانتقال.');};
$('image-duration').onchange=()=>{const c=clips[selectedClip],d=Number($('image-duration').value);if(busy||assetFor(c)?.kind!=='image'||typeof mainEditBlocked==='function'&&mainEditBlocked())return;if(!Number.isFinite(d)||d<.1||d>86400)return status('اكتب مدة بين 0.1 و86400 ثانية.',true);pause();checkpoint();c.start=0;c.end=d;renderTimeline();seekTo(cursor);};
for(const el of [document.querySelector('.media-panel'),$('timeline-scroll'),$('stage')]){
 el.ondragover=e=>{if(busy)return;e.preventDefault();el.classList.add('drop-target');e.dataTransfer.dropEffect=e.dataTransfer.types.includes('application/x-sahl-clip')?'move':'copy';};
 el.ondragleave=e=>{if(!el.contains(e.relatedTarget))el.classList.remove('drop-target');};
 el.ondrop=e=>{e.preventDefault();el.classList.remove('drop-target');if(busy)return;pause();const timelineDrop=el===$('timeline-scroll'),time=timelineDrop?timeAtPointer(e):cursor,id=e.dataTransfer.getData('application/x-sahl-asset'),index=e.dataTransfer.getData('application/x-sahl-clip');
 if(id){if(el!==document.querySelector('.media-panel'))insertAsset(id,time);return;}
 if(index!==''&&timelineDrop&&typeof moveMainSelection==='function'){moveMainSelection(Number(index),time);return;}
 if(index!==''&&timelineDrop){const from=Number(index),c=clips[from];if(!c)return;checkpoint();let at=TL.locate(clips,time),to=at?(at.local>(clips[at.index].end-clips[at.index].start)/2?at.index+1:at.index):0;clips=TL.remove(clips,from);if(to>from)to--;clips.splice(to,0,{...c,transition:'none'});if(clips.length)clips[clips.length-1].transition='none';selectedClip=to;selectionKind='clip';renderTimeline();seekTo(TL.startAt(clips,to));return;}
 const files=Array.from(e.dataTransfer.files);if(files.length)importResult(()=>window.sahl.importFiles(files),{insert:el!==document.querySelector('.media-panel'),time});
 };
}
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
 if(busy||e.isComposing||document.querySelector('dialog[open]'))return;
 const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
 if(mod&&!e.altKey){
  if(key==='s'){e.preventDefault();saveCurrentProject(e.shiftKey);return;}
  if(key==='o'){e.preventDefault();openSavedProject();return;}
  if(key==='i'){e.preventDefault();$('choose').click();return;}
  if(key==='e'&&e.shiftKey){e.preventDefault();openExport();return;}
 }
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
 if(typeof timelineShortcut==='function'&&timelineShortcut(e))return;
 if(mod&&!e.altKey&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if(mod&&!e.altKey&&key==='y'){e.preventDefault();redo();return;}
 if(mod||e.altKey)return;
 // Let focused controls keep their native Space and arrow-key behavior.
 if(e.target.closest('button,[role=tab],[role=separator]')&&['Space','ArrowLeft','ArrowRight','Home','End'].includes(e.code))return;
 if(['Delete','Backspace'].includes(e.key)){e.preventDefault();deleteSelected();}
 else if(key==='s'){e.preventDefault();splitHere();}
 else if(key==='c'){e.preventDefault();$('razor').click();}
 else if(key==='v'){e.preventDefault();razor=false;updateButtons();}
 else if(key==='f'){e.preventDefault();$('fit-timeline')?.click();}
 else if(key==='?'){e.preventDefault();$('open-shortcuts')?.click();}
 else if(e.code==='Space'&&clips.length&&!unsupported){e.preventDefault();$('play').click();}
 else if(meta&&clips.length&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
  e.preventDefault();pause();seekTo(e.key==='Home'?0:e.key==='End'?total():cursor+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps(meta.fps)));
 }
});
let renderStarted=false,cancelRequested=false;
function updateCancelButton(){const button=$('cancel');button.disabled=!renderStarted||cancelRequested;UIIcons.button(button,'stop',cancelRequested?'جارٍ إلغاء التصدير…':'إلغاء التصدير');}
async function cancelRender(){if(typeof captionExportAbort!=='undefined'&&captionExportAbort){captionExportAbort.abort();$('progress-text').textContent='جارٍ إلغاء تجهيز الترجمة…';return;}if(!busy||!renderStarted||cancelRequested)return;cancelRequested=true;updateCancelButton();$('progress-text').textContent='جارٍ إلغاء التصدير…';status('جارٍ إيقاف المعالجة…');try{const result=await window.sahl.cancel();if(result?.error){cancelRequested=false;updateCancelButton();status(result.error,true);}else if(result?.notRunning&&busy){setBusy(false);status('المعالجة متوقفة. يمكنك متابعة التحرير.');}}catch(e){cancelRequested=false;updateCancelButton();status('تعذّر الإلغاء: '+e.message,true);}}
function setBusy(value){busy=value;refreshBackgroundWork();renderStarted=false;cancelRequested=false;$('render-actions').hidden=!value;updateCancelButton();for(const id of [...titleFields,'title-start-here','preview-title','quality','encoder','resolution','save-template','close-export','add-text','duplicate-text','remove-text','text-list','layout-name','saved-layout','apply-layout','choose','choose-image','choose-audio','open-project','save-project','save-project-as','image-duration','play-title-animation'])$(id).disabled=value;document.querySelectorAll('.template').forEach(b=>b.disabled=value);$('progress-wrap').hidden=!value;$('export').textContent=value?'جاري تجهيز الفيديو…':'تصدير الفيديو ↗';renderTimeline();renderAssets();renderTitleList();$('apply-layout').disabled=value||!$('saved-layout').value;setExportPresentation(value,value?exportSnapshot():null);}
$('export').onclick=async()=>{
 if(!meta||busy||!clips.length)return;try{if(typeof selectedExportRange==='function')selectedExportRange();}catch(e){return status(e.message,true);}resetExportTiming();try{await ensureTextFonts([...titles,captions.style]);}catch(e){return status('تعذّر تحميل الخط المضمّن: '+e.message,true);}if(busy)return;pause();commitTitle();const overlays=titles.filter(t=>t.enabled&&(t.title.trim()||t.subtitle.trim())).map(t=>{const out=document.createElement('canvas');drawTitle(out,t);return {png:out.toDataURL('image/png'),start:t.titleStart,duration:t.titleDuration,animation:t.animation};});
 setBusy(true);captionExportAbort=new AbortController();renderStarted=true;updateCancelButton();let captionFrames;try{captionFrames=await buildCaptionFrames(captionExportAbort.signal);}catch(e){setBusy(false);status(e.message==='canceled'?'ألغيت تجهيز الترجمة؛ تعديلاتك محفوظة بالمشروع.':e.message,e.message!=='canceled');return;}finally{captionExportAbort=null;renderStarted=false;updateCancelButton();}
 const options={meta,range:typeof exportRangeRequest==='function'?exportRangeRequest():null,captionFrames,layers:structuredClone(layers),audioTracks:structuredClone(audioTracks),mainTrack:{...mainTrack},clips:clips.map(c=>({...c})),encoder:$('encoder').value,quality:$('quality').value,resolution:$('resolution').value,titles:overlays};$('progress').value=0;$('progress-text').textContent='اختر موقع حفظ الفيديو…';$('show-output').hidden=true;
 try{const result=await window.sahl.export(options);if(result.error){setBusy(false);status(result.error,true);}else if(result.canceled){setBusy(false);status('تم إلغاء اختيار مكان الحفظ.');}else{status('جارٍ معالجة المقاطع والصور والنصوص.');$('progress-text').textContent='جارٍ التصدير… 0%';}}catch(e){setBusy(false);status(e.message,true);}
};
$('cancel').onclick=cancelRender;$('show-output').onclick=()=>window.sahl.showOutput();window.sahl.onProgress(p=>{if(!busy)return;renderStarted=true;updateCancelButton();if(cancelRequested)return;const percent=typeof p==='number'?p:p.percent;showExportTiming(p);$('progress').value=percent;$('progress-text').textContent=(p.phase==='finalizing'?'جارٍ حفظ الفيديو… ':'جارٍ التصدير… ')+Math.floor(percent)+'%';});window.sahl.onComplete(result=>{showExportTiming(result.timing);setBusy(false);if(result.error)status(result.error,true);else if(result.canceled)status('تم إلغاء التصدير دون فقدان تعديلات المشروع. يمكنك تعديل الإعدادات والمحاولة مجدداً.');else{$('show-output').hidden=false;status('تم حفظ الفيديو بنجاح ✓ '+result.path);}});
window.addEventListener('resize',()=>{layoutCanvas();renderRuler();scheduleFilmstrip();});renderTimeline();

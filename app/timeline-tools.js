const AT=SahlAudioTracks;
let activeAudioTrack=null,timelineClipboard=null,markerEditing=null,editDrag=null,marquee=null,waveGeneration=0;
const waveformCache=new Map();
function selectedAudioEntry(){for(const track of audioTracks){const clip=track.clips.find(c=>c.id===selectedAudio);if(clip)return {track,clip};}return null;}
function mainEditBlocked(notify=true){const blocked=mainTrack.locked||audioTracks.some(t=>t.locked&&t.clips.some(c=>c.link))||titlesLocked&&titles.some(t=>t.link);if(blocked&&notify)status('افتح قفل الفيديو والمسارات المرتبطة قبل تعديل القطع.',true);return blocked;}
function audioLimitAllows(next){if(AT.reconcile(clips,next,audioTracks,titles).tracks.reduce((n,t)=>n+t.clips.length,0)<=64)return true;status('التقسيم يتجاوز حد 64 قطعة صوت مرتبطة؛ احذف قطعة أو فك الربط أولاً.',true);return false;}
function reconcileTimeline(){
  if(lastMainClips&&JSON.stringify(lastMainClips)!==JSON.stringify(clips)){const result=AT.reconcile(lastMainClips,clips,audioTracks,titles);audioTracks=result.tracks;titles=result.titles;fillTitleFields();if(!titles.some(t=>t.id===selectedTitle))selectedTitle=titles[0]?.id||null;}
  for(const c of clips)delete c.splitFrom;lastMainClips=structuredClone(clips);
  const valid=new Set([...clips.map(c=>'clip:'+c.id),...audioTracks.flatMap(t=>t.clips.map(c=>'audio:'+c.id)),...titles.map(t=>'title:'+t.id)]);timelineSelection=timelineSelection.filter(id=>valid.has(id));
}
function resetTimelineClipboard(){timelineClipboard=null;waveGeneration++;waveformCache.clear();activeAudioTrack=null;}
function revealAudioSelection(){if(selectionKind!=='audio')return;const element=[...document.querySelectorAll('.audio-chip')].find(e=>e.dataset.audioId===selectedAudio),scroll=$('timeline-scroll');if(!element)return;const box=element.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();if(box.bottom>viewport.bottom-5)scroll.scrollTop+=box.bottom-viewport.bottom+5;else if(box.top<viewport.top)scroll.scrollTop+=box.top-viewport.top;}
function refreshAfterEdit(){renderTimeline();draw();fillTitleFields();renderTitleList();renderAudioTracks();seekTo(Math.min(cursor,total()));changed();revealAudioSelection();}
function addTrack(record=true){if(busy||audioTracks.length>=8){status('الحد الحالي 8 مسارات صوت.',true);return null;}if(record){pause();checkpoint();}const track={id:AT.uid(),name:'صوت '+(audioTracks.length+1),muted:false,solo:false,locked:false,clips:[]};audioTracks.push(track);activeAudioTrack=track.id;selectionKind='audio';if(record)refreshAfterEdit();return track;}
function insertAudioAsset(id,time=cursor,record=true){
  if(busy)return;const asset=assets.find(a=>a.id===id);if(!asset?.audio)return status('هذا الملف لا يحتوي صوتاً.',true);if(!clips.length)return status('أضف فيديو أو صورة للشريط أولاً، بعدها أضف الصوت.');
  if(audioTracks.reduce((n,t)=>n+t.clips.length,0)>=64)return status('الحد الحالي 64 قطعة صوت.',true);
  let track=audioTracks.find(t=>t.id===activeAudioTrack)||audioTracks[0];if(track?.locked)return status('افتح قفل مسار الصوت أولاً.',true);if(!track&&audioTracks.length>=8)return;
  pause();if(record)checkpoint();track||=addTrack(false);const c={id:AT.uid(),assetId:id,start:0,end:asset.duration,at:Math.max(0,time),audio:SettingsAudio()};track.clips.push(c);selectAudio(c.id);refreshAfterEdit();status('أضفت الصوت بمسار مستقل. اسحبه أو قص أطرافه على الشريط.');
}
function SettingsAudio(value){return SahlClipSettings.audio(value);}
function selectAudio(id,add=false){const entry=audioTracks.flatMap(t=>t.clips.map(c=>({track:t,clip:c}))).find(x=>x.clip.id===id);if(!entry)return;selectedAudio=id;activeAudioTrack=entry.track.id;selectionKind='audio';if(!add)timelineSelection=['audio:'+id];refreshClipControls();}
function extractSelectedAudio(){
  if(busy||mainEditBlocked())return;const selected=selectedKeys(),chosen=clips.filter(c=>selected.includes('clip:'+c.id));if(!chosen.length&&clips[selectedClip])chosen.push(clips[selectedClip]);
  if(!chosen.length||chosen.some(c=>!assetFor(c)?.audio))return status('اختار قطع فيديو تحتوي صوتاً.',true);
  if(audioTracks.length>=8||audioTracks.reduce((n,t)=>n+t.clips.length,0)+chosen.length>64)return status('وصلت إلى حد مسارات أو قطع الصوت.',true);
  pause();checkpoint();const track=addTrack(false),positions=AT.offsets(clips);track.name='صوت الفيديو';
  for(const c of chosen){const audio=SettingsAudio(c.audio),copy={id:AT.uid(),assetId:c.assetId,start:c.start,end:c.end,at:positions.get(c.id).at,audio,link:{clipId:c.id,offset:0}};track.clips.push(copy);c.audio={...audio,muted:true};}
  selectAudio(track.clips[0].id);timelineSelection=track.clips.map(c=>'audio:'+c.id);refreshAfterEdit();status('فصلت الصوت وربطته بالفيديو وكتمت صوت القطع الأصلية حتى ما يتكرر.');
}
function selectedKeys(){if(timelineSelection.length)return [...timelineSelection];if(selectionKind==='audio'&&selectedAudio)return ['audio:'+selectedAudio];if(selectionKind==='title'&&selectedTitle)return ['title:'+selectedTitle];return clips[selectedClip]?['clip:'+clips[selectedClip].id]:[];}
function lockedSelection(keys){return keys.some(key=>key.startsWith('clip:')?mainEditBlocked(false):key.startsWith('title:')?titlesLocked:audioTracks.some(t=>t.locked&&t.clips.some(c=>'audio:'+c.id===key)));}
function deleteTimelineSelection(){
  if(busy)return;const keys=selectedKeys();if(!keys.length)return;if(lockedSelection(keys))return status('التحديد يحتوي عناصر مقفلة. افتح القفل أولاً.',true);
  pause();checkpoint();const remove=new Set(keys),ripple=$('audio-delete-mode').value==='ripple';
  for(const track of audioTracks){const removed=track.clips.filter(c=>remove.has('audio:'+c.id)).map(c=>[c.at,c.at+c.end-c.start]).sort((a,b)=>a[0]-b[0]),ranges=[];
    for(const range of removed){const last=ranges.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else ranges.push([...range]);}
    track.clips=track.clips.filter(c=>!remove.has('audio:'+c.id));if(ripple)for(const c of track.clips){c.at=AT.rippleTime(c.at,ranges);if(c.link){const parent=AT.offsets(clips).get(c.link.clipId);if(c.at<parent.at)delete c.link;else c.link.offset=c.at-parent.at;}}
  }
  for(let i=clips.length-1;i>=0;i--)if(remove.has('clip:'+clips[i].id))clips=TL.remove(clips,i);
  titles=titles.filter(t=>!remove.has('title:'+t.id));selectedClip=Math.min(selectedClip,clips.length-1);if(!titles.some(t=>t.id===selectedTitle))selectedTitle=titles[0]?.id||null;timelineSelection=[];selectedAudio=null;refreshAfterEdit();status('حذفت التحديد. التراجع يرجّع العملية كاملة.');
}
function copyTimelineSelection(){
  const keys=selectedKeys(),positions=AT.offsets(clips),main=clips.filter(c=>keys.includes('clip:'+c.id)),ids=new Set(main.map(c=>c.id));
  const audio=audioTracks.flatMap(t=>t.clips.filter(c=>keys.includes('audio:'+c.id)||ids.has(c.link?.clipId)).map(c=>({trackId:t.id,trackName:t.name,clip:structuredClone(c)})));
  const text=titles.filter(t=>keys.includes('title:'+t.id)||ids.has(t.link?.clipId)),starts=[...main.map(c=>positions.get(c.id).at),...audio.map(x=>x.clip.at),...text.map(t=>t.titleStart)];if(!starts.length)return;
  timelineClipboard={main:structuredClone(main),audio,text:structuredClone(text),start:Math.min(...starts),end:Math.max(...main.map(c=>positions.get(c.id).at+c.end-c.start),...audio.map(x=>x.clip.at+x.clip.end-x.clip.start),...text.map(t=>t.titleStart+t.titleDuration))};
  updateTimelineTools();status('نسخت التحديد داخل المشروع، مع العناصر المرتبطة به.');
}
function pasteTimelineSelection(at=cursor){
  const copy=timelineClipboard;if(!copy||busy)return;const destinationIds=new Set(copy.audio.map(x=>x.trackId));
  if(copy.main.length&&mainEditBlocked()||copy.text.length&&titlesLocked||audioTracks.some(t=>destinationIds.has(t.id)&&t.locked))return status('افتح قفل المسارات المستهدفة قبل اللصق.',true);
  const missing=[...destinationIds].filter(id=>!audioTracks.some(t=>t.id===id));
  if(copy.main.length&&clips.length+copy.main.length>64||titles.length+copy.text.length>24||audioTracks.length+missing.length>8||audioTracks.reduce((n,t)=>n+t.clips.length,0)+copy.audio.length>64)return status('اللصق يتجاوز حد القطع أو المسارات أو النصوص.',true);
  if(!clips.length&&!copy.main.length)return status('أضف فيديو أو صورة أولاً.');const map=new Map(),added=[],base=copy.main.length?Math.min(Math.max(0,at),total()):Math.max(0,at);
  let insertTime=base,next=structuredClone(clips);for(const original of copy.main){const c=structuredClone(original);c.id=AT.uid();map.set(original.id,c.id);const result=TL.insert(next,c,insertTime);next=result.clips;insertTime+=c.end-c.start;added.push('clip:'+c.id);}
  if(next.length>64||AT.reconcile(clips,next,audioTracks,titles).tracks.reduce((n,t)=>n+t.clips.length,0)+copy.audio.length>64)return status('اللصق يتجاوز حد 64 قطعة.',true);pause();checkpoint();clips=next;
  // First update pre-existing linked material before adding the copied links.
  reconcileTimeline();const positions=AT.offsets(clips);
  for(const entry of copy.audio){let track=audioTracks.find(t=>t.id===entry.trackId);if(!track){track={id:entry.trackId,name:entry.trackName,...AT.flags(),clips:[]};audioTracks.push(track);}const c=structuredClone(entry.clip);c.id=AT.uid();c.at=Math.max(0,base+c.at-copy.start);
    if(c.link&&map.has(c.link.clipId)){c.link.clipId=map.get(c.link.clipId);c.at=positions.get(c.link.clipId).at+c.link.offset;}else delete c.link;track.clips.push(c);added.push('audio:'+c.id);
  }
  for(const original of copy.text){const t=structuredClone(original);t.id=AT.uid();t.titleStart=Math.max(0,base+t.titleStart-copy.start);if(t.link&&map.has(t.link.clipId)){t.link.clipId=map.get(t.link.clipId);t.titleStart=positions.get(t.link.clipId).at+t.link.offset;}else delete t.link;titles.push(t);added.push('title:'+t.id);}
  timelineSelection=added;const first=added[0];if(first?.startsWith('clip:')){selectedClip=clips.findIndex(c=>'clip:'+c.id===first);selectionKind='clip';}else if(first?.startsWith('audio:')){selectAudio(first.slice(6),true);}else if(first){selectedTitle=first.slice(6);selectionKind='title';}refreshAfterEdit();status('لصقت التحديد؛ تكدر تتراجع عن العملية كاملة.');
}
function duplicateTimelineSelection(){copyTimelineSelection();if(timelineClipboard)pasteTimelineSelection(timelineClipboard.end);}
function resetSelection(kind,id){timelineSelection=[kind+':'+id];selectionKind=kind;if(kind==='clip')selectedClip=clips.findIndex(c=>c.id===id);if(kind==='audio')selectAudio(id,timelineSelection.includes(key));if(kind==='title')selectedTitle=id;}
function moveMainSelection(from,time){
  if(busy||mainEditBlocked())return;const moved=timelineSelection.includes('clip:'+clips[from]?.id)?clips.filter(c=>timelineSelection.includes('clip:'+c.id)):[clips[from]];if(!moved[0])return;
  const old=AT.offsets(clips),ids=new Set(moved.map(c=>c.id)),target=TL.locate(clips,time),boundary=target?(target.local>(clips[target.index].end-clips[target.index].start)/2?target.index+1:target.index):0;
  const before=clips.slice(0,boundary).filter(c=>!ids.has(c.id)).length,remaining=clips.filter(c=>!ids.has(c.id));remaining.splice(before,0,...moved);if(remaining.every((c,i)=>c.id===clips[i].id))return;
  pause();checkpoint();clips=remaining;clips.forEach(c=>c.transition='none');selectedClip=before;selectionKind='clip';timelineSelection=moved.map(c=>'clip:'+c.id);cursor=AT.offsets(clips).get(moved[0].id).at;refreshAfterEdit();
}
function splitAudioHere(){const entry=selectedAudioEntry();if(!entry||busy||entry.track.locked)return;const {clip:c,track}=entry,local=cursor-c.at;if(local<.1||local>c.end-c.start-.1)return status('حرّك المؤشر داخل قطعة الصوت.');if(audioTracks.reduce((n,t)=>n+t.clips.length,0)>=64)return;
  pause();checkpoint();const right={...structuredClone(c),id:AT.uid(),start:c.start+local,at:cursor,audio:{...c.audio,fadeIn:0}};if(right.link)right.link.offset+=local;c.end=c.start+local;c.audio={...c.audio,fadeOut:0};track.clips.splice(track.clips.indexOf(c)+1,0,right);selectAudio(right.id);refreshAfterEdit();
}
function snapTimelineTime(time,exclude=[]){
  if(!snapEnabled)return Math.max(0,Math.round(time*fps(meta?.fps))/fps(meta?.fps));const points=[0,cursor,...markers.map(m=>m.time)],positions=AT.offsets(clips);
  for(const c of clips)if(!exclude.includes('clip:'+c.id)){const start=positions.get(c.id).at;points.push(start,start+c.end-c.start);}
  for(const t of audioTracks)for(const c of t.clips)if(!exclude.includes('audio:'+c.id))points.push(c.at,c.at+c.end-c.start);
  for(const t of titles)if(!exclude.includes('title:'+t.id))points.push(t.titleStart,t.titleStart+t.titleDuration);
  return AT.snap(time,points,8*total()/Math.max(1,$('ruler').getBoundingClientRect().width),fps(meta?.fps));
}
function updateTimelineTools(){
  const keys=selectedKeys(),locked=lockedSelection(keys),mainLocked=mainEditBlocked(false);$('copy-selection').disabled=busy||!keys.length;$('paste-selection').disabled=busy||!timelineClipboard;$('duplicate-selection').disabled=busy||!keys.length||locked;
  $('extract-audio').disabled=busy||mainLocked||!clips[selectedClip]||!assetFor(clips[selectedClip])?.audio;$('add-audio-track').disabled=busy||audioTracks.length>=8;$('add-marker').disabled=busy||!meta;
  for(const [id,key]of [['main-muted','muted'],['main-solo','solo'],['main-locked','locked']]){$(id).checked=mainTrack[key];$(id).disabled=busy;}$('titles-locked').checked=titlesLocked;$('titles-locked').disabled=busy;$('snap-enabled').checked=snapEnabled;$('snap-enabled').disabled=busy;$('audio-delete-mode').disabled=busy;
  if(mainLocked){for(const id of ['split','reset','transition','image-duration'])$(id).disabled=true;document.querySelectorAll('.clip-reorder').forEach(e=>e.draggable=false);}
  if(keys.length)$('delete').disabled=busy||locked;
  for(const id of titleFields)$(id).disabled=busy||titlesLocked||!currentTitle();for(const id of ['add-text','duplicate-text','remove-text','title-start-here','apply-layout','title-binding'])$(id).disabled=busy||titlesLocked||(id!=='add-text'&&!currentTitle());
  document.querySelectorAll('.template').forEach(b=>b.disabled=busy||titlesLocked||!currentTitle());
  if(selectionKind==='audio'){$('delete').disabled=busy||!selectedAudioEntry()||!!selectedAudioEntry()?.track.locked;$('split').disabled=$('delete').disabled;}
  const binding=$('title-binding'),value=currentTitle()?.link?.clipId||'';binding.replaceChildren(new Option('بوقت المشروع',''));clips.forEach((c,i)=>binding.add(new Option('مرتبط بالقطعة '+(i+1),c.id)));binding.value=value;
  if(mainLocked)for(const id of [...clipTransformFields,...clipAudioFields])$(id).disabled=true;
}
function refreshAudioControls(){
  const entry=selectedAudioEntry(),track=entry?.track||audioTracks.find(t=>t.id===activeAudioTrack)||audioTracks[0];if(track)activeAudioTrack=track.id;
  $('inspect-audio').setAttribute('aria-pressed',String(selectionKind==='audio'));
  for(const id of ['audio-track-select','audio-destination']){const select=$(id);if(document.activeElement!==select){select.replaceChildren();for(const t of audioTracks)select.add(new Option(t.name,t.id));select.value=track?.id||'';}select.disabled=busy||!track;}
  controlValue('audio-track-name',track?.name||'');for(const key of ['muted','solo','locked']){$('audio-track-'+key).checked=!!track?.[key];$('audio-track-'+key).disabled=busy||!track;}$('audio-track-name').disabled=busy||!track||track.locked;$('delete-audio-track').disabled=busy||!track||track.locked;$('new-audio-track').disabled=busy||audioTracks.length>=8;
  const c=entry?.clip,a=SettingsAudio(c?.audio);$('audio-clip-name').textContent=c?assets.find(x=>x.id===c.assetId)?.name||'صوت':'اختار قطعة صوت من الشريط.';
  for(const [id,value]of [['audio-at',c?.at||0],['audio-start',c?.start||0],['audio-end',c?.end||0],['audio-volume',a.volume*100],['audio-fade-in',a.fadeIn],['audio-fade-out',a.fadeOut]]){controlValue(id,value);$(id).disabled=busy||!c||track.locked;}
  $('audio-muted').checked=a.muted;$('audio-muted').disabled=busy||!c||track.locked;$('audio-destination').disabled=busy||!c||track.locked;$('unlink-audio').disabled=busy||!c?.link||track.locked;
  $('audio-link-note').textContent=c?.link?'مرتبط بالفيديو: يتحرك وينقص وياه. فك الربط للتحريك بحرية.':'مثبت بوقت المشروع: نقل الفيديو ما يغيّر مكانه.';$('audio-at').disabled ||=!!c?.link;
}
function editAudioControls(){
  const entry=selectedAudioEntry();if(!entry||busy||entry.track.locked)return;try{const old=entry.clip,c={...structuredClone(old),at:Number($('audio-at').value),start:Number($('audio-start').value),end:Number($('audio-end').value),audio:{volume:Number($('audio-volume').value)/100,muted:$('audio-muted').checked,fadeIn:Number($('audio-fade-in').value),fadeOut:Number($('audio-fade-out').value)}};
    if(c.link){c.link.offset+=c.start-old.start;if(c.link.offset<0)throw new Error('فك الربط حتى توسّع الصوت قبل بداية الفيديو.');c.at=AT.placement(c,clips);}
    Object.assign(c.audio,SahlClipSettings.fades(c.audio,c.end-c.start));const registry=Object.fromEntries(assets.map(a=>[a.id,{...a,meta:a}]));AT.validate([{...entry.track,clips:[c]}],registry,clips);
    pause();checkpoint();Object.assign(old,c);refreshAfterEdit();
  }catch(e){status(e.message,true);document.activeElement?.blur();refreshAudioControls();}
}
function requestWaveform(id){
  if(waveformCache.has(id))return;const generation=waveGeneration;waveformCache.set(id,{pending:true});
  Promise.resolve(window.sahl.waveform?.(id)).then(result=>{if(generation!==waveGeneration)return;waveformCache.set(id,result?.peaks?result:{error:result?.error||'الموجة غير متاحة'});paintWaveforms();}).catch(e=>{if(generation===waveGeneration){waveformCache.set(id,{error:e.message});paintWaveforms();}});
}
function paintWaveforms(){
  for(const canvas of document.querySelectorAll('canvas.waveform')){const result=waveformCache.get(canvas.dataset.assetId),label=canvas.parentElement.querySelector('.wave-status');if(label)label.textContent=result?.pending?'تجهيز الموجة…':result?.error?'الموجة غير متاحة — أعد المحاولة':'';if(!result?.peaks?.length)continue;
    const width=Math.min(2048,Math.max(1,canvas.clientWidth)),height=32;canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#83d9c8';const start=Number(canvas.dataset.start),end=Number(canvas.dataset.end),peaks=result.peaks;
    for(let x=0;x<width;x++){const a=Math.floor((start+(end-start)*x/width)/result.duration*peaks.length),b=Math.max(a+1,Math.ceil((start+(end-start)*(x+1)/width)/result.duration*peaks.length));let peak=0;for(let i=Math.max(0,a);i<Math.min(peaks.length,b);i++)peak=Math.max(peak,peaks[i]);const h=Math.max(1,peak*height);ctx.fillRect(x,(height-h)/2,1,h);}
  }
}
function waveformNode(c){const canvas=document.createElement('canvas');canvas.className='waveform';canvas.dataset.assetId=c.assetId;canvas.dataset.start=c.start;canvas.dataset.end=c.end;canvas.setAttribute('aria-label','موجة صوتية');requestWaveform(c.assetId);return canvas;}
function renderAudioTracks(){
  const container=$('audio-tracks');container.replaceChildren();const length=total();
  for(const track of audioTracks){const row=document.createElement('div');row.className='audio-row'+(track.locked?' locked':'');row.dataset.trackId=track.id;const heading=document.createElement('div');heading.className='track-heading';
    const name=document.createElement('button');name.className='track-name';name.textContent=track.name;name.onclick=()=>{activeAudioTrack=track.id;selectedAudio=null;selectionKind='audio';timelineSelection=[];refreshClipControls();};heading.append(name);
    for(const [key,label]of [['muted','كتم'],['solo','منفرد'],['locked','قفل']]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-pressed',String(track[key]));b.disabled=busy;b.onclick=()=>{if(busy)return;pause();checkpoint();track[key]=!track[key];refreshAfterEdit();};heading.append(b);}row.append(heading);
    const lane=document.createElement('div');lane.className='audio-lane';lane.dataset.trackId=track.id;row.append(lane);
    for(const c of track.clips){const chip=document.createElement('div');chip.className='audio-chip'+(timelineSelection.includes('audio:'+c.id)||selectedAudio===c.id&&selectionKind==='audio'?' selected':'');chip.tabIndex=0;chip.role='button';chip.dataset.audioId=c.id;chip.style.left=(length?c.at/length*100:0)+'%';chip.style.width=(length?(c.end-c.start)/length*100:0)+'%';chip.setAttribute('aria-label',(assets.find(a=>a.id===c.assetId)?.name||'صوت')+' عند '+precise(c.at));
      const label=document.createElement('b');label.textContent=(c.link?'↔ ':'')+(assets.find(a=>a.id===c.assetId)?.name||'صوت');const state=document.createElement('small');state.className='wave-status';chip.append(waveformNode(c),label,state);for(const edge of ['start','end']){const h=document.createElement('span');h.className='audio-edge';h.dataset.edge=edge;chip.append(h);}lane.append(chip);
      chip.onkeydown=e=>{if(e.key==='Enter'){selectAudio(c.id);refreshAfterEdit();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();selectAudio(c.id);deleteTimelineSelection();}};
    }container.append(row);
  }
  $('timeline-surface').style.height='auto';document.querySelectorAll('#clips-track .clip').forEach(el=>{el.querySelector('.waveform')?.remove();const c=clips[Number(el.dataset.index)];if(assetFor(c)?.audio)el.append(waveformNode(c));});
  const markerLayer=$('markers-track');markerLayer.replaceChildren();for(const m of markers){if(m.time>length||!length)continue;const b=document.createElement('button');b.className='marker-button';b.style.left=m.time/length*100+'%';b.textContent='◆';b.title=m.name+' · '+precise(m.time);b.setAttribute('aria-label',b.title);b.onclick=()=>{pause();seekTo(m.time);};b.ondblclick=()=>openMarker(m);markerLayer.append(b);}
  paintWaveforms();
}
function startEditDrag(e,kind,id,edge){
  const keys=selectedKeys();if(kind==='clip'&&mainEditBlocked()||kind==='audio'&&lockedSelection(keys))return status('افتح قفل عناصر التحديد أولاً.',true);
  pause();if(!keys.includes(kind+':'+id))resetSelection(kind,id);const c=kind==='clip'?clips.find(c=>c.id===id):audioTracks.flatMap(t=>t.clips).find(c=>c.id===id);if(!c)return;
  editDrag={pointer:e.pointerId,x:e.clientX,kind,id,edge,clip:structuredClone(c),keys:selectedKeys(),before:snapshot(),scale:total()/Math.max(1,$('ruler').getBoundingClientRect().width),recorded:false};$('timeline-surface').setPointerCapture(e.pointerId);refreshClipControls();
}
function applyEditDrag(e){const d=editDrag;if(!d||d.pointer!==e.pointerId)return;const delta=(e.clientX-d.x)*d.scale;if(!d.recorded&&Math.abs(e.clientX-d.x)<2)return;
  const original=d.clip,positions=AT.offsets(d.before.clips),originalAt=d.kind==='clip'?positions.get(d.id).at:original.at,anchor=d.edge==='end'?originalAt+original.end-original.start:originalAt;
  let shift=snapTimelineTime(anchor+delta,d.edge?[d.kind+':'+d.id]:d.keys)-anchor;const asset=assets.find(a=>a.id===original.assetId),limit=asset.kind==='image'?86400:asset.duration;
  if(!d.recorded){checkpoint();d.recorded=true;}
  clips=structuredClone(d.before.clips);audioTracks=structuredClone(d.before.audioTracks);titles=structuredClone(d.before.titles);lastMainClips=structuredClone(d.before.clips);
  const c=d.kind==='clip'?clips.find(c=>c.id===d.id):audioTracks.flatMap(t=>t.clips).find(c=>c.id===d.id);
  if(d.edge==='start'){shift=Math.max(-original.start,Math.min(original.end-original.start-.1,shift));if(d.kind==='audio')shift=Math.max(-original.at,shift);c.start=original.start+shift;if(d.kind==='audio'){c.at=original.at+shift;if(c.link){c.link.offset+=shift;if(c.link.offset<0){c.start-=c.link.offset;c.at-=c.link.offset;c.link.offset=0;}}}}
  else if(d.edge==='end'){const parentLimit=c.link?c.start+positions.get(c.link.clipId).clip.end-positions.get(c.link.clipId).clip.start-c.link.offset:limit;c.end=Math.max(c.start+.1,Math.min(limit,parentLimit,original.end+shift));}
  else if(d.kind==='audio'){
    const group=audioTracks.flatMap(t=>t.clips).filter(c=>d.keys.includes('audio:'+c.id));
    const linkedMinimum=Math.max(...group.map(c=>c.link?-c.link.offset:-c.at)),linkedMaximum=Math.min(...group.map(c=>c.link?positions.get(c.link.clipId).clip.end-positions.get(c.link.clipId).clip.start-c.link.offset-(c.end-c.start):86400-c.at));shift=Math.min(linkedMaximum,Math.max(linkedMinimum,shift));
    for(const item of group){item.at+=shift;if(item.link)item.link.offset+=shift;}
  }
  renderTimeline();changed();refreshClipControls();
}
function finishEditDrag(e){if(editDrag?.pointer!==e.pointerId)return;editDrag=null;if($('timeline-surface').hasPointerCapture(e.pointerId))$('timeline-surface').releasePointerCapture(e.pointerId);refreshAfterEdit();}
$('timeline-surface').addEventListener('pointerdown',e=>{
  if(busy||!meta||e.button!==0)return;const element=e.target.closest('.clip,.audio-chip,.title-chip'),key=element?.dataset.clipId?'clip:'+element.dataset.clipId:element?.dataset.audioId?'audio:'+element.dataset.audioId:element?.dataset.titleId?'title:'+element.dataset.titleId:null;
  if(key&&(e.shiftKey||e.ctrlKey||e.metaKey)){e.preventDefault();e.stopImmediatePropagation();pause();if(e.shiftKey&&key.startsWith('clip:')&&selectionKind==='clip'&&selectedClip>=0){const index=clips.findIndex(c=>'clip:'+c.id===key);timelineSelection=clips.slice(Math.min(index,selectedClip),Math.max(index,selectedClip)+1).map(c=>'clip:'+c.id);}else timelineSelection=timelineSelection.includes(key)?timelineSelection.filter(x=>x!==key):[...selectedKeys(),key];renderTimeline();return;}
  if(!key&&e.shiftKey&&!e.target.closest('button,input,select,.track-heading')){e.preventDefault();e.stopImmediatePropagation();const rect=$('timeline-surface').getBoundingClientRect();marquee={pointer:e.pointerId,x:e.clientX,y:e.clientY,rect};$('timeline-marquee').hidden=false;$('timeline-surface').setPointerCapture(e.pointerId);return;}
  if(key&&e.target.closest('.clip-edge,.audio-chip')){e.preventDefault();e.stopImmediatePropagation();const [kind,id]=key.split(':');if(kind==='audio')selectAudio(id,timelineSelection.includes(key));startEditDrag(e,kind,id,e.target.dataset.edge);}
},true);
$('timeline-surface').addEventListener('pointermove',e=>{
  if(editDrag){applyEditDrag(e);return;}if(marquee?.pointer!==e.pointerId)return;const d=marquee,box=$('timeline-marquee'),left=Math.min(d.x,e.clientX),top=Math.min(d.y,e.clientY),right=Math.max(d.x,e.clientX),bottom=Math.max(d.y,e.clientY);box.style.left=left-d.rect.left+'px';box.style.top=top-d.rect.top+'px';box.style.width=right-left+'px';box.style.height=bottom-top+'px';
  timelineSelection=[];for(const el of document.querySelectorAll('.clip,.audio-chip,.title-chip')){const r=el.getBoundingClientRect();if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom)timelineSelection.push(el.dataset.clipId?'clip:'+el.dataset.clipId:el.dataset.audioId?'audio:'+el.dataset.audioId:'title:'+el.dataset.titleId);el.classList.toggle('selected',timelineSelection.includes(el.dataset.clipId?'clip:'+el.dataset.clipId:el.dataset.audioId?'audio:'+el.dataset.audioId:'title:'+el.dataset.titleId));}updateButtons();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('timeline-surface').addEventListener(event,e=>{if(editDrag)finishEditDrag(e);if(marquee?.pointer===e.pointerId){marquee=null;$('timeline-marquee').hidden=true;if($('timeline-surface').hasPointerCapture(e.pointerId))$('timeline-surface').releasePointerCapture(e.pointerId);updateButtons();}});
function openMarker(marker=null){if(busy||!meta)return;markerEditing=marker?.id||null;$('marker-name').value=marker?.name||'علامة '+(markers.length+1);$('marker-time').value=marker?.time??cursor;$('remove-marker').hidden=!marker;$('marker-dialog').showModal();$('marker-name').focus();}
$('save-marker').onclick=()=>{const time=Number($('marker-time').value),name=$('marker-name').value.trim().slice(0,80);if(!Number.isFinite(time)||time<0||time>86400||!name)return status('اكتب اسم ووقت صالحين للعلامة.',true);if(!markerEditing&&markers.length>=256)return;pause();checkpoint();const item=markers.find(m=>m.id===markerEditing);if(item)Object.assign(item,{time,name});else markers.push({id:AT.uid(),time,name});$('marker-dialog').close();refreshAfterEdit();};
$('remove-marker').onclick=()=>{if(!markerEditing)return;checkpoint();markers=markers.filter(m=>m.id!==markerEditing);$('marker-dialog').close();refreshAfterEdit();};$('close-marker').onclick=()=>$('marker-dialog').close();$('add-marker').onclick=()=>openMarker();
function timelineShortcut(e){const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;if(e.altKey)return false;const actions=mod?{c:copyTimelineSelection,v:()=>pasteTimelineSelection(),d:duplicateTimelineSelection,a:()=>{timelineSelection=[...clips.map(c=>'clip:'+c.id),...audioTracks.flatMap(t=>t.clips.map(c=>'audio:'+c.id)),...titles.map(t=>'title:'+t.id)];renderTimeline();}}:{m:()=>openMarker(),n:()=>{$('snap-enabled').click();}};if(!actions[key])return false;e.preventDefault();actions[key]();return true;}
$('choose-audio').onclick=()=>importResult(()=>window.sahl.choose('audio'),{insert:true});$('add-audio-track').onclick=$('new-audio-track').onclick=()=>addTrack();$('extract-audio').onclick=extractSelectedAudio;
$('copy-selection').onclick=copyTimelineSelection;$('paste-selection').onclick=()=>pasteTimelineSelection();$('duplicate-selection').onclick=duplicateTimelineSelection;
$('inspect-audio').onclick=()=>{selectionKind='audio';refreshClipControls();};
for(const [id,key]of [['main-muted','muted'],['main-solo','solo'],['main-locked','locked']])$(id).onchange=()=>{if(busy)return;pause();checkpoint();mainTrack[key]=$(id).checked;refreshAfterEdit();};
$('titles-locked').onchange=()=>{if(busy)return;pause();checkpoint();titlesLocked=$('titles-locked').checked;refreshAfterEdit();};$('snap-enabled').onchange=()=>{if(busy)return;checkpoint();snapEnabled=$('snap-enabled').checked;changed();updateButtons();};
$('audio-track-select').onchange=()=>{activeAudioTrack=$('audio-track-select').value;selectedAudio=null;timelineSelection=[];refreshClipControls();};
$('audio-track-name').onchange=()=>{const t=audioTracks.find(t=>t.id===activeAudioTrack);if(!t||busy||t.locked)return;checkpoint();t.name=$('audio-track-name').value.trim().slice(0,80)||'صوت';refreshAfterEdit();};
for(const key of ['muted','solo','locked'])$('audio-track-'+key).onchange=()=>{const t=audioTracks.find(t=>t.id===activeAudioTrack);if(!t||busy)return;pause();checkpoint();t[key]=$('audio-track-'+key).checked;refreshAfterEdit();};
$('delete-audio-track').onclick=()=>{const t=audioTracks.find(t=>t.id===activeAudioTrack);if(!t||busy||t.locked)return;pause();checkpoint();audioTracks=audioTracks.filter(x=>x!==t);selectedAudio=null;activeAudioTrack=null;timelineSelection=[];refreshAfterEdit();};
for(const id of ['audio-at','audio-start','audio-end','audio-volume','audio-muted','audio-fade-in','audio-fade-out'])$(id).onchange=editAudioControls;
$('unlink-audio').onclick=()=>{const e=selectedAudioEntry();if(!e||busy||e.track.locked||!e.clip.link)return;pause();checkpoint();delete e.clip.link;refreshAfterEdit();};
$('audio-destination').onchange=()=>{const e=selectedAudioEntry(),target=audioTracks.find(t=>t.id===$('audio-destination').value);if(!e||!target||e.track===target||busy)return;if(e.track.locked||target.locked){status('المسار مقفل.',true);refreshAudioControls();return;}pause();checkpoint();e.track.clips=e.track.clips.filter(c=>c!==e.clip);target.clips.push(e.clip);activeAudioTrack=target.id;refreshAfterEdit();};
$('title-binding').onchange=()=>{const t=currentTitle(),parent=AT.offsets(clips).get($('title-binding').value);if(!t||busy||titlesLocked)return;pause();checkpoint();if(parent){t.link={clipId:parent.clip.id,offset:Math.max(0,t.titleStart-parent.at)};t.titleStart=parent.at+t.link.offset;}else delete t.link;refreshAfterEdit();};
$('retry-waveforms').onclick=()=>{waveGeneration++;waveformCache.clear();renderAudioTracks();};
window.addEventListener('resize',paintWaveforms);$('timeline-scroll').addEventListener('scroll',paintWaveforms,{passive:true});
for(const [label,key]of [['نسخ / لصق داخل المشروع',shortcutModifier+' + C / V'],['تكرار التحديد',shortcutModifier+' + D'],['تحديد الكل',shortcutModifier+' + A'],['علامة جديدة','M'],['تفعيل / تعطيل الجذب','N'],['تحديد نطاق قطع','Shift + نقرة'],['تحديد مستطيل','Shift + سحب مساحة فارغة']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=key;$('shortcuts-list').append(dt,dd);}
renderTimeline();refreshClipControls();

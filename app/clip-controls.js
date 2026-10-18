const clipTransformFields=['clip-fit','clip-zoom','clip-x','clip-y','clip-rotation','clip-flip-x','clip-flip-y','reset-transform','move-picture'];
const clipAudioFields=['clip-muted','clip-volume','clip-fade-in','clip-fade-out','reset-audio'];
function controlValue(id,value){if(document.activeElement!==$(id))$(id).value=String(value);}
function refreshClipControls(){
  const selected=selectionKind==='clip',c=clips[selectedClip],a=assetFor(c),t=SahlClipSettings.transform(c?.transform),audio=SahlClipSettings.audio(c?.audio),f=c?SahlClipSettings.fades(audio,c.end-c.start):{fadeIn:0,fadeOut:0};
  document.body.classList.toggle('clip-inspecting',selected);document.body.classList.toggle('audio-inspecting',selectionKind==='audio');if(typeof refreshAudioControls==='function')refreshAudioControls();$('inspect-clip').setAttribute('aria-pressed',String(selected));$('inspect-text').setAttribute('aria-pressed',String(selectionKind==='title'));$('inspector').setAttribute('aria-label',selected?'خصائص القطعة والمشروع':selectionKind==='audio'?'خصائص الصوت':'خصائص النص');
  $('canvas-mode').disabled=!meta||busy;$('canvas-size').disabled=!meta||busy||canvasMode==='source';controlValue('canvas-mode',canvasMode);
  const edge=meta?Math.min(meta.width,meta.height):1080;if(![...$('canvas-size').options].some(o=>Number(o.value)===edge))$('canvas-size').add(new Option(String(edge),String(edge)));controlValue('canvas-size',edge);
  $('canvas-info').textContent=meta?`${meta.width} × ${meta.height} — تكبير اللوحة لا يزيد تفاصيل المصدر.`:'استورد ملف حتى تختار الأبعاد.';
  $('clip-controls-name').textContent=c?`${selectedClip+1}. ${a?.name||''}`:'اختار قطعة من الشريط.';
  for(const id of clipTransformFields)$(id).disabled=!c||busy;
  for(const id of clipAudioFields)$(id).disabled=!c||busy||!a?.audio||a.kind==='image';
  controlValue('clip-fit',t.fit);controlValue('clip-zoom',t.zoom*100);controlValue('clip-x',t.x);controlValue('clip-y',t.y);controlValue('clip-rotation',t.rotation);
  $('clip-flip-x').checked=t.flipX;$('clip-flip-y').checked=t.flipY;$('clip-muted').checked=audio.muted;controlValue('clip-volume',audio.volume*100);
  controlValue('clip-fade-in',f.fadeIn);controlValue('clip-fade-out',f.fadeOut);for(const id of ['clip-fade-in','clip-fade-out'])$(id).max=c?(c.end-c.start)/2:0;
  $('clip-audio-note').textContent=a?.audio?'التغييرات تخص القطعة المحددة فقط.':'هذه القطعة لا تحتوي على صوت.';
  layoutCanvas();
}
function layoutPicture(scale){
  const frame=$('picture-frame');if(!meta){frame.hidden=true;$('picture-drag').hidden=true;return;}frame.hidden=false;
  const at=TL.locate(clips,cursor),c=at&&clips[at.index],a=assetFor(c);frame.style.width=meta.width*scale+'px';frame.style.height=meta.height*scale+'px';
  if(a){const g=SahlClipSettings.geometry(a,meta,c.transform),rotated=g.rotation%180;
    for(const el of [video,$('still'),$('fallback')]){el.style.width=(rotated?g.height:g.width)*scale+'px';el.style.height=(rotated?g.width:g.height)*scale+'px';el.style.left=(g.left+g.width/2)*scale+'px';el.style.top=(g.top+g.height/2)*scale+'px';el.style.transform=`translate(-50%,-50%) scale(${g.flipX?-1:1},${g.flipY?-1:1}) rotate(${g.rotation}deg)`;}
  }
  const box=$('picture-drag'),r=$('stage').getBoundingClientRect();box.style.width=meta.width*scale+'px';box.style.height=meta.height*scale+'px';box.style.left=(r.width-meta.width*scale)/2+'px';box.style.top=(r.height-meta.height*scale)/2+'px';box.hidden=!$('move-picture').checked||busy||playing||selectionKind!=='clip'||!at||at.index!==selectedClip;
}
function editSelectedClip(key,value){
  const c=clips[selectedClip];if(!c||busy||typeof mainEditBlocked==='function'&&mainEditBlocked())return;
  try{const clean=key==='audio'?SahlClipSettings.audio(value):SahlClipSettings.transform(value);if(key==='audio')Object.assign(clean,SahlClipSettings.fades(clean,c.end-c.start));
    if(JSON.stringify(clean)===JSON.stringify(key==='audio'?SahlClipSettings.audio(c.audio):SahlClipSettings.transform(c.transform)))return;
    pause();checkpoint();c[key]=clean;changed();refreshClipControls();updateOverlayVisibility();updateButtons();status(key==='audio'?'تم تحديث صوت القطعة.':'تم تحديث الصورة داخل الإطار.');
  }catch(e){status(e.message,true);document.activeElement?.blur();refreshClipControls();}
}
function readTransform(){return {fit:$('clip-fit').value,zoom:Number($('clip-zoom').value)/100,x:Number($('clip-x').value),y:Number($('clip-y').value),rotation:Number($('clip-rotation').value),flipX:$('clip-flip-x').checked,flipY:$('clip-flip-y').checked};}
function readAudio(){return {volume:Number($('clip-volume').value)/100,muted:$('clip-muted').checked,fadeIn:Number($('clip-fade-in').value),fadeOut:Number($('clip-fade-out').value)};}
for(const id of clipTransformFields.filter(id=>!['reset-transform','move-picture'].includes(id)))$(id).onchange=()=>editSelectedClip('transform',readTransform());
for(const id of clipAudioFields.filter(id=>id!=='reset-audio'))$(id).onchange=()=>editSelectedClip('audio',readAudio());
$('reset-transform').onclick=()=>editSelectedClip('transform',{});$('reset-audio').onclick=()=>editSelectedClip('audio',{});
function changeCanvas(){
  if(!meta||busy)return;try{const mode=$('canvas-mode').value,size=SahlClipSettings.canvasSize(sourceMeta||meta,mode,Math.min(4320,Number($('canvas-size').value)));
    if(size.width===meta.width&&size.height===meta.height&&canvasMode===mode)return;
    pause();checkpoint();sourceMeta||={...meta};meta={...meta,...size};canvasMode=mode;$('badge').textContent=`${meta.width} × ${meta.height}`;updateExportInfo();draw();refreshClipControls();changed();updateButtons();status('تم تحديث أبعاد المشروع. تقدر تضبط كل قطعة من الصورة داخل الإطار.');
  }catch(e){status(e.message,true);document.activeElement?.blur();refreshClipControls();}
}
$('canvas-mode').onchange=$('canvas-size').onchange=changeCanvas;
$('inspect-clip').onclick=()=>{selectionKind='clip';refreshClipControls();layoutCanvas();};
$('inspect-text').onclick=()=>showProperties('text');
$('move-picture').onchange=()=>{pause();if($('move-picture').checked&&clips[selectedClip]){const start=clips.slice(0,selectedClip).reduce((n,c)=>n+c.end-c.start,0);seekTo(start+Math.min(.4,(clips[selectedClip].end-clips[selectedClip].start)/2));}layoutCanvas();};
let pictureDrag=null;
$('picture-drag').onpointerdown=e=>{if(e.button!==0||busy||!clips[selectedClip]||typeof mainEditBlocked==='function'&&mainEditBlocked())return;e.preventDefault();pause();pictureDrag={id:e.pointerId,index:selectedClip,x:e.clientX,y:e.clientY,initial:SahlClipSettings.transform(clips[selectedClip].transform),rect:$('picture-drag').getBoundingClientRect(),recorded:false};$('picture-drag').setPointerCapture(e.pointerId);};
$('picture-drag').onpointermove=e=>{const d=pictureDrag;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.recorded&&Math.hypot(dx,dy)<2)return;if(!d.recorded){checkpoint();d.recorded=true;}
  const bounded=n=>Math.round(Math.max(-50,Math.min(50,n))*10)/10;clips[d.index].transform={...d.initial,x:bounded(d.initial.x+dx/d.rect.width*100),y:bounded(d.initial.y+dy/d.rect.height*100)};refreshClipControls();changed();
};
function finishPictureDrag(e){if(pictureDrag?.id!==e.pointerId)return;pictureDrag=null;if($('picture-drag').hasPointerCapture(e.pointerId))$('picture-drag').releasePointerCapture(e.pointerId);updateButtons();}
$('picture-drag').onpointerup=$('picture-drag').onpointercancel=$('picture-drag').onlostpointercapture=finishPictureDrag;
refreshClipControls();

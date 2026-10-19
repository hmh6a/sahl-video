const timeline = require('./timeline'),AudioTracks=require('./audio-tracks'),Layers=require('./visual-layers');
const {encodingArgs}=require('./encoding');
const Color=require('./color'),Settings=require('./clip-settings'),ExportRange=require('./export-range');
const Title=require('./title-model'),Animation=require('./animation'),{outputSize,frameRate}=require('./project');
function inspect(data) {
  const v=data.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);if(!v)throw new Error('الملف ما يحتوي على فيديو.');
  const rotation=Number(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation||v.tags?.rotate||0),rotated=Math.abs(rotation)%180===90;
  const duration=Number(data.format?.duration||v.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('تعذّر تحديد مدة الفيديو.');
  return {width:rotated?v.height:v.width,height:rotated?v.width:v.height,duration,fps:v.avg_frame_rate&&!['0','0/0'].includes(v.avg_frame_rate)?v.avg_frame_rate:v.r_frame_rate,codec:v.codec_name,color:Color.metadata(v),hdr:['smpte2084','arib-std-b67'].includes(v.color_transfer),audio:data.streams.some(s=>s.codec_type==='audio')};
}
function transitionAudioFilter(clips,index,offset=0){
  const terms=[],d=timeline.length(clips[index]),time=offset?`(t+${offset})`:'t';
  for(const [boundary,incoming]of [[index-1,true],[index,false]]){const n=timeline.boundaryLength(clips,boundary);if(!n)continue;const c=clips[boundary];if(c.transition==='crossfade'&&timeline.audioMode(c)==='cut')terms.push(incoming?`gte(${time},${n/2})`:`lt(${time},${d-n/2})`);else if(timeline.audioMode(c)!=='cut')terms.push(`min(1,max(0,${incoming?time+'/'+n:'('+d+'-'+time+')/'+n}))`);}
  return terms.length?`,aeval='val(ch)*${terms.join('*')}':c=same`:'';
}
function exportArgs(input,overlay,output,meta,opts){
  const assets=typeof input==='string'?null:input,clips=timeline.validate(meta,opts,assets),size=outputSize(meta,opts.resolution||'source'),rate=frameRate(meta.fps||'30');
  const source=c=>assets?assets[c.assetId]:{path:input,meta,kind:'video'};
  // Normalize a mixed timeline to the first HDR clip's transfer; never reduce it to 8-bit.
  const layers=Layers.validate(opts.layers||[],assets||{}).filter(c=>!c.hidden&&c.at<timeline.duration(clips));
  const hdrSource=[...clips,...layers].map(c=>source(c)).find(a=>a.meta.hdr),hdr=!!hdrSource;
  const transfer=hdr?Color.input(hdrSource.meta).transfer:null,pixelFormat=hdr?'yuv420p10le':'yuv420p';
  const tracks=AudioTracks.validate(opts.audioTracks||[],assets||{},clips),mainTrack=AudioTracks.flags(opts.mainTrack);
  const cross=clips.some((c,i)=>timeline.overlap(clips,i)>0),length=timeline.duration(clips),multi=clips.length>1,hasAudio=clips.some(c=>source(c).kind!=='image'&&!c.freeze&&source(c).meta.audio)||tracks.some(t=>t.clips.length)||layers.some(c=>source(c).meta.audio);
  const mainAudible=AudioTracks.audible(mainTrack,mainTrack,tracks);
  const entries=Array.isArray(overlay)?overlay:overlay?[{path:overlay,start:opts.titleStart??0,duration:opts.titleDuration??5}]:[];
  if(entries.length>24)throw new Error('الحد الحالي 24 نص.');
  const overlays=entries.map(t=>({path:t.path,animation:Animation.normalize(t.animation),...Title.timing(length,t.start,t.duration)})).filter(t=>t.duration>0);
  const args=['-hide_banner','-y','-filter_complex_threads','2'],graph=[];
  clips.forEach((clip,i)=>{
    const a=source(clip),d=timeline.length(clip),sourceDuration=clip.end-clip.start,fi=timeline.fadeLength(clips,i-1),fo=timeline.fadeLength(clips,i);
    if(a.kind==='image')args.push('-framerate',rate,'-i',a.path);
    else args.push('-ss',String(clip.freeze?.time??clip.start),'-t',String(clip.freeze?Math.min(.2,a.meta.duration-clip.freeze.time):sourceDuration),'-i',a.path);
    const geometry=Settings.geometryFilter(a.meta,size,clip.transform);
    // A still needs one decode/resize, while video retains frame-accurate trimming.
    const color=hdr?Color.toHDR(a.meta,transfer,a.kind==='image')+',':'';
    const preparation=a.kind==='image'||clip.freeze?`${clip.freeze?'trim=end_frame=1,setpts=PTS-STARTPTS,':''}${color}${geometry},loop=loop=-1:size=1:start=0,trim=duration=${d},setpts=PTS-STARTPTS`:`trim=duration=${sourceDuration},setpts=(PTS-STARTPTS)/${timeline.rate(clip)},${color}${geometry}`;
    let vf=`[${i}:v:0]${preparation},fps=${rate}${timeline.rate(clip)!==1?`,tpad=stop_mode=clone:stop_duration=1,trim=duration=${d}`:''},settb=AVTB,format=${cross?(hdr?'yuv444p10le':'yuv444p'):pixelFormat}`;
    if(fi)vf+=`,fade=t=in:st=0:d=${fi}`;if(fo)vf+=`,fade=t=out:st=${d-fo}:d=${fo}`;graph.push(vf+`[v${i}]`);
    if(hasAudio){
      let af=a.kind!=='image'&&!clip.freeze&&a.meta.audio?`[${i}:a:0]atrim=duration=${sourceDuration},asetpts=PTS-STARTPTS,aresample=48000${timeline.tempoFilter(clip)?','+timeline.tempoFilter(clip):''},aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}`:`anullsrc=r=48000:cl=stereo,atrim=duration=${d},asetpts=PTS-STARTPTS`;
      if(!mainAudible)af+=',volume=0';if(cross||clips.some(c=>c.audioTransition&&c.audioTransition!=='auto'))af+=transitionAudioFilter(clips,i);else{if(fi)af+=`,afade=t=in:st=0:d=${fi}`;if(fo)af+=`,afade=t=out:st=${d-fo}:d=${fo}`;}const audio=Settings.audioFilter(clip.audio,d);if(audio)af+=','+audio;graph.push(af+`[a${i}]`);
    }
  });
  if(cross){
    let previous='v0';for(let i=1;i<clips.length;i++){const label=i===clips.length-1?'vbase':'joined'+i,n=timeline.overlap(clips,i-1);graph.push(`[${previous}][v${i}]`+(n?`xfade=transition=fade:duration=${n}:offset=${timeline.startAt(clips,i)}`:'concat=n=2:v=1:a=0')+`[${label}]`);previous=label;}
    if(hasAudio){clips.forEach((c,i)=>graph.push(`[a${i}]adelay=${Math.round(timeline.startAt(clips,i)*48000)}S:all=1,apad,atrim=duration=${length}[placed${i}]`));graph.push(clips.map((_,i)=>`[placed${i}]`).join('')+`amix=inputs=${clips.length}:normalize=0:duration=longest[audio]`);}
  }else if(multi)graph.push(clips.map((_,i)=>`[v${i}]${hasAudio?`[a${i}]`:''}`).join('')+`concat=n=${clips.length}:v=1:a=${hasAudio?1:0}[vbase]${hasAudio?'[audio]':''}`);
  else graph.push('[v0]null[vbase]');
  let base='vbase';const layerAudio=[];
  // Visual layers sit above the montage and below all title canvases.
  layers.forEach((c,i)=>{
    const a=source(c),index=clips.length+i,d=Math.min(c.end-c.start,length-c.at),g=Layers.geometry(c,size),label='visual'+i;
    if(a.kind==='image')args.push('-threads','1','-framerate',rate,'-i',a.path);else args.push('-ss',String(c.start),'-t',String(d),'-i',a.path);
    const color=hdr?(a.kind==='image'?Color.titleToHDR(transfer):Color.toHDR(a.meta,transfer)+',format=yuva420p10le'):'format=rgba';
    graph.push(`[${index}:v]${color},${Layers.filter(c,size)}${c.opacity<1?`,lut=a='val*${c.opacity}'`:''}${a.kind==='image'?',loop=loop=-1:size=1:start=0':''},fps=${rate},trim=duration=${d},setpts=PTS-STARTPTS+${c.at}/TB[${label}]`);
    graph.push(`[${base}][${label}]overlay=x='${g.x}-overlay_w/2':y='${g.y}-overlay_h/2':enable='gte(t,${c.at})*lt(t,${c.at+d})':eof_action=pass:repeatlast=0:format=${hdr?'yuv420p10':'auto'}[composite${i}]`);base='composite'+i;
    if(a.meta.audio){const audio=Settings.audioFilter(c.audio,d);graph.push(`[${index}:a]atrim=duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo${audio?','+audio:''}${mainTrack.solo||tracks.some(t=>t.solo)?',volume=0':''},adelay=${Math.round(c.at*48000)}S:all=1,apad,atrim=duration=${length}[visualAudio${i}]`);layerAudio.push('visualAudio'+i);}
  });
  overlays.forEach((t,i)=>{
    args.push('-threads','1','-framerate',rate,'-i',t.path);
    const {start,end,fade}=t,pos=Animation.expressions(t.animation,t,size.width,size.height);
    // Decode and scale the still title once; repeat the exact pixels in memory.
    let vf=`[${clips.length+layers.length+i}:v]scale=${size.width}:${size.height},format=rgba${hdr?','+Color.titleToHDR(transfer):''},loop=loop=-1:size=1:start=0,trim=duration=${end}`;
    if(t.animation!=='none')vf+=`,fade=t=in:st=${start}:d=${fade}:alpha=1,fade=t=out:st=${end-fade}:d=${fade}:alpha=1`;
    graph.push(vf+`[title${i}]`);
    graph.push(`[${base}][title${i}]overlay=x='${pos.x}':y='${pos.y}':enable='gte(t,${start})*lt(t,${end})':eval=frame:eof_action=pass:repeatlast=0:format=${hdr?'yuv420p10':'auto'}[layer${i}]`);base=`layer${i}`;
  });
  let audioOutput=multi?'audio':'a0';const mixInputs=hasAudio?[audioOutput,...layerAudio]:[];let extraInput=clips.length+layers.length+overlays.length;
  for(const track of tracks){if(!AudioTracks.audible(track,mainTrack,tracks))continue;for(const c of track.clips){
    const at=AudioTracks.placement(c,clips),d=timeline.length(c);if(at>=length)continue;const asset=assets[c.assetId],label='extraAudio'+extraInput;
    args.push('-ss',String(c.start),'-t',String(Math.min(c.end-c.start,(length-at)*timeline.rate(c))),'-i',asset.path);
    let af=`[${extraInput++}:a:0]atrim=duration=${c.end-c.start},asetpts=PTS-STARTPTS,aresample=48000${timeline.tempoFilter(c)?','+timeline.tempoFilter(c):''},aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}`;
    if(c.link)af+=transitionAudioFilter(clips,clips.findIndex(p=>p.id===c.link.clipId),c.link.offset);
    const filter=Settings.audioFilter(c.audio,d);if(filter)af+=','+filter;af+=`,adelay=${Math.round(at*48000)}S:all=1,apad,atrim=duration=${length}[${label}]`;graph.push(af);mixInputs.push(label);
  }}
  if(mixInputs.length>1){graph.push(mixInputs.map(label=>`[${label}]`).join('')+`amix=inputs=${mixInputs.length}:normalize=0:duration=longest,aeval='if(lte(abs(val(ch)),0.9),val(ch),sgn(val(ch))*(0.9+0.1*tanh((abs(val(ch))-0.9)/0.1)))':c=same[mixedAudio]`);audioOutput='mixedAudio';}
  if(opts.captionPath){
    args.push('-threads','1','-f','concat','-safe','0','-i',opts.captionPath);
    graph.push(`[${extraInput}:v]fps=${rate},scale=${size.width}:${size.height},format=rgba${hdr?','+Color.titleToHDR(transfer):''}[captions]`);
    graph.push(`[${base}][captions]overlay=eof_action=pass:repeatlast=0:format=${hdr?'yuv420p10':'auto'}[captioned]`);base='captioned';
  }
  const range=ExportRange.normalize(opts.range,length,rate);
  if(range.enabled){graph.push(`[${base}]trim=start_frame=${range.first}:end_frame=${range.last},setpts=PTS-STARTPTS[rangedVideo]`);base='rangedVideo';if(hasAudio){graph.push(`[${audioOutput}]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[rangedAudio]`);audioOutput='rangedAudio';}}
  graph.push(`[${base}]format=${pixelFormat}${hdr?','+Color.outputMetadata(transfer):''}[out]`);args.push('-filter_complex',graph.join(';'),'-map','[out]');
  if(hasAudio)args.push('-map',`[${audioOutput}]`);
  args.push('-t',String(range.duration),...encodingArgs(hdr?(opts.hdrEncoder||'cpu'):(opts.encoder||'cpu'),opts.quality,{...size,fps:rate,hdr}),...(hdr?Color.outputArgs(transfer):[]),'-c:a','aac','-b:a','320k','-movflags','+faststart','-metadata:s:v:0','rotate=0','-progress','pipe:1','-nostats',output);return args;
}
module.exports={inspect,exportArgs};

const timeline = require('./timeline'),AudioTracks=require('./audio-tracks');
const {encodingArgs}=require('./encoding');
const Color=require('./color'),Settings=require('./clip-settings');
const Title=require('./title-model'),Animation=require('./animation'),{outputSize,frameRate}=require('./project');
function inspect(data) {
  const v=data.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);if(!v)throw new Error('الملف ما يحتوي على فيديو.');
  const rotation=Number(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation||v.tags?.rotate||0),rotated=Math.abs(rotation)%180===90;
  const duration=Number(data.format?.duration||v.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('تعذّر تحديد مدة الفيديو.');
  return {width:rotated?v.height:v.width,height:rotated?v.width:v.height,duration,fps:v.avg_frame_rate&&!['0','0/0'].includes(v.avg_frame_rate)?v.avg_frame_rate:v.r_frame_rate,codec:v.codec_name,color:Color.metadata(v),hdr:['smpte2084','arib-std-b67'].includes(v.color_transfer),audio:data.streams.some(s=>s.codec_type==='audio')};
}
function exportArgs(input,overlay,output,meta,opts){
  const assets=typeof input==='string'?null:input,clips=timeline.validate(meta,opts,assets),size=outputSize(meta,opts.resolution||'source'),rate=frameRate(meta.fps||'30');
  const source=c=>assets?assets[c.assetId]:{path:input,meta,kind:'video'};
  // Normalize a mixed timeline to the first HDR clip's transfer; never reduce it to 8-bit.
  const hdrSource=clips.map(c=>source(c)).find(a=>a.meta.hdr),hdr=!!hdrSource;
  const transfer=hdr?Color.input(hdrSource.meta).transfer:null,pixelFormat=hdr?'yuv420p10le':'yuv420p';
  const tracks=AudioTracks.validate(opts.audioTracks||[],assets||{},clips),mainTrack=AudioTracks.flags(opts.mainTrack);
  const length=timeline.duration(clips),multi=clips.length>1,hasAudio=clips.some(c=>source(c).kind!=='image'&&source(c).meta.audio)||tracks.some(t=>t.clips.length);
  const mainAudible=AudioTracks.audible(mainTrack,mainTrack,tracks);
  const entries=Array.isArray(overlay)?overlay:overlay?[{path:overlay,start:opts.titleStart??0,duration:opts.titleDuration??5}]:[];
  if(entries.length>24)throw new Error('الحد الحالي 24 نص.');
  const overlays=entries.map(t=>({path:t.path,animation:Animation.normalize(t.animation),...Title.timing(length,t.start,t.duration)})).filter(t=>t.duration>0);
  const args=['-hide_banner','-y','-filter_complex_threads','2'],graph=[];
  clips.forEach((clip,i)=>{
    const a=source(clip),d=clip.end-clip.start,fi=timeline.fadeLength(clips,i-1),fo=timeline.fadeLength(clips,i);
    if(a.kind==='image')args.push('-framerate',rate,'-i',a.path);
    else args.push('-ss',String(clip.start),'-t',String(d),'-i',a.path);
    const geometry=Settings.geometryFilter(a.meta,size,clip.transform);
    // A still needs one decode/resize, while video retains frame-accurate trimming.
    const color=hdr?Color.toHDR(a.meta,transfer,a.kind==='image')+',':'';
    const preparation=a.kind==='image'?`${color}${geometry},loop=loop=-1:size=1:start=0,trim=duration=${d},setpts=PTS-STARTPTS`:`trim=duration=${d},setpts=PTS-STARTPTS,${color}${geometry}`;
    let vf=`[${i}:v:0]${preparation},fps=${rate},settb=AVTB,format=${pixelFormat}`;
    if(fi)vf+=`,fade=t=in:st=0:d=${fi}`;if(fo)vf+=`,fade=t=out:st=${d-fo}:d=${fo}`;graph.push(vf+`[v${i}]`);
    if(hasAudio){
      let af=a.kind!=='image'&&a.meta.audio?`[${i}:a:0]atrim=duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}`:`anullsrc=r=48000:cl=stereo,atrim=duration=${d},asetpts=PTS-STARTPTS`;
      if(!mainAudible)af+=',volume=0';if(fi)af+=`,afade=t=in:st=0:d=${fi}`;if(fo)af+=`,afade=t=out:st=${d-fo}:d=${fo}`;const audio=Settings.audioFilter(clip.audio,d);if(audio)af+=','+audio;graph.push(af+`[a${i}]`);
    }
  });
  if(multi)graph.push(clips.map((_,i)=>`[v${i}]${hasAudio?`[a${i}]`:''}`).join('')+`concat=n=${clips.length}:v=1:a=${hasAudio?1:0}[vbase]${hasAudio?'[audio]':''}`);
  else graph.push('[v0]null[vbase]');
  let base='vbase';
  overlays.forEach((t,i)=>{
    args.push('-threads','1','-framerate',rate,'-i',t.path);
    const {start,end,fade}=t,pos=Animation.expressions(t.animation,t,size.width,size.height);
    // Decode and scale the still title once; repeat the exact pixels in memory.
    let vf=`[${clips.length+i}:v]scale=${size.width}:${size.height},format=rgba${hdr?','+Color.titleToHDR(transfer):''},loop=loop=-1:size=1:start=0,trim=duration=${end}`;
    if(t.animation!=='none')vf+=`,fade=t=in:st=${start}:d=${fade}:alpha=1,fade=t=out:st=${end-fade}:d=${fade}:alpha=1`;
    graph.push(vf+`[title${i}]`);
    graph.push(`[${base}][title${i}]overlay=x='${pos.x}':y='${pos.y}':enable='gte(t,${start})*lt(t,${end})':eval=frame:eof_action=pass:repeatlast=0:format=${hdr?'yuv420p10':'auto'}[layer${i}]`);base=`layer${i}`;
  });
  let audioOutput=multi?'audio':'a0';const mixInputs=hasAudio?[audioOutput]:[];let extraInput=clips.length+overlays.length;
  for(const track of tracks){if(!AudioTracks.audible(track,mainTrack,tracks))continue;for(const c of track.clips){
    const at=AudioTracks.placement(c,clips),d=c.end-c.start;if(at>=length)continue;const asset=assets[c.assetId],label='extraAudio'+extraInput;
    args.push('-ss',String(c.start),'-t',String(Math.min(d,length-at)),'-i',asset.path);
    let af=`[${extraInput++}:a:0]atrim=duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}`;
    if(c.link){const index=clips.findIndex(p=>p.id===c.link.clipId),parent=clips[index],fi=c.link.offset<1e-7?timeline.fadeLength(clips,index-1):0,fo=Math.abs(c.link.offset+d-(parent.end-parent.start))<1e-7?timeline.fadeLength(clips,index):0;if(fi)af+=`,afade=t=in:st=0:d=${fi}`;if(fo)af+=`,afade=t=out:st=${d-fo}:d=${fo}`;}
    const filter=Settings.audioFilter(c.audio,d);if(filter)af+=','+filter;af+=`,adelay=${Math.round(at*48000)}S:all=1,apad,atrim=duration=${length}[${label}]`;graph.push(af);mixInputs.push(label);
  }}
  if(mixInputs.length>1){graph.push(mixInputs.map(label=>`[${label}]`).join('')+`amix=inputs=${mixInputs.length}:normalize=0:duration=longest,aeval='if(lte(abs(val(ch)),0.9),val(ch),sgn(val(ch))*(0.9+0.1*tanh((abs(val(ch))-0.9)/0.1)))':c=same[mixedAudio]`);audioOutput='mixedAudio';}
  graph.push(`[${base}]format=${pixelFormat}${hdr?','+Color.outputMetadata(transfer):''}[out]`);args.push('-filter_complex',graph.join(';'),'-map','[out]');
  if(hasAudio)args.push('-map',`[${audioOutput}]`);
  args.push('-t',String(length),...encodingArgs(hdr?(opts.hdrEncoder||'cpu'):(opts.encoder||'cpu'),opts.quality,{...size,fps:rate,hdr}),...(hdr?Color.outputArgs(transfer):[]),'-c:a','aac','-b:a','320k','-movflags','+faststart','-metadata:s:v:0','rotate=0','-progress','pipe:1','-nostats',output);return args;
}
module.exports={inspect,exportArgs};

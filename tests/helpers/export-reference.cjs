// Frozen pre-optimization renderer: used only to compare decoded output in regression tests.
const timeline = require('../../app/timeline');
const {encodingArgs}=require('../../app/encoding');
const Title=require('../../app/title-model'),Animation=require('../../app/animation'),{outputSize,frameRate}=require('../../app/project');
function inspect(data) {
  const v=data.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);if(!v)throw new Error('الملف ما يحتوي على فيديو.');
  const rotation=Number(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation||v.tags?.rotate||0),rotated=Math.abs(rotation)%180===90;
  const duration=Number(data.format?.duration||v.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('تعذّر تحديد مدة الفيديو.');
  return {width:rotated?v.height:v.width,height:rotated?v.width:v.height,duration,fps:v.avg_frame_rate&&!['0','0/0'].includes(v.avg_frame_rate)?v.avg_frame_rate:v.r_frame_rate,codec:v.codec_name,hdr:['smpte2084','arib-std-b67'].includes(v.color_transfer),audio:data.streams.some(s=>s.codec_type==='audio')};
}
function exportArgs(input,overlay,output,meta,opts){
  const assets=typeof input==='string'?null:input,clips=timeline.validate(meta,opts,assets),size=outputSize(meta,opts.resolution||'source'),rate=frameRate(meta.fps||'30');
  const source=c=>assets?assets[c.assetId]:{path:input,meta,kind:'video'};
  if(clips.some(c=>source(c).meta.hdr))throw new Error('هذا الفيديو HDR. هذه النسخة تدعم SDR فقط حتى لا تتغيّر ألوانه بصمت.');
  const length=timeline.duration(clips),multi=clips.length>1,hasAudio=clips.some(c=>source(c).kind!=='image'&&source(c).meta.audio);
  const entries=Array.isArray(overlay)?overlay:overlay?[{path:overlay,start:opts.titleStart??0,duration:opts.titleDuration??5}]:[];
  if(entries.length>24)throw new Error('الحد الحالي 24 نص.');
  const overlays=entries.map(t=>({path:t.path,animation:Animation.normalize(t.animation),...Title.timing(length,t.start,t.duration)})).filter(t=>t.duration>0);
  const args=['-hide_banner','-y','-filter_complex_threads','2'],graph=[];
  clips.forEach((clip,i)=>{
    const a=source(clip),d=clip.end-clip.start,fi=timeline.fadeLength(clips,i-1),fo=timeline.fadeLength(clips,i);
    if(a.kind==='image')args.push('-loop','1','-framerate',rate,'-t',String(d),'-i',a.path);
    else args.push('-ss',String(clip.start),'-t',String(d),'-i',a.path);
    let vf=`[${i}:v:0]trim=duration=${d},setpts=PTS-STARTPTS,scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${rate},settb=AVTB,format=yuv420p`;
    if(fi)vf+=`,fade=t=in:st=0:d=${fi}`;if(fo)vf+=`,fade=t=out:st=${d-fo}:d=${fo}`;graph.push(vf+`[v${i}]`);
    if(hasAudio){
      let af=a.kind!=='image'&&a.meta.audio?`[${i}:a:0]atrim=duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}`:`anullsrc=r=48000:cl=stereo,atrim=duration=${d},asetpts=PTS-STARTPTS`;
      if(fi)af+=`,afade=t=in:st=0:d=${fi}`;if(fo)af+=`,afade=t=out:st=${d-fo}:d=${fo}`;graph.push(af+`[a${i}]`);
    }
  });
  if(multi)graph.push(clips.map((_,i)=>`[v${i}]${hasAudio?`[a${i}]`:''}`).join('')+`concat=n=${clips.length}:v=1:a=${hasAudio?1:0}[vbase]${hasAudio?'[audio]':''}`);
  else graph.push('[v0]null[vbase]');
  let base='vbase';
  overlays.forEach((t,i)=>{
    args.push('-threads','1','-loop','1','-framerate',rate,'-i',t.path);
    const {start,end,fade}=t,pos=Animation.expressions(t.animation,t,size.width,size.height);
    let vf=`[${clips.length+i}:v]scale=${size.width}:${size.height},format=rgba`;
    if(t.animation!=='none')vf+=`,fade=t=in:st=${start}:d=${fade}:alpha=1,fade=t=out:st=${end-fade}:d=${fade}:alpha=1`;
    graph.push(vf+`[title${i}]`);
    graph.push(`[${base}][title${i}]overlay=x='${pos.x}':y='${pos.y}':enable='gte(t,${start})*lt(t,${end})':eval=frame:eof_action=pass:shortest=1:format=auto[layer${i}]`);base=`layer${i}`;
  });
  graph.push(`[${base}]format=yuv420p[out]`);args.push('-filter_complex',graph.join(';'),'-map','[out]');
  if(hasAudio)args.push('-map',multi?'[audio]':'[a0]');
  args.push('-t',String(length),...encodingArgs(opts.encoder||'cpu',opts.quality,{...size,fps:rate}),'-c:a','aac','-b:a','320k','-movflags','+faststart','-metadata:s:v:0','rotate=0','-progress','pipe:1','-nostats',output);return args;
}
module.exports={inspect,exportArgs};

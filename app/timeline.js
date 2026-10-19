(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./clip-settings'));else root.SahlTimeline=factory(root.SahlClipSettings);})(typeof globalThis!=='undefined'?globalThis:this,function(Settings){
  const uid=()=>globalThis.crypto?.randomUUID?.()||'clip-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  function ids(clips){const used=new Set();return clips.map((c,i)=>{const id=c.id??'main-'+i;if(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id)||used.has(id))throw new Error('معرّف قطعة مكرر أو غير صالح.');used.add(id);return {...c,id};});}
  function rate(c){return c?.freeze?1:c?.speed??1;}
  function length(c){return c.freeze?c.freeze.duration:(c.end-c.start)/rate(c);}
  function sourceTime(c,local){return c.freeze?c.freeze.time:c.start+Math.max(0,Math.min(length(c),local))*rate(c);}
  function requested(c){return c.transitionDuration??(c.transition==='crossfade'?.5:.35);}
  function boundaryLength(clips,i){return i<0||i>=clips.length-1||!['fade','crossfade'].includes(clips[i].transition)?0:Math.min(requested(clips[i]),length(clips[i])/2,length(clips[i+1])/2);}
  function overlap(clips,i){return clips[i]?.transition==='crossfade'?boundaryLength(clips,i):0;}
  function fadeLength(clips,i){return clips[i]?.transition==='fade'?boundaryLength(clips,i):0;}
  function starts(clips){let at=0;return clips.map((c,i)=>{const start=at;at+=length(c)-overlap(clips,i);return start;});}
  function startAt(clips,i){return starts(clips)[i]??0;}
  function duration(clips){return clips.reduce((n,c,i)=>n+length(c)-overlap(clips,i),0);}
  function active(clips,t){const offsets=starts(clips);return clips.flatMap((c,i)=>{const local=t-offsets[i],d=length(c);return local>=-1e-7&&(local<d-1e-7||i===clips.length-1&&t>=duration(clips))?[{index:i,offset:offsets[i],local:Math.max(0,Math.min(d,local)),source:sourceTime(c,local)}]:[];});}
  function locate(clips,t){return active(clips,Math.max(0,t)).at(-1)||null;}
  function visualGain(clips,i,t){const local=t-startAt(clips,i),d=length(clips[i]),fi=fadeLength(clips,i-1),fo=fadeLength(clips,i);return Math.max(0,Math.min(1,fi?local/fi:1,fo?(d-local)/fo:1));}
  function gain(clips,t){const at=locate(clips,t);return at?visualGain(clips,at.index,t):1;}
  function audioMode(c){return c?.audioTransition??'auto';}
  function audioGain(clips,i,t){const at=startAt(clips,i),local=t-at,d=length(clips[i]);if(local<0||local>=d||clips[i].freeze)return 0;let g=1;
    for(const [b,incoming]of [[i-1,true],[i,false]]){const n=boundaryLength(clips,b);if(!n)continue;const c=clips[b],mode=audioMode(c);if(c.transition==='crossfade'){const start=startAt(clips,b+1),u=Math.max(0,Math.min(1,(t-start)/n));g*=mode==='cut'?(incoming?Number(u>=.5):Number(u<.5)):(incoming?u:1-u);}else if(mode!=='cut')g*=Math.max(0,Math.min(1,incoming?local/n:(d-local)/n));}
    return g;
  }
  function split(clips,t,min=.1){if(active(clips,t).length>1)return null;const at=locate(clips,t);if(!at)return null;const c=clips[at.index],d=length(c);if(at.local<min-1e-6||d-at.local<min-1e-6||overlap(clips,at.index-1)>at.local/2+1e-7||overlap(clips,at.index)>(d-at.local)/2+1e-7)return null;
    const left={...c,transition:'none',...(c.audio?{audio:{...c.audio,fadeOut:0}}:{})},right={...c,...(c.id?{id:uid(),splitFrom:c.id}:{}),...(c.audio?{audio:{...c.audio,fadeIn:0}}:{})};
    if(c.freeze){left.freeze={...c.freeze,duration:at.local};right.freeze={...c.freeze,duration:d-at.local};right.splitOffset=at.local;}else{left.end=at.source;right.start=at.source;}
    const next=clips.map(x=>({...x}));next.splice(at.index,1,left,right);return {clips:next,index:at.index+1};
  }
  function remove(clips,index){if(index<0||index>=clips.length)return clips;const next=clips.map(c=>({...c}));next.splice(index,1);if(index>0&&next[index-1])next[index-1].transition='none';if(next.length)next.at(-1).transition='none';return next;}
  function canInsert(clips,time){const at=locate(clips,time);return active(clips,time).length<=1&&(!at||at.local<.1||length(clips[at.index])-at.local<.1||!!split(clips,time));}
  function insert(clips,clip,time){if(!canInsert(clips,time))throw new Error('حرّك المؤشر خارج التداخل قبل إدخال قطعة.');let next=clips.map(c=>({...c})),index=0;const at=locate(next,time);if(at){const d=length(next[at.index]);if(at.local<.1)index=at.index;else if(d-at.local<.1)index=at.index+1;else{const cut=split(next,time);next=cut.clips;index=cut.index;}}next.splice(index,0,{...clip,transition:index<next.length?'fade':'none'});if(index>0)next[index-1].transition='fade';return {clips:next,index};}
  function motion(c){if(c.speed!==undefined&&(typeof c.speed!=='number'||!Number.isFinite(c.speed)||c.speed<.25||c.speed>4))throw new Error('السرعة لازم تكون بين 0.25 و4.');if(c.preservePitch!==undefined&&typeof c.preservePitch!=='boolean')throw new Error('إعداد نبرة الصوت غير صالح.');return {...(c.speed!==undefined?{speed:c.speed}:{}),...(c.preservePitch!==undefined?{preservePitch:c.preservePitch}:{})};}
  function tempoFilter(c){let n=rate(c);if(n===1)return '';if(c.preservePitch===false)return `asetrate=48000*${n},aresample=48000`;const parts=[];while(n<.5){parts.push('atempo=0.5');n/=.5;}while(n>2){parts.push('atempo=2');n/=2;}parts.push('atempo='+n);return parts.join(',');}
  function validate(meta,opts,assets){const clips=opts.clips===undefined?[{start:Number(opts.start),end:Number(opts.end),transition:'none'}]:opts.clips;if(!Array.isArray(clips)||!clips.length||clips.length>64)throw new Error('أضف قطعة فيديو واحدة على الأقل؛ الحد الحالي 64 قطعة.');
    return ids(clips).map(c=>{const asset=assets?.[c.assetId];if(assets&&!asset)throw new Error('ملف من ملفات المشروع مفقود.');if(asset?.kind==='audio')throw new Error('أضف الصوت إلى مسار صوت مستقل.');const kind=asset?.kind||c.kind||'video',limit=kind==='image'?86400:(asset?.meta||meta).duration;
      if(typeof c.start!=='number'||typeof c.end!=='number'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>limit+.01||c.end-c.start<.099*rate(c))throw new Error('حدد بداية ونهاية صحيحة للقص.');const timing=motion(c);
      if(c.transition&&!['none','fade','crossfade'].includes(c.transition))throw new Error('انتقال غير صالح.');if(c.transitionDuration!==undefined&&(typeof c.transitionDuration!=='number'||!Number.isFinite(c.transitionDuration)||c.transitionDuration<.01||c.transitionDuration>10))throw new Error('مدة الانتقال بين 0.01 و10 ثوانٍ.');if(c.audioTransition!==undefined&&!['auto','fade','cut'].includes(c.audioTransition))throw new Error('انتقال الصوت غير صالح.');
      let freeze;if(c.freeze){const f=c.freeze;if(kind!=='video'||typeof f.time!=='number'||!Number.isFinite(f.time)||f.time<0||f.time>=limit||typeof f.duration!=='number'||!Number.isFinite(f.duration)||f.duration<.1||f.duration>86400)throw new Error('إطار التجميد أو مدته غير صالح.');freeze={time:f.time,duration:f.duration};}
      if(!freeze&&(c.end-c.start)/rate(c)<.099)throw new Error('القطعة بعد تغيير السرعة أقصر من 0.1 ثانية.');
      return {id:c.id,start:c.start,end:c.end,transition:c.transition||'none',...timing,...(freeze?{freeze}:{}),...(c.transitionDuration!==undefined?{transitionDuration:c.transitionDuration}:{}),...(c.audioTransition!==undefined?{audioTransition:c.audioTransition}:{}),...(c.audio!==undefined?{audio:Settings.audio(c.audio)}:{}),...(c.transform!==undefined?{transform:Settings.transform(c.transform)}:{}),...(assets?{assetId:c.assetId,kind}:c.assetId?{assetId:c.assetId,kind}: {})};
    });
  }
  return {ids,uid,rate,length,sourceTime,requested,boundaryLength,overlap,starts,startAt,duration,active,locate,split,remove,fadeLength,gain,visualGain,audioGain,audioMode,canInsert,insert,motion,tempoFilter,validate};
});

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./clip-settings'),require('./timeline'));else root.SahlAudioTracks=factory(root.SahlClipSettings,root.SahlTimeline);})(typeof globalThis!=='undefined'?globalThis:this,function(Settings,TL){
  const uid=()=>globalThis.crypto?.randomUUID?.()||'item-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const validId=id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id);
  function number(n,min=0,max=86400){if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error('توقيت المسار غير صالح.');return n;}
  function flags(value={}){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('إعداد المسار غير صالح.');for(const k of ['muted','solo','locked'])if(value[k]!==undefined&&typeof value[k]!=='boolean')throw new Error('إعداد المسار غير صالح.');return {muted:value.muted===true,solo:value.solo===true,locked:value.locked===true};}
  function offsets(clips){const times=TL.starts(clips);return new Map(clips.map((clip,i)=>[clip.id,{clip,at:times[i]}]));}
  function placement(c,clips){if(!c.link)return c.at;const parent=offsets(clips).get(c.link.clipId);if(!parent)throw new Error('القطعة المرتبطة بالصوت مفقودة.');return parent.at+c.link.offset;}
  function validate(value=[],assets,clips=[]){
    if(!Array.isArray(value)||value.length>8)throw new Error('الحد الحالي 8 مسارات صوت.');const ids=new Set(),parents=offsets(clips);let count=0;
    const id=(value,fallback)=>{value??=fallback;if(!validId(value)||ids.has(value))throw new Error('معرّف مسار أو قطعة صوت مكرر أو غير صالح.');ids.add(value);return value;};
    return value.map((track,i)=>{
      if(!track||!Array.isArray(track.clips))throw new Error('مسار صوت غير صالح.');const trackId=id(track.id,'audio-track-'+i);
      return {id:trackId,name:String(track.name||'مسار صوت '+(i+1)).slice(0,80),...flags(track),clips:track.clips.map((c,j)=>{
        if(++count>64)throw new Error('الحد الحالي 64 قطعة صوت.');if(!c||c.freeze||typeof c.assetId!=='string')throw new Error('قطعة صوت غير صالحة.');
        const a=assets?.[c.assetId],duration=a?.meta?.duration??a?.duration;if(assets&&(!a||a.kind==='image'||!(a.meta?.audio??a.audio??a.kind==='audio')))throw new Error('ملف الصوت مفقود أو لا يحتوي صوتاً.');
        const start=number(c.start),end=number(c.end),at=number(c.at);if(end-start<.099*TL.rate(c)||assets&&end>duration+.01)throw new Error('حدود قص الصوت غير صالحة.');
        const timing=TL.motion(c);if(TL.length(c)<.099)throw new Error('قطعة الصوت أقصر من 0.1 ثانية.');let link;if(c.link){const p=parents.get(c.link.clipId);if(!p||p.clip.freeze||p.clip.assetId!==c.assetId)throw new Error('ربط الصوت بالقطعة غير صالح.');link={clipId:c.link.clipId,offset:number(c.link.offset)};if(link.offset+TL.length(c)>TL.length(p.clip)+.01||Math.abs(TL.rate(c)-TL.rate(p.clip))>1e-7)throw new Error('الصوت المرتبط يتجاوز مدة الفيديو؛ فك الربط حتى تمدده أو تحركه بحرية.');}
        const audio=Settings.audio(c.audio),clean={id:id(c.id,trackId+'-clip-'+j),assetId:c.assetId,start,end,at,audio,...timing,...(link?{link}:{})};
        clean.at=placement(clean,clips);number(clean.at);return clean;
      })};
    });
  }
  function audible(track,main,tracks){const solo=main.solo||tracks.some(t=>t.solo);return !track.muted&&(!solo||track.solo===true);}
  // Reconcile only linked material. Absolute-time music and titles remain fixed.
  function reconcile(before,after,tracks,titles){
    const previous=offsets(before),next=offsets(after);
    const result=tracks.map(track=>({...track,clips:track.clips.flatMap(c=>{
      if(!c.link)return [c];const parent=previous.get(c.link.clipId);if(!parent)return next.has(c.link.clipId)?[{...c,at:placement(c,after)}]:[];
      const children=after.filter(p=>p.id===c.link.clipId||p.splitFrom===c.link.clipId);let pieces=[];
      for(const child of children){if(child.freeze)continue;const oldRate=TL.rate(parent.clip),newRate=TL.rate(child),delta=child.start-parent.clip.start,begin=c.link.offset*oldRate,span=TL.length(c)*oldRate,left=Math.max(0,delta-begin),right=Math.min(span,child.end-parent.clip.start-begin);
        if((right-left)/newRate<.099)continue;const offset=Math.max(0,(begin+left-delta)/newRate),audio={...c.audio};if(left>1e-7)audio.fadeIn=0;if(right<span-1e-7)audio.fadeOut=0;
        pieces.push({...c,id:pieces.length?uid():c.id,start:c.start+left/oldRate*TL.rate(c),end:c.start+right/oldRate*TL.rate(c),at:next.get(child.id).at+offset,audio,...(newRate!==1||c.speed!==undefined?{speed:newRate}:{}),...(child.preservePitch!==undefined?{preservePitch:child.preservePitch}:{}),link:{clipId:child.id,offset}});
      }
      return pieces;
    })}));
    const text=titles.flatMap(t=>{
      if(!t.link)return [t];const old=previous.get(t.link.clipId),source=(old?.clip.start||0)+t.link.offset*TL.rate(old?.clip),children=after.filter(c=>c.id===t.link.clipId||c.splitFrom===t.link.clipId);
      const child=old?.clip.freeze?children.find(c=>t.link.offset>=(c.splitOffset||0)&&t.link.offset<(c.splitOffset||0)+TL.length(c)):children.find(c=>source>=c.start&&source<c.end),parent=child?next.get(child.id):next.get(t.link.clipId);if(!parent)return [];
      const offset=old?.clip.freeze?Math.max(0,t.link.offset-(parent.clip.splitOffset||0)-(parent.clip.trimOffset||0)):Math.max(0,(t.link.offset*TL.rate(old?.clip)-(old?parent.clip.start-old.clip.start:0))/TL.rate(parent.clip));
      return [{...t,titleDuration:Math.max(.1,Math.min(86400,t.titleDuration*TL.rate(old?.clip)/TL.rate(parent.clip))),titleStart:parent.at+offset,link:{clipId:parent.clip.id,offset}}];
    });
    return {tracks:result,titles:text};
  }
  function markers(value=[]){if(!Array.isArray(value)||value.length>256)throw new Error('الحد الحالي 256 علامة.');const seen=new Set();return value.map((m,i)=>{const id=m.id??'marker-'+i;if(!validId(id)||seen.has(id))throw new Error('معرّف علامة غير صالح.');seen.add(id);return {id,time:number(m.time),name:String(m.name||'علامة').slice(0,80)};}).sort((a,b)=>a.time-b.time);}
  function snap(time,points,tolerance,rate=30){let result=time,distance=tolerance;for(const p of points){const d=Math.abs(p-time);if(d<=distance){result=p;distance=d;}}return Math.max(0,Math.round(result*rate)/rate);}
  function rippleTime(time,ranges){let removed=0;for(const [start,end]of ranges){if(time>=end)removed+=end-start;else if(time>start)return start-removed;}return time-removed;}
  function assetIds(raw){return [...new Set([...(raw.assetIds||[]),...(raw.clips||[]).map(c=>c.assetId),...(raw.layers||[]).map(c=>c.assetId),...(raw.audioTracks||[]).flatMap(t=>t.clips.map(c=>c.assetId))])];}
  return {uid,validId,flags,offsets,placement,validate,audible,reconcile,markers,snap,rippleTime,assetIds};
});

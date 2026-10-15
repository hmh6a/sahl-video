(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SahlTimeline = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function duration(clips) { return clips.reduce((n,c)=>n+c.end-c.start,0); }
  function locate(clips, t) {
    let offset=0;
    for(let i=0;i<clips.length;i++) {
      const length=clips[i].end-clips[i].start;
      if(t<offset+length-1e-7 || i===clips.length-1) return {index:i,offset,local:Math.max(0,Math.min(length,t-offset)),source:clips[i].start+Math.max(0,Math.min(length,t-offset))};
      offset+=length;
    }
    return null;
  }
  function split(clips,t,min=.1) {
    const at=locate(clips,t);if(!at)return null;
    const c=clips[at.index];
    if(at.source-c.start<min-1e-6||c.end-at.source<min-1e-6)return null;
    const next=clips.map(x=>({...x}));
    next.splice(at.index,1,{...c,end:at.source,transition:'none'},{...c,start:at.source});
    return {clips:next,index:at.index+1};
  }
  function remove(clips,index) {
    if(index<0||index>=clips.length)return clips;
    const next=clips.map(x=>({...x}));next.splice(index,1);
    if(index>0&&next[index-1])next[index-1].transition='none';
    if(next.length)next[next.length-1].transition='none';
    return next;
  }
  function fadeLength(clips,boundary) {
    if(boundary<0||boundary>=clips.length-1||clips[boundary].transition!=='fade')return 0;
    return Math.min(.35,(clips[boundary].end-clips[boundary].start)/2,(clips[boundary+1].end-clips[boundary+1].start)/2);
  }
  function gain(clips,t) {
    const at=locate(clips,t);if(!at)return 1;
    const d=clips[at.index].end-clips[at.index].start,fi=fadeLength(clips,at.index-1),fo=fadeLength(clips,at.index);
    return Math.max(0,Math.min(1,fi?at.local/fi:1,fo?(d-at.local)/fo:1));
  }
  function insert(clips,clip,time){
    let next=clips.map(c=>({...c})),index=0;const at=locate(next,time);
    if(at){const c=next[at.index],d=c.end-c.start;
      if(at.local<.1)index=at.index;
      else if(d-at.local<.1)index=at.index+1;
      else{const cut=split(next,time);next=cut.clips;index=cut.index;}
    }
    next.splice(index,0,{...clip,transition:index<next.length?'fade':'none'});
    if(index>0)next[index-1].transition='fade';
    return {clips:next,index};
  }
  function validate(meta,opts,assets) {
    const clips=opts.clips===undefined?[{start:Number(opts.start),end:Number(opts.end),transition:'none'}]:opts.clips;
    if(!Array.isArray(clips)||!clips.length||clips.length>64)throw new Error('أضف قطعة فيديو واحدة على الأقل؛ الحد الحالي 64 قطعة.');
    return clips.map(c=>{
      const asset=assets?.[c.assetId];if(assets&&!asset)throw new Error('ملف من ملفات المشروع مفقود.');
      const kind=asset?.kind||'video',limit=kind==='image'?86400:(asset?.meta||meta).duration;
      if(typeof c.start!=='number'||typeof c.end!=='number'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>limit+.01||c.end-c.start<.099)throw new Error('حدد بداية ونهاية صحيحة للقص.');
      if(c.transition&&!['none','fade'].includes(c.transition))throw new Error('انتقال غير صالح.');
      return {start:c.start,end:c.end,transition:c.transition||'none',...(assets?{assetId:c.assetId,kind}:c.assetId?{assetId:c.assetId,kind:c.kind||'video'}:{})};
    });
  }
  return {duration,locate,split,remove,fadeLength,gain,validate,insert};
});

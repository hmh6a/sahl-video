(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlTitles=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const positions=['top-left','top-center','top-right','middle-left','middle-center','middle-right','left','center','right','custom'];
  let serial=0;
  const id=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'text-'+Date.now()+'-'+(++serial);
  function create(s={}){
    const number=(key,fallback,min,max)=>Number.isFinite(Number(s[key]))?Math.max(min,Math.min(max,Number(s[key]))):fallback;
    if(s.link&&(!/^[\w-]{1,80}$/.test(s.link.clipId)||!Number.isFinite(s.link.offset)||s.link.offset<0||s.link.offset>86400))throw new Error('ربط النص غير صالح.');
    return {...(s.link?{link:{clipId:s.link.clipId,offset:s.link.offset}}:{}),id:typeof s.id==='string'?s.id:id(),title:String(s.title??'عنوان جديد').slice(0,120),subtitle:String(s.subtitle??'').slice(0,160),animation:['fade','none','slide-left','slide-right','slide-up','slide-down'].includes(s.animation)?s.animation:'fade',template:['gaming','minimal','card','banner','outline','neon','label','cinema'].includes(s.template)?s.template:'gaming',position:positions.includes(s.position)?s.position:'left',font:String(s.font||'auto'),weight:s.weight==='400'?'400':'700',accent:/^#[0-9a-f]{6}$/i.test(s.accent||'')?s.accent:'#f3be19',size:[.8,1,1.2].includes(Number(s.size))?Number(s.size):1,titleStart:number('titleStart',0,0,86400),titleDuration:number('titleDuration',5,.1,86400),textX:number('textX',6,0,100),textY:number('textY',80,0,100),enabled:s.enabled!==false};
  }
  function normalize(items){if(!Array.isArray(items)||items.length>24)throw new Error('القالب يدعم لحد 24 نص.');const seen=new Set();return items.map(s=>{const t=create(s);if(seen.has(t.id))t.id=id();seen.add(t.id);return t;});}
  function preset(name,items){if(!String(name||'').trim())throw new Error('اكتب اسم للقالب.');return {id:id(),version:2,name:String(name).trim().slice(0,80),titles:normalize(items).map(t=>{delete t.link;return t;})};}
  function anchor(position,bw,bh,w,h){
    const col=position==='left'||position.endsWith('-left')?'left':position==='right'||position.endsWith('-right')?'right':'center';
    const row=position.startsWith('top-')?'top':position.startsWith('middle-')?'middle':'bottom';
    return {x:col==='left'?w*.06:col==='right'?w*.94-bw:(w-bw)/2,y:row==='top'?h*.05:row==='middle'?(h-bh)/2:h*.95-bh};
  }
  return {create,normalize,preset,anchor,positions};
});

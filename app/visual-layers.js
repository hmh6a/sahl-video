(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./clip-settings'));else root.SahlLayers=factory(root.SahlClipSettings);})(typeof globalThis!=='undefined'?globalThis:this,function(Settings){
  function number(value,fallback,min,max){const n=value===undefined?fallback:Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new Error('قيمة من خصائص الطبقة خارج المدى.');return n;}
  function validate(raw=[],assets={}){
    if(!Array.isArray(raw)||raw.length>8)throw new Error('الحد الحالي 8 طبقات صور وفيديو.');const ids=new Set();
    return raw.map(c=>{if(!c||typeof c.id!=='string'||!/^[-\w]{1,80}$/.test(c.id)||ids.has(c.id))throw new Error('معرّف الطبقة غير صالح.');ids.add(c.id);const a=assets[c.assetId];if(!a||!['image','video'].includes(a.kind))throw new Error('مصدر الطبقة مفقود أو مو صورة وفيديو.');
      const start=number(c.start,0,0,86400),end=number(c.end,a.kind==='image'?5:a.meta.duration,.1,86400);if(end-start<.099||a.kind==='video'&&end>a.meta.duration+.001)throw new Error('قص الطبقة خارج مدة المصدر.');
      return {id:c.id,assetId:c.assetId,at:number(c.at,0,0,86400),start,end,x:number(c.x,50,-100,200),y:number(c.y,50,-100,200),width:number(c.width,25,1,200),height:number(c.height,25,1,200),rotation:number(c.rotation,0,-180,180),opacity:number(c.opacity,1,0,1),fit:c.fit==='cover'?'cover':'contain',hidden:c.hidden===true,locked:c.locked===true,audio:Settings.audio(c.audio)};
    });
  }
  const active=(layers,t)=>layers.filter(c=>!c.hidden&&t>=c.at&&t<c.at+c.end-c.start);
  function geometry(c,size){const even=n=>Math.max(2,Math.round(n/2)*2);return {width:even(size.width*c.width/100),height:even(size.height*c.height/100),x:size.width*c.x/100,y:size.height*c.y/100,radians:c.rotation*Math.PI/180};}
  function filter(c,size){const g=geometry(c,size);return `scale=${g.width}:${g.height}:force_original_aspect_ratio=${c.fit==='cover'?'increase':'decrease'},${c.fit==='cover'?`crop=${g.width}:${g.height}`:`pad=${g.width}:${g.height}:(ow-iw)/2:(oh-ih)/2:color=black@0`}${c.rotation?`,rotate=${g.radians}:ow=rotw(${g.radians}):oh=roth(${g.radians}):c=black@0`:''}`;}
  return {validate,active,geometry,filter};
});

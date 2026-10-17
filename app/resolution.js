(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlResolution=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const presets=[{value:'4320',label:'8K — 4320p'},{value:'2160',label:'4K — 2160p'},{value:'1440',label:'2K — 1440p'},{value:'1080',label:'Full HD — 1080p'},{value:'720',label:'HD — 720p'},{value:'480',label:'480p'},{value:'360',label:'360p'},{value:'240',label:'240p'}];
  function outputSize(meta,resolution='source'){
    if(resolution==='source')return {width:Math.ceil(meta.width/2)*2,height:Math.ceil(meta.height/2)*2};
    if(!presets.some(p=>p.value===String(resolution)))throw new Error('اختار دقة تصدير صحيحة.');
    const short=Number(resolution),original=Math.min(meta.width,meta.height);
    if(short>original)throw new Error('دقة التصدير ما يصير تكون أعلى من دقة الفيديو الأصلية.');
    const scale=short/original;
    return {width:Math.max(2,Math.round(meta.width*scale/2)*2),height:Math.max(2,Math.round(meta.height*scale/2)*2)};
  }
  function choices(meta){
    const original={value:'source',label:'نفس دقة المشروع (الأصل)'};
    if(!meta)return [original];
    original.label+=` — \u2066${meta.width} × ${meta.height}\u2069`;
    return [original,...presets.filter(p=>Number(p.value)<Math.min(meta.width,meta.height))];
  }
  // Old projects may have saved an upscale, or a duplicate of the source size.
  function restore(meta,value='source'){
    const resolution=String(value);
    return meta&&presets.some(p=>p.value===resolution)&&Number(resolution)>=Math.min(meta.width,meta.height)?'source':resolution;
  }
  return {outputSize,choices,restore};
});

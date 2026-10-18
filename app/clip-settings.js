(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlClipSettings=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function number(value,fallback,min,max,label){
    if(value===undefined)return fallback;
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(label+' خارج النطاق المسموح.');
    return value;
  }
  function flag(value){if(value!==undefined&&typeof value!=='boolean')throw new Error('إعداد القطعة غير صالح.');return value===true;}
  function object(value){if(value===undefined)return {};if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('إعداد القطعة غير صالح.');return value;}
  function audio(value){const a=object(value);return {volume:number(a.volume,1,0,2,'مستوى الصوت'),muted:flag(a.muted),fadeIn:number(a.fadeIn,0,0,86400,'تلاشي الصوت'),fadeOut:number(a.fadeOut,0,0,86400,'تلاشي الصوت')};}
  function transform(value){const t=object(value),rotation=t.rotation??0;if(![0,90,180,270].includes(rotation))throw new Error('دوران غير صالح.');if(t.fit!==undefined&&!['contain','cover'].includes(t.fit))throw new Error('وضع صورة غير صالح.');return {fit:t.fit||'contain',zoom:number(t.zoom,1,.25,4,'التكبير'),x:number(t.x,0,-50,50,'المكان الأفقي'),y:number(t.y,0,-50,50,'المكان العمودي'),rotation,flipX:flag(t.flipX),flipY:flag(t.flipY)};}
  function fades(value,duration){const a=audio(value);return {fadeIn:Math.min(a.fadeIn,duration/2),fadeOut:Math.min(a.fadeOut,duration/2)};}
  function gain(value,local,duration){const a=audio(value),f=fades(a,duration);return a.muted?0:a.volume*Math.max(0,Math.min(1,f.fadeIn?local/f.fadeIn:1))*Math.max(0,Math.min(1,f.fadeOut?(duration-local)/f.fadeOut:1));}
  // A soft ceiling leaves quiet samples unchanged and prevents digital overflow.
  function limit(sample){const a=Math.abs(sample);return a<=.9?sample:Math.sign(sample)*(.9+.1*Math.tanh((a-.9)/.1));}
  function audioFilter(value,duration){const a=audio(value),f=fades(a,duration),filters=[];
    if(a.muted||a.volume!==1)filters.push('volume='+(a.muted?0:a.volume));
    if(f.fadeIn)filters.push(`afade=t=in:st=0:d=${f.fadeIn}`);
    if(f.fadeOut)filters.push(`afade=t=out:st=${duration-f.fadeOut}:d=${f.fadeOut}`);
    if(a.volume>1&&!a.muted)filters.push("aeval='if(lte(abs(val(ch)),0.9),val(ch),sgn(val(ch))*(0.9+0.1*tanh((abs(val(ch))-0.9)/0.1)))':c=same");
    return filters.join(',');
  }
  function identity(value){const t=transform(value);return t.fit==='contain'&&t.zoom===1&&!t.x&&!t.y&&!t.rotation&&!t.flipX&&!t.flipY;}
  function geometry(source,size,value){const t=transform(value),sw=t.rotation%180?source.height:source.width,sh=t.rotation%180?source.width:source.height;
    const ratio=(t.fit==='cover'?Math.max:Math.min)(size.width/sw,size.height/sh)*t.zoom;
    const even=n=>Math.max(2,Math.round(n/2)*2),width=even(sw*ratio),height=even(sh*ratio);
    const left=Math.round(((size.width-width)/2+t.x/100*size.width)/2)*2,top=Math.round(((size.height-height)/2+t.y/100*size.height)/2)*2;
    return {width,height,left,top,rotation:t.rotation,flipX:t.flipX,flipY:t.flipY};
  }
  function geometryFilter(source,size,value){
    // Preserve the original pipeline exactly for legacy/default clips.
    if(identity(value))return `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    const g=geometry(source,size,value),filters=[];
    if(g.rotation===90)filters.push('transpose=clock');else if(g.rotation===180)filters.push('hflip','vflip');else if(g.rotation===270)filters.push('transpose=cclock');
    if(g.flipX)filters.push('hflip');if(g.flipY)filters.push('vflip');
    const x=Math.max(0,g.left),y=Math.max(0,g.top),w=Math.min(size.width,g.left+g.width)-x,h=Math.min(size.height,g.top+g.height)-y;
    filters.push(`scale=${g.width}:${g.height}`,`crop=${w}:${h}:${Math.max(0,-g.left)}:${Math.max(0,-g.top)}`,`pad=${size.width}:${size.height}:${x}:${y}:color=black`,'setsar=1');
    return filters.join(',');
  }
  function canvasSize(source,mode,shortEdge){
    if(mode==='source')return {width:source.width,height:source.height};
    const ratios={'16:9':[16,9],'9:16':[9,16],'1:1':[1,1]};if(!ratios[mode])throw new Error('نسبة أبعاد غير صالحة.');
    const short=number(shortEdge,Math.min(source.width,source.height),16,4320,'دقة اللوحة'),[w,h]=ratios[mode],unit=short/Math.min(w,h);
    return {width:Math.round(w*unit/2)*2,height:Math.round(h*unit/2)*2};
  }
  return {audio,transform,fades,gain,limit,audioFilter,identity,geometry,geometryFilter,canvasSize};
});

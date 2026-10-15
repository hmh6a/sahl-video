const $ = id => document.getElementById(id);
const video=$('video'),canvas=$('overlay');
let meta,template='gaming',busy=false,unsupported=false,frameTimer,frameSerial=0,titleBounds=null;
let titles=[SahlTitles.create({title:'عنوان الفيديو',subtitle:'وصف قصير'})],selectedTitle=titles[0].id;
const titleLayers=new Map();
function currentTitle(){return titles.find(t=>t.id===selectedTitle)||null;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);if($('export-dialog')?.open){$('export-status').textContent=text;$('export-status').classList.toggle('error',error);}}
function seconds(t){t=Math.max(0,Number(t)||0);const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=Math.floor(t%60);return(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function fps(s){const[a,b]=String(s||'30').split('/').map(Number),n=b?a/b:a;return Number.isFinite(n)&&n>0?n:30;}
function settings(){return {template,animation:$('animation').value,title:$('title').value,subtitle:$('subtitle').value,position:$('position').value,accent:$('accent').value,size:Number($('size').value),font:$('font').value,weight:$('font-weight').value,titleStart:Number($('title-start').value),titleDuration:Number($('title-duration').value),textX:Number($('text-x').value),textY:Number($('text-y').value),enabled:$('enabled').checked};}
function commitTitle(){const t=currentTitle();if(t)Object.assign(t,settings());}
function drawTitle(target,t){
  const w=meta?.width||1920,h=meta?.height||1080;target.width=w;target.height=h;const c=target.getContext('2d');
  if(!t.enabled||(!t.title.trim()&&!t.subtitle.trim()))return null;
  const title=t.title.trim(),sub=t.subtitle.trim(),base=Math.min(w/1920,h/1080)*Number(t.size),available=w*.82-60*base;
  const arabic=/[\u0600-\u06ff]/.test(title+sub),family=t.font==='auto'?(t.template==='gaming'&&!arabic?'Impact':'Segoe UI'):t.font;
  const font=n=>`${t.weight} ${n}px ${JSON.stringify(family)}, "Segoe UI", sans-serif`;
  let mainSize=88*base,subSize=43*base;c.font=font(mainSize);if(c.measureText(title).width>available)mainSize*=available/c.measureText(title).width;
  c.font=font(subSize);if(c.measureText(sub).width>available)subSize*=available/c.measureText(sub).width;
  c.font=font(mainSize);const tw=c.measureText(title).width;c.font=font(subSize);const sw=c.measureText(sub).width;
  const textWidth=Math.max(tw,sw),blockHeight=(title?mainSize*1.2:0)+(sub?subSize*1.3:0);
  const boxed=['card','banner','label','cinema'].includes(t.template),padX=(t.template==='gaming'?50:boxed?28:12)*base,padY=(boxed?22:t.template==='minimal'?28:12)*base;
  const bw=textWidth+padX+(boxed?28:12)*base,bh=blockHeight+padY+(boxed?22:12)*base;
  const desired=t.position==='custom'?{x:t.textX/100*w,y:t.textY/100*h}:SahlTitles.anchor(t.position,bw,bh,w,h);
  const placed=SahlTitle.place(desired.x,desired.y,bw,bh,w,h),x=placed.x+padX,y=placed.y+padY;
  c.textAlign='left';c.textBaseline='top';
  if(t.template==='gaming'){c.fillStyle=t.accent;c.fillRect(placed.x+5*base,y+3*base,15*base,blockHeight);}
  if(boxed){c.fillStyle=t.template==='banner'?t.accent:t.template==='cinema'?'rgba(0,0,0,.8)':'rgba(12,17,29,.85)';c.beginPath();c.roundRect(placed.x,placed.y,bw,bh,(t.template==='label'?bh/2:12*base));c.fill();if(t.template==='label'){c.strokeStyle=t.accent;c.lineWidth=3*base;c.stroke();}if(t.template==='cinema'){c.fillStyle=t.accent;c.fillRect(placed.x,placed.y+bh-4*base,bw,4*base);}}
  if(t.template==='minimal'){c.fillStyle=t.accent;c.fillRect(x,placed.y+4*base,Math.min(textWidth,160*base),5*base);}
  c.shadowColor='rgba(0,0,0,.7)';c.shadowBlur=5*base;c.shadowOffsetY=2*base;
  if(t.template==='neon'){c.shadowColor=t.accent;c.shadowBlur=20*base;c.shadowOffsetY=0;}
  if(title){c.direction=/[\u0600-\u06ff]/.test(title)?'rtl':'ltr';c.font=font(mainSize);c.fillStyle='#ffffff';if(t.template==='outline'){c.strokeStyle=t.accent;c.lineWidth=5*base;c.strokeText(title,x,y);}c.fillText(title,x,y);}
  if(sub){c.direction=/[\u0600-\u06ff]/.test(sub)?'rtl':'ltr';c.font=font(subSize);c.fillStyle=['minimal','banner'].includes(t.template)?'#eeeeee':t.accent;c.fillText(sub,x,y+(title?mainSize*1.2:0));}
  return {x:placed.x,y:placed.y,width:bw,height:bh};
}
function draw(){
  canvas.hidden=true;
  for(const [id,layer]of titleLayers)if(!titles.some(t=>t.id===id)){layer.canvas.remove();titleLayers.delete(id);}
  for(const t of titles){let layer=titleLayers.get(t.id);if(!layer){const c=document.createElement('canvas');c.className='text-overlay';$('stage').insertBefore(c,$('title-selection'));layer={canvas:c};titleLayers.set(t.id,layer);}layer.bounds=drawTitle(layer.canvas,t);}
  titleBounds=titleLayers.get(selectedTitle)?.bounds||null;
  const t=currentTitle();if(t&&titleBounds&&t.position!=='custom'){$('text-x').value=(titleBounds.x/(meta?.width||1920)*100).toFixed(1);$('text-y').value=(titleBounds.y/(meta?.height||1080)*100).toFixed(1);t.textX=Number($('text-x').value);t.textY=Number($('text-y').value);}
  layoutCanvas();if(typeof cursor!=='undefined')updateOverlayVisibility();
}
function layoutCanvas(){
  if(!meta)return;const r=$('stage').getBoundingClientRect(),scale=Math.min(r.width/meta.width,r.height/meta.height);
  for(const layer of titleLayers.values()){layer.canvas.style.width=meta.width*scale+'px';layer.canvas.style.height=meta.height*scale+'px';}
  for(const el of [video,$('still'),$('fallback')]){el.style.width=meta.width*scale+'px';el.style.height=meta.height*scale+'px';}
  const selection=$('title-selection'),t=currentTitle();if(titleBounds){selection.style.left=(r.width-meta.width*scale)/2+titleBounds.x*scale+'px';selection.style.top=(r.height-meta.height*scale)/2+titleBounds.y*scale+'px';selection.style.width=titleBounds.width*scale+'px';selection.style.height=titleBounds.height*scale+'px';}
  const animationActive=t&&cursor<t.titleStart+Math.min(.5,t.titleDuration/3);
  selection.hidden=!titleBounds||!t?.enabled||Number(titleLayers.get(selectedTitle)?.canvas.style.opacity||0)===0||busy||animationActive||(typeof playing!=='undefined'&&playing)||(typeof selectionKind!=='undefined'&&selectionKind!=='title');
}

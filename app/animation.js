(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlAnimation=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const kinds=['fade','none','slide-left','slide-right','slide-up','slide-down'];
  function normalize(value){return kinds.includes(value)?value:'fade';}
  function sample(kind,time,t,w,h){
    kind=normalize(kind);if(!t.duration||time<t.start||time>=t.end)return {opacity:0,x:0,y:0};
    if(kind==='none')return {opacity:1,x:0,y:0};
    const entry=Math.min(.5,t.duration/3),progress=Math.min(1,Math.max(0,(time-t.start)/entry)),remaining=Math.pow(1-progress,3);
    return {opacity:Math.max(0,Math.min(1,(time-t.start)/t.fade,(t.end-time)/t.fade)),x:kind==='slide-left'?-w*.12*remaining:kind==='slide-right'?w*.12*remaining:0,y:kind==='slide-up'?h*.12*remaining:kind==='slide-down'?-h*.12*remaining:0};
  }
  function expressions(kind,t,w,h){kind=normalize(kind);const entry=Math.min(.5,t.duration/3),r=`pow(1-min(1,max(0,(t-${t.start})/${entry})),3)`;return {x:kind==='slide-left'?`${-w*.12}*${r}`:kind==='slide-right'?`${w*.12}*${r}`:'0',y:kind==='slide-up'?`${h*.12}*${r}`:kind==='slide-down'?`${-h*.12}*${r}`:'0'};}
  return {kinds,normalize,sample,expressions};
});

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlTitle=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function timing(length,start=0,duration=5){
    start=Number(start);duration=Number(duration);
    if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<.1)throw new Error('حدد وقت بداية النص ومدة صحيحة (0.1 ثانية على الأقل).');
    const end=Math.min(length,start+duration);return {start,end,duration:Math.max(0,end-start),fade:Math.min(.3,Math.max(0,end-start)/3)};
  }
  function opacity(time,t){if(!t.duration||time<t.start||time>=t.end)return 0;return Math.max(0,Math.min(1,(time-t.start)/t.fade,(t.end-time)/t.fade));}
  function place(x,y,width,height,frameWidth,frameHeight){return {x:Math.max(0,Math.min(frameWidth-width,x)),y:Math.max(0,Math.min(frameHeight-height,y))};}
  function move(start,duration,delta,length){return {start:Math.max(0,Math.min(Math.max(0,length-duration),start+delta)),duration};}
  function resize(start,duration,delta,edge,length){const end=Math.min(length,start+duration);if(edge==='start'){const next=Math.max(0,Math.min(end-.1,start+delta));return {start:next,duration:end-next};}return {start,duration:Math.max(.1,Math.min(length-start,duration+delta))};}
  return {timing,opacity,place,move,resize};
});

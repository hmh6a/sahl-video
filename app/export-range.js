(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlExportRange=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function normalize(range,length,fps){
  const [n,d=1]=String(fps||30).split('/').map(Number),rate=n/d;
  if(!Number.isFinite(length)||length<=0||!Number.isFinite(rate)||rate<=0)throw new Error('مدة المشروع أو معدل الإطارات غير صالح.');
  if(range==null||range.enabled===false)return {enabled:false,start:0,end:length,duration:length};
  const {start,end}=range;
  if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>length+1e-7||end<=start)throw new Error('نطاق التصدير: البداية والنهاية لازم تكون داخل المشروع والنهاية بعد البداية.');
  const first=Math.ceil(start*rate-1e-7),last=Math.min(Math.ceil(length*rate-1e-7),Math.ceil(end*rate-1e-7));
  if(last<=first)throw new Error('نطاق التصدير ما يحتوي إطاراً؛ وسّعه لإطار واحد على الأقل.');
  return {enabled:true,first,last,start:first/rate,end:last/rate,duration:(last-first)/rate};
 }
 return {normalize};
});

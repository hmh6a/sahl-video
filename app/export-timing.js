function resetExportTiming(){$('export-timing').hidden=true;$('export-elapsed').textContent='00:00';$('export-remaining').textContent='جاري حسابه…';$('export-finish').textContent='';}
function showExportTiming(p){
  if(!p||typeof p!=='object')return;$('export-timing').hidden=false;$('export-elapsed').textContent=seconds(p.elapsedSeconds);
  const estimating=Number.isFinite(p.remainingSeconds),done=p.phase==='complete',stopped=p.phase==='stopped';
  $('export-remaining').textContent=done?'اكتمل':stopped?'توقف':p.phase==='finalizing'?'جاري حفظ الملف…':estimating?seconds(p.remainingSeconds):'جاري حسابه…';
  $('export-finish').textContent=!done&&!stopped&&estimating?'الانتهاء المتوقع: '+new Date(Date.now()+p.remainingSeconds*1000).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})+' · تقدير يتغيّر حسب سرعة المعالجة.':done?'اكتمل التصدير.':stopped?'توقفت المعالجة.':'يظهر التقدير بعد بدء معالجة الإطارات.';
}

(() => {
  const byId = id => document.getElementById(id), api = window.sahl;
  const button = byId('open-updates'), dialog = byId('updates-dialog');
  if (!api.updateStatus) { button.hidden = true; return; }
  let state = { phase: 'idle' };
  function render(next) {
    state = next;
    for (const selector of ['.studio','.topbar']) { const area=document.querySelector(selector); if(area)area.inert=next.phase==='installing'; }
    const active = next.phase === 'downloading', installing = next.phase === 'installing', found = next.canDownload && !active && !installing, ready = next.canInstall && !installing;
    button.classList.toggle('has-update', found || ready);
    button.textContent = active ? `تنزيل التحديث ${next.percent}%` : found ? `تحديث جديد ${next.version}` : ready ? 'التحديث جاهز' : 'التحديثات';
    byId('app-version').textContent = next.currentVersion || '—';
    byId('installed-version').textContent = next.currentVersion || '—';
    byId('update-version').textContent = next.version ? `الإصدار ${next.version}` : '';
    byId('update-message').textContent = next.message || ({ idle: 'افحص إذا تتوفر نسخة جديدة من سهل.', checking: 'جاري فحص التحديثات…', current: 'عندك أحدث إصدار.', available: 'يتوفر تحديث جديد. اضغط تحديث الآن لتنزيله وتثبيته داخل البرنامج.', downloading: 'جاري تجهيز التحديث والتحقق من سلامته…', downloaded: 'التحديث جاهز. اضغط إعادة التشغيل والتحديث؛ ما تحتاج تفتح أي ملف.', installing: 'جاري تثبيت التحديث وإعادة تشغيل سهل…' }[next.phase] || 'تعذّر فحص التحديثات.');
    byId('update-message').classList.toggle('error', next.phase === 'error');
    byId('check-updates').disabled = active || installing || next.phase === 'checking' || next.phase === 'disabled';
    byId('download-update').hidden = !found;
    byId('cancel-update').hidden = !active;
    byId('install-update').hidden = !ready;
    byId('update-progress').hidden = !active;
    byId('update-progress').value = next.percent || 0;
  }
  async function action(name) {
    try { const result = await api[name](); if (result) render(result); }
    catch { render({ ...state, phase: 'error', message: 'تعذّر إكمال العملية. حاول مجدداً.' }); }
  }
  button.onclick = () => { dialog.showModal(); if (['idle', 'error'].includes(state.phase)) action('checkUpdates'); };
  byId('close-updates').onclick = () => dialog.close();
  byId('check-updates').onclick = () => action('checkUpdates');
  byId('download-update').onclick = () => action('downloadUpdate');
  byId('cancel-update').onclick = () => action('cancelUpdate');
  byId('install-update').onclick = () => action('installUpdate');
  api.onUpdate(render);
  action('updateStatus');
  setTimeout(() => action('checkUpdates'), 4000);
  setInterval(() => action('checkUpdates'), 6 * 60 * 60 * 1000);
})();

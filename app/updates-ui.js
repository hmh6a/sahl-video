(() => {
  const byId = id => document.getElementById(id), api = window.sahl;
  const button = byId('open-updates'), dialog = byId('updates-dialog');
  if (!api.updateStatus) { button.hidden = true; return; }
  let state = { phase: 'idle' };
  function render(next) {
    state = next;
    const active = next.phase === 'downloading', found = next.phase === 'available', ready = next.phase === 'downloaded';
    button.classList.toggle('has-update', found || ready);
    button.textContent = active ? `تنزيل التحديث ${next.percent}%` : found ? `تحديث جديد ${next.version}` : ready ? 'التحديث جاهز' : 'التحديثات';
    byId('app-version').textContent = next.currentVersion || '—';
    byId('installed-version').textContent = next.currentVersion || '—';
    byId('update-version').textContent = next.version ? `الإصدار ${next.version}` : '';
    byId('update-message').textContent = next.message || ({ idle: 'افحص إذا تتوفر نسخة جديدة من سهل.', checking: 'جاري فحص التحديثات…', current: 'عندك أحدث إصدار.', available: 'يتوفر تحديث جديد. نزّل ملف التثبيت وكمل شغلك إلى أن تكون جاهز للتحديث.', downloading: 'جاري تنزيل ملف التثبيت والتحقق من سلامته…', downloaded: 'اكتمل تنزيل المُثبّت. احفظ مشروعك وأغلق سهل، ثم افتح الملف واتبع خطوات التثبيت. تقدر تختار مكان تثبيت البرنامج.' }[next.phase] || 'تعذّر فحص التحديثات.');
    byId('update-message').classList.toggle('error', next.phase === 'error');
    byId('check-updates').disabled = active || next.phase === 'checking';
    byId('download-update').hidden = !found;
    byId('cancel-update').hidden = !active;
    byId('show-update').hidden = !ready;
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
  byId('show-update').onclick = () => action('showUpdate');
  api.onUpdate(render);
  action('updateStatus');
  setTimeout(() => action('checkUpdates'), 4000);
  setInterval(() => action('checkUpdates'), 6 * 60 * 60 * 1000);
})();

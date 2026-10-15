const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const REPO = 'hmh6a/sahl-video';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES = `https://github.com/${REPO}/releases`;
const hosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
function versionParts(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error('رقم الإصدار غير صالح.');
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('رقم الإصدار غير صالح.');
  return parts;
}
function newer(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function releaseInfo(release, current) {
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error('لا يوجد إصدار مستقر صالح حالياً.');
  const version = release.tag_name.slice(1);
  if (!newer(version, current)) return null;
  const filename = `Sahl-Video-${version}.exe`;
  const asset = release.assets?.find(a => a.name === filename && a.state === 'uploaded');
  const url = `${RELEASES}/download/v${version}/${filename}`;
  if (!asset || asset.browser_download_url !== url || !Number.isSafeInteger(asset.size) || asset.size < 1024 * 1024 || asset.size > 2 * 1024 ** 3 || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('ملف التحديث لم يكتمل أو تعذّر التحقق من بياناته. حاول لاحقاً.');
  return { version, filename, url, size: asset.size, sha256: asset.digest.slice(7) };
}
async function request(url, signal, fetchFn = fetch) {
  for (let hop = 0; hop < 6; hop++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || !hosts.has(u.hostname)) throw new Error('رابط تحديث غير موثوق.');
    const response = await fetchFn(u.href, { redirect: 'manual', signal, headers: { 'User-Agent': 'Sahl-Video', Accept: u.hostname === 'api.github.com' ? 'application/vnd.github+json' : 'application/octet-stream' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('رابط التنزيل غير متاح.');
      url = new URL(location, u).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 403 || response.status === 429 ? 'فحص التحديثات محدود مؤقتاً. جرّب بعد قليل.' : 'تعذّر الوصول إلى التحديثات. تأكد من الإنترنت وحاول مجدداً.');
    }
    return response;
  }
  throw new Error('تعذّر الوصول إلى رابط التنزيل النهائي.');
}
class Updates {
  constructor(version, { fetchFn = fetch, notify = () => {} } = {}) {
    versionParts(version); this.version = version; this.fetchFn = fetchFn; this.notify = notify;
    this.available = null; this.inflight = null; this.controller = null; this.downloaded = null;
    this.state = { phase: 'idle', currentVersion: version };
  }
  status() { return { ...this.state }; }
  emit(value) { this.state = { currentVersion: this.version, ...value }; this.notify(this.status()); return this.status(); }
  check() {
    if (this.controller) return Promise.resolve(this.status());
    if (this.inflight) return this.inflight;
    this.emit({ phase: 'checking' });
    this.inflight = (async () => {
      try {
        const response = await request(API, AbortSignal.timeout(20000), this.fetchFn);
        const info = releaseInfo(await response.json(), this.version);
        this.available = info;
        if (info && this.downloaded?.version === info.version) return this.emit({ phase: 'downloaded', version: info.version, filename: info.filename });
        return this.emit(info ? { phase: 'available', version: info.version, size: info.size } : { phase: 'current' });
      } catch (error) { return this.emit({ phase: 'error', message: error.name === 'TimeoutError' ? 'انتهت مهلة فحص التحديث. حاول مجدداً.' : error.message }); }
      finally { this.inflight = null; }
    })();
    return this.inflight;
  }
  cancel() { this.controller?.abort(); }
  async download(destination) {
    if (this.controller || this.inflight) return this.status();
    const info = this.available;
    if (!info) return this.emit({ phase: 'error', message: 'افحص التحديثات أولاً.' });
    if (!path.isAbsolute(destination) || path.extname(destination).toLowerCase() !== '.exe') return this.emit({ phase: 'error', message: 'اختار مكاناً صالحاً لملف EXE.' });
    const part = `${destination}.${crypto.randomUUID()}.part`;
    this.controller = new AbortController();
    let finished;
    this.done = new Promise(resolve => { finished = resolve; });
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15 * 60 * 1000)]);
    let file, received = 0, lastNotice = 0;
    try {
      try { await fs.stat(destination); throw new Error('الملف موجود. اختار اسماً آخر حتى يبقى الملف السابق محفوظاً.'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      this.emit({ phase: 'downloading', version: info.version, percent: 0 });
      const response = await request(info.url, signal, this.fetchFn);
      const length = response.headers.get('content-length');
      if (length !== null && Number(length) !== info.size) { await response.body?.cancel(); throw new Error('حجم التنزيل لا يطابق الإصدار.'); }
      if (!response.body) throw new Error('ملف التنزيل فارغ.');
      file = await fs.open(part, 'wx');
      const hash = crypto.createHash('sha256');
      let signature = Buffer.alloc(0);
      for await (const chunk of response.body) {
        signal.throwIfAborted(); received += chunk.length;
        if (received > info.size) throw new Error('ملف التحديث أكبر من الحجم المتوقع.');
        if (signature.length < 2) signature = Buffer.concat([signature, Buffer.from(chunk)]).subarray(0, 2);
        hash.update(chunk); await file.writeFile(chunk);
        if (Date.now() - lastNotice > 200) { lastNotice = Date.now(); this.emit({ phase: 'downloading', version: info.version, percent: Math.min(99, Math.floor(received / info.size * 100)) }); }
      }
      signal.throwIfAborted();
      if (received !== info.size || signature.toString() !== 'MZ' || hash.digest('hex') !== info.sha256) throw new Error('فشل التحقق من سلامة التحديث. أعد التنزيل.');
      await file.sync(); await file.close(); file = null;
      signal.throwIfAborted();
      // Publish without overwriting any file created while the download was running.
      await fs.link(part, destination);
      this.downloaded = { version: info.version, path: destination };
      return this.emit({ phase: 'downloaded', version: info.version, filename: path.basename(destination) });
    } catch (error) {
      return this.emit(this.controller.signal.aborted ? { phase: 'available', version: info.version, size: info.size, message: 'تم إلغاء التنزيل.' } : { phase: 'error', message: error.name === 'TimeoutError' ? 'انتهت مهلة التنزيل. حاول مجدداً.' : error.code === 'EEXIST' ? 'الملف موجود. اختار اسماً آخر.' : error.message });
    } finally {
      await file?.close().catch(() => {});
      await fs.unlink(part).catch(() => {});
      this.controller = null;
      finished();
    }
  }
}
module.exports = { Updates, newer, releaseInfo, request };

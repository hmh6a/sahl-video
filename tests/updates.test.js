const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { Updates, newer, releaseInfo, request } = require('../app/updates');
const binary = Buffer.alloc(1024 * 1024 + 37, 42); binary.write('MZ');
const sha = crypto.createHash('sha256').update(binary).digest('hex');
function release(version = '1.0.1') {
  const name = `Sahl-Video-${version}.exe`;
  return { tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ name, state: 'uploaded', size: binary.length, digest: `sha256:${sha}`, browser_download_url: `https://github.com/hmh6a/sahl-video/releases/download/v${version}/${name}` }] };
}
const response = bytes => new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
const fakeFetch = async url => url.includes('api.github.com') ? Response.json(release()) : response(binary);
async function folder(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sahl-updates-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
test('updates compare numeric versions and accept only a complete release from this repository', () => {
  assert.equal(newer('1.0.10', '1.0.9'), true); assert.equal(newer('1.0.1', '1.0.1'), false); assert.equal(newer('1.0.1', '1.1.0'), false);
  assert.equal(releaseInfo(release(), '1.0.0').version, '1.0.1'); assert.equal(releaseInfo(release(), '1.0.1'), null);
  for (const r of [{ ...release(), draft: true }, { ...release(), prerelease: true }, { ...release(), tag_name: 'v1.0.1-beta' }, { ...release(), assets: [] }]) assert.throws(() => releaseInfo(r, '1.0.0'));
  const r = release(); r.assets[0].browser_download_url = 'https://evil.example/download.exe'; assert.throws(() => releaseInfo(r, '1.0.0'));
  const digest = release(); digest.assets[0].digest = null; assert.throws(() => releaseInfo(digest, '1.0.0'));
});
test('update check deduplicates requests, reports offline errors, and can retry without interrupting editing', async () => {
  let calls = 0, online = false;
  const service = new Updates('1.0.0', { fetchFn: async () => { calls++; await new Promise(r => setImmediate(r)); if (!online) throw new Error('offline'); return Response.json(release()); } });
  const first = service.check(); assert.equal(service.check(), first); assert.equal((await first).phase, 'error'); assert.equal(calls, 1);
  online = true; assert.equal((await service.check()).phase, 'available');
  assert.equal((await new Updates('1.0.1', { fetchFn: fakeFetch }).check()).phase, 'current');
});
test('update download verifies hash and size, reports completion and preserves existing files', async t => {
  const dir = await folder(t), target = path.join(dir, 'سهل.exe'), states = [];
  const service = new Updates('1.0.0', { fetchFn: fakeFetch, notify: s => states.push(s) });
  await service.check(); assert.equal((await service.download(target)).phase, 'downloaded');
  assert.deepEqual(await fs.readFile(target), binary); assert.equal(service.downloaded.path, target);
  assert.equal((await service.check()).phase, 'downloaded'); assert.ok(states.some(s => s.phase === 'downloading'));
  assert.equal((await service.download(target)).phase, 'error'); assert.deepEqual(await fs.readFile(target), binary);
  assert.deepEqual(await fs.readdir(dir), ['سهل.exe']);
});
test('corrupt or truncated downloads never become executable files and can be retried', async t => {
  const dir = await folder(t), target = path.join(dir, 'new.exe');
  const corrupt = Buffer.from(binary); corrupt[777] ^= 1;
  for (const bytes of [corrupt, binary.subarray(0, 800)]) {
    const service = new Updates('1.0.0', { fetchFn: async url => url.includes('api.github.com') ? Response.json(release()) : response(bytes) });
    await service.check(); assert.equal((await service.download(target)).phase, 'error'); assert.deepEqual(await fs.readdir(dir), []);
    service.fetchFn = fakeFetch; assert.equal((await service.download(target)).phase, 'downloaded'); await fs.unlink(target);
  }
});
test('cancel stops an in-flight download, removes its partial file and permits downloading again', async t => {
  const dir = await folder(t), target = path.join(dir, 'new.exe'); let started;
  const ready = new Promise(resolve => { started = resolve; });
  const service = new Updates('1.0.0', { fetchFn: async (url, options) => {
    if (url.includes('api.github.com')) return Response.json(release());
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(binary.subarray(0, 1024)); options.signal.addEventListener('abort', () => controller.error(options.signal.reason)); started(); } }));
  } });
  await service.check(); const pending = service.download(target); await ready; service.cancel();
  assert.equal((await pending).phase, 'available'); assert.deepEqual(await fs.readdir(dir), []);
  service.fetchFn = fakeFetch; assert.equal((await service.download(target)).phase, 'downloaded');
});
test('download redirects stay on HTTPS GitHub asset hosts and reject credential URLs', async () => {
  for (const url of ['http://github.com/asset', 'https://github.com.evil.test/asset', 'https://secret@github.com/asset']) await assert.rejects(request(url, undefined, () => { throw new Error('must not request'); }), /موثوق/);
  let requests = 0;
  await assert.rejects(request('https://github.com/asset', undefined, async () => { requests++; return new Response(null, { status: 302, headers: { location: 'https://evil.test/asset' } }); }), /موثوق/);
  assert.equal(requests, 1);
});

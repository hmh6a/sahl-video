const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const { versionFromTag } = require('../scripts/set-build-version.cjs');
test('the pushed tag supplies the exact package and lockfile version; branch builds cannot assign a release', t => {
  assert.equal(versionFromTag('v1.0.1'), '1.0.1'); assert.equal(versionFromTag('v2.4.10'), '2.4.10');
  for (const tag of ['main', '1.0.1', 'v01.2.3', 'v1.2', 'v1.2.3-beta', 'v1.2.3+build', 'v1.2.3\n', undefined]) assert.throws(() => versionFromTag(tag));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sahl-release-tag-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts')); fs.copyFileSync('scripts/set-build-version.cjs', path.join(dir, 'scripts/set-build-version.cjs'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }));
  const run = (type, name) => execFileSync(process.execPath, ['scripts/set-build-version.cjs'], { cwd: dir, windowsHide: true, stdio: 'pipe', env: { ...process.env, GITHUB_REF_TYPE: type, GITHUB_REF_NAME: name } });
  assert.throws(() => run('branch', 'main')); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).version, '1.0.0');
  run('tag', 'v2.4.10'); run('tag', 'v2.4.10');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).version, '2.4.10');
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'))); assert.equal(lock.version, '2.4.10'); assert.equal(lock.packages[''].version, '2.4.10');
});
function publish({ event = 'push', type = 'tag', refName = 'v1.0.2', missing = false, annotated = false, wrongCommit = false } = {}) {
  const calls = [], commit = 'a'.repeat(40), binary = Buffer.from('MZ test artifact'), filename = 'Sahl-Video-1.0.2.exe', sha256 = crypto.createHash('sha256').update(binary).digest('hex');
  const manifest = { version: '1.0.2', tag: 'v1.0.2', filename, sha256, commit }; let views = 0;
  const fakeFs = { readFileSync(file) { file = file.replace(/\\/g, '/'); if (file === 'release/manifest.json') return JSON.stringify(manifest); if (file === 'release/' + filename) return binary; if (file === 'release/SHA256SUMS.txt') return `${sha256}  ${filename}\n`; if (file === 'RELEASE_NOTES.md') return 'Release notes'; throw Error('Unexpected file '+file); }, writeFileSync() {}, statSync() { return { size: binary.length }; } };
  function gh(_exe, args) {
    calls.push(args);
    if (args[0] === 'api') {
      if (missing) { const e = Error('Not found'); e.stderr = 'HTTP 404'; throw e; }
      if (args[1].includes('/git/ref/tags/')) return JSON.stringify({ object: { type: annotated ? 'tag' : 'commit', sha: annotated ? 'b'.repeat(40) : wrongCommit ? 'c'.repeat(40) : commit } });
      if (args[1].includes('/git/tags/')) return JSON.stringify({ object: { type: 'commit', sha: commit } });
      throw Error('Unexpected mutation');
    }
    if (args[0] === 'release' && args[1] === 'view') { views++; return JSON.stringify(views === 1 ? { isDraft: true } : { isDraft: false, url: 'https://github.com/test/repo/releases/tag/v1.0.2', assets: [{ name: filename, size: binary.length }] }); }
    return '';
  }
  let error;
  try { vm.runInNewContext(fs.readFileSync('scripts/publish-release.cjs', 'utf8'), { require: name => name === 'node:fs' ? fakeFs : name === 'node:child_process' ? { execFileSync: gh } : name === './set-build-version.cjs' ? { versionFromTag } : require(name), process: { env: { GH_TOKEN: 'fixture', GH_REPO: 'test/repo', GITHUB_SHA: commit, GITHUB_EVENT_NAME: event, GITHUB_REF_TYPE: type, GITHUB_REF_NAME: refName } }, console: { log() {} } }); } catch (e) { error = e; }
  return { calls, error };
}
test('publication refuses main pushes, manual dispatch, mismatched versions and missing or moved tags', () => {
  for (const input of [{ type: 'branch', refName: 'main' }, { event: 'workflow_dispatch' }, { refName: 'v1.0.3' }, { missing: true }, { wrongCommit: true }]) {
    const result = publish(input); assert.ok(result.error); assert.ok(!result.calls.some(a => a[0] === 'release')); assert.ok(!result.calls.some(a => a.includes('POST') || a.includes('DELETE')));
  }
});
test('publication accepts lightweight and annotated version tags without creating or deleting tags', () => {
  for (const annotated of [false, true]) {
    const result = publish({ annotated }); assert.ifError(result.error);
    assert.ok(result.calls.some(a => a[0] === 'release' && a[1] === 'upload' && a[2] === 'v1.0.2'));
    assert.ok(result.calls.some(a => a[0] === 'release' && a[1] === 'edit' && a[2] === 'v1.0.2'));
    assert.ok(!result.calls.some(a => a.includes('POST') || a.includes('DELETE') || a.includes('delete')));
  }
});
test('the workflow listens only to pushed version tags', () => {
  const workflow = require('js-yaml').load(fs.readFileSync('.github/workflows/windows-release.yml', 'utf8'));
  assert.deepEqual(workflow.on, { push: { tags: ['v*'] } });
  assert.match(workflow.jobs.publish.if, /github.event_name == 'push'/);
  assert.match(workflow.jobs.publish.if, /refs\/tags\/v/);
});

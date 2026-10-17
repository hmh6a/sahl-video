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
test('the workflow builds all native desktop targets and only publishes pushed version tags', () => {
  const workflow = require('js-yaml').load(fs.readFileSync('.github/workflows/windows-release.yml', 'utf8'));
  assert.deepEqual(workflow.on, { push: { tags: ['v*'] } });
  assert.match(workflow.jobs.publish.if, /github.event_name == 'push'/);
  assert.match(workflow.jobs.publish.if, /refs\/tags\/v/);
  assert.deepEqual(workflow.jobs.build.strategy.matrix.include.map(x=>x.platform+'-'+x.arch).sort(),['darwin-arm64','darwin-x64','win32-x64']);
  assert.ok(workflow.jobs.build.steps.some(s=>s.run==='node scripts/prepare-release.cjs'));
  assert.equal(workflow.jobs.publish.needs,'build');
});

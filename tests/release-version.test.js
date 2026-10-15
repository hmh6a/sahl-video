const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { buildVersion } = require('../scripts/set-build-version.cjs');
test('automatic version begins at 1.0.0, increments on commits and remains stable on reruns', t => {
  assert.equal(buildVersion('1.0', 1), '1.0.0'); assert.equal(buildVersion('1.0', 11), '1.0.10'); assert.throws(() => buildVersion('1.0', 0));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sahl-release-version-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Release test'); git('config', 'user.email', 'release@example.invalid'); git('commit', '--allow-empty', '-m', 'base');
  const baseCommit = git('rev-parse', 'HEAD');
  fs.mkdirSync(path.join(dir, 'scripts')); fs.copyFileSync('scripts/set-build-version.cjs', path.join(dir, 'scripts/set-build-version.cjs'));
  fs.writeFileSync(path.join(dir, 'release-config.json'), JSON.stringify({ series: '1.0', baseCommit }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }));
  const run = () => { execFileSync(process.execPath, ['scripts/set-build-version.cjs'], { cwd: dir, windowsHide: true }); return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).version; };
  git('add', '.'); git('commit', '-m', 'first release'); assert.equal(run(), '1.0.0'); assert.equal(run(), '1.0.0');
  git('commit', '--allow-empty', '-m', 'next change'); assert.equal(run(), '1.0.1'); assert.equal(run(), '1.0.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'))).packages[''].version, '1.0.1');
});

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
function buildVersion(series, distance) {
  if (!/^\d+\.\d+$/.test(series) || !Number.isSafeInteger(distance) || distance < 1) throw new Error('Invalid release series or history');
  return `${series}.${distance - 1}`;
}
function run() {
  const config = require('../release-config.json');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  git('merge-base', '--is-ancestor', config.baseCommit, 'HEAD');
  const version = buildVersion(config.series, Number(git('rev-list', '--count', '--first-parent', `${config.baseCommit}..HEAD`)));
  for (const file of ['package.json', 'package-lock.json']) {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    pkg.version = version;
    if (pkg.packages?.['']) pkg.packages[''].version = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  }
  console.log(`Release version: ${version}`);
  return version;
}
if (require.main === module) run();
module.exports = { buildVersion, run };

const fs = require('node:fs');
function versionFromTag(tag) {
  if (typeof tag !== 'string' || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || !tag.slice(1).split('.').map(Number).every(Number.isSafeInteger)) throw new Error('Use a stable version tag such as v1.0.1');
  return tag.slice(1);
}
function run(env = process.env) {
  if (env.GITHUB_REF_TYPE !== 'tag') throw new Error('Release builds require a pushed version tag');
  const version = versionFromTag(env.GITHUB_REF_NAME);
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
module.exports = { versionFromTag, run };

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const pkg = require('../package.json');

const tag = `v${pkg.version}`;
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag)) throw new Error('Invalid package version');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
  throw new Error(`Tag must match package.json: expected ${tag}`);
}
const output = path.resolve(pkg.build.directories.output);
const filename = pkg.build.nsis.artifactName.replace('${version}', pkg.version);
if (path.basename(filename) !== filename || !filename.endsWith('.exe')) throw new Error('Invalid EXE filename');
const archive = path.join(output, 'win-unpacked', 'resources', 'app.asar');
let checked = 0;
function verifyDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) verifyDirectory(file);
    else {
      if (!fs.readFileSync(file).equals(asar.extractFile(archive, file))) throw new Error(`Packaged file differs: ${file}`);
      checked++;
    }
  }
}
verifyDirectory('app');
const binary = fs.readFileSync(path.join(output, filename));
if (binary.length < 1024 * 1024 || binary.toString('ascii', 0, 2) !== 'MZ') throw new Error('Missing or invalid Windows EXE');
const sha256 = crypto.createHash('sha256').update(binary).digest('hex');
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync(path.join('release', filename), binary);
fs.writeFileSync('release/SHA256SUMS.txt', `${sha256}  ${filename}\n`);
fs.writeFileSync('release/manifest.json', JSON.stringify({ version: pkg.version, tag, filename, sha256, commit: process.env.GITHUB_SHA || null }, null, 2) + '\n');
const summary = `Verified ${checked} packaged files, including Anton and its licence.\n\nWindows x64: ${filename}\n\nSHA256: ${sha256}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const manifest = JSON.parse(fs.readFileSync('release/manifest.json', 'utf8'));
const { tag, version, filename, sha256, commit } = manifest;
const repo = process.env.GH_REPO;
if (!repo || !process.env.GH_TOKEN) throw new Error('GitHub Actions repository and token are required');
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag) || tag !== `v${version}`) throw new Error('Invalid release version');
if (!/^[a-f0-9]{40}$/.test(commit) || commit !== process.env.GITHUB_SHA) throw new Error('Artifact belongs to a different commit');
if (path.basename(filename) !== filename || !filename.endsWith('.exe')) throw new Error('Invalid artifact filename');
const exe = path.join('release', filename);
if (crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex') !== sha256) throw new Error('EXE checksum mismatch');
if (fs.readFileSync('release/SHA256SUMS.txt', 'utf8') !== `${sha256}  ${filename}\n`) throw new Error('Checksum file mismatch');

function gh(...args) { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 }).trim(); }
function optionalJson(...args) {
  try { return JSON.parse(gh(...args)); }
  catch (error) {
    const detail = String(error.stderr || error.message);
    if (/HTTP 404|release not found/i.test(detail)) return null;
    throw new Error(detail);
  }
}

// Never move an existing version tag to different source code.
const tagRef = optionalJson('api', `repos/${repo}/git/ref/tags/${tag}`);
if (tagRef) {
  let object = tagRef.object;
  for (let depth = 0; object.type === 'tag' && depth < 5; depth++) object = JSON.parse(gh('api', `repos/${repo}/git/tags/${object.sha}`)).object;
  if (object.type !== 'commit' || object.sha !== commit) throw new Error(`${tag} already points to different code. Increase the package version before publishing.`);
} else {
  gh('api', '--method', 'POST', `repos/${repo}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${commit}`);
}

const notes = fs.readFileSync('RELEASE_NOTES.md', 'utf8') + `\n\nBuilt and tested on GitHub Actions from commit ${commit}.\n\nDownload **${filename}** below. **SHA256SUMS.txt** contains its checksum.\n`;
fs.writeFileSync('release/notes.md', notes);
const existing = optionalJson('release', 'view', tag, '--json', 'isDraft,url');
if (!existing) gh('release', 'create', tag, '--verify-tag', '--draft', '--title', `Sahl Video ${version} — سهل لويندوز`, '--notes-file', 'release/notes.md');
gh('release', 'upload', tag, exe, 'release/SHA256SUMS.txt', '--clobber');
gh('release', 'edit', tag, '--draft=false', '--latest', '--title', `Sahl Video ${version} — سهل لويندوز`, '--notes-file', 'release/notes.md');
const published = JSON.parse(gh('release', 'view', tag, '--json', 'isDraft,url,assets'));
const uploaded = published.assets.find(asset => asset.name === filename);
if (published.isDraft || !uploaded || uploaded.size !== fs.statSync(exe).size) throw new Error('Published EXE could not be verified');
// Retire only the pre-reset release requested by the owner, after its replacement is verified.
const retired = require('../release-config.json').retiredRelease;
if (retired && retired.tag !== tag) {
  const oldRef = optionalJson('api', `repos/${repo}/git/ref/tags/${retired.tag}`);
  if (oldRef) {
    if (oldRef.object.type !== 'commit' || oldRef.object.sha !== retired.commit) throw new Error('Retired release was changed; it has been preserved for review.');
    const oldRelease = optionalJson('release', 'view', retired.tag, '--json', 'url');
    if (oldRelease) gh('release', 'delete', retired.tag, '--yes');
    gh('api', '--method', 'DELETE', `repos/${repo}/git/refs/tags/${retired.tag}`);
  }
}
const summary = `Release ready: ${published.url}\n\n${filename} (${uploaded.size} bytes)\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

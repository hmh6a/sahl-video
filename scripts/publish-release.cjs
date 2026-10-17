const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {versionFromTag}=require('./set-build-version.cjs'),{assemble}=require('./release-artifacts.cjs');
function publish({env=process.env,gh=(...args)=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:300000}).trim(),input='release-input',output='release'}={}){
  if(env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REF_TYPE!=='tag')throw Error('Only a pushed version tag can publish a release');
  const tag=env.GITHUB_REF_NAME,version=versionFromTag(tag),commit=env.GITHUB_SHA,repo=env.GH_REPO;
  if(!repo||!env.GH_TOKEN||!/^[a-f0-9]{40}$/.test(commit))throw Error('GitHub Actions repository, token and commit are required');
  const files=assemble(input,output,{version,commit});
  function optionalJson(...args){try{return JSON.parse(gh(...args));}catch(error){const detail=String(error.stderr||error.message);if(/HTTP 404|release not found/i.test(detail))return null;throw Error(detail);}}
  const tagRef=optionalJson('api',`repos/${repo}/git/ref/tags/${tag}`);
  if(!tagRef)throw Error('The pushed tag no longer exists');
  let object=tagRef.object;
  for(let depth=0;object.type==='tag'&&depth<5;depth++)object=JSON.parse(gh('api',`repos/${repo}/git/tags/${object.sha}`)).object;
  if(object.type!=='commit'||object.sha!==commit)throw Error('The pushed tag points to different code');
  const notes=fs.readFileSync('RELEASE_NOTES.md','utf8')+`\n\nBuilt and tested for Windows x64, Mac Apple Silicon and Mac Intel from commit ${commit}.\n\nFFmpeg and FFprobe are included; no separate installation is required. Download the EXE for Windows or the matching DMG for your Mac. ZIP and YAML files support in-app updates. SHA256SUMS.txt contains release checksums.\n`+(files.includes('latest-mac.yml')?'':'\nThis Mac build is unsigned; direct Mac updates require a Developer ID signed release.\n');
  const notesFile=path.join(output,'notes.md');fs.writeFileSync(notesFile,notes);
  const title=`Sahl Video ${version} — سهل للماك والويندوز`;
  if(!optionalJson('release','view',tag,'--json','isDraft,url'))gh('release','create',tag,'--verify-tag','--draft','--title',title,'--notes-file',notesFile);
  gh('release','upload',tag,...files.map(f=>path.join(output,f)),'--clobber');
  const uploaded=JSON.parse(gh('release','view',tag,'--json','assets'));
  for(const name of files)if(uploaded.assets.find(a=>a.name===name)?.size!==fs.statSync(path.join(output,name)).size)throw Error(`Uploaded artifact could not be verified: ${name}`);
  gh('release','edit',tag,'--draft=false','--latest','--title',title,'--notes-file',notesFile);
  const published=JSON.parse(gh('release','view',tag,'--json','isDraft,url'));
  if(published.isDraft)throw Error('Release is still a draft');
  const summary=`Release ready: ${published.url}\n\n${files.join('\n')}\n`;console.log(summary);
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,summary);
}
if(require.main===module)publish();
module.exports={publish};

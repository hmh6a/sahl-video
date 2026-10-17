const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),yaml=require('js-yaml');
const targets=['win32-x64','darwin-arm64','darwin-x64'];
const digest=(bytes,kind='sha256',encoding='hex')=>crypto.createHash(kind).update(bytes).digest(encoding);
function assemble(input,output,{version,commit}){
  const manifests=fs.readdirSync(input,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>({...JSON.parse(fs.readFileSync(path.join(input,e.name,'manifest.json'),'utf8')),dir:path.join(input,e.name)}));
  if(manifests.length!==targets.length||targets.some(t=>manifests.filter(m=>m.target===t).length!==1))throw Error('Require tested Windows x64, Mac arm64 and Mac x64 artifacts');
  const artifacts=new Map(),metadata=new Map();
  for(const m of manifests){
    if(m.format!==2||m.version!==version||m.tag!==`v${version}`||m.commit!==commit)throw Error('Artifact version or commit does not match the pushed tag');
    const mac=m.target.startsWith('darwin'),base=mac?`Sahl-Video-${version}-mac-${m.target.slice(7)}`:`Sahl-Video-${version}`;
    const required=mac?[base+'.dmg',base+'.zip',...(m.autoUpdate?['latest-mac.yml']:[])]:[base+'.exe','latest.yml'];
    if(!Array.isArray(m.files)||required.some(n=>!m.files.some(f=>f.name===n)))throw Error('Release artifacts are incomplete');
    const seen=new Set();
    for(const f of m.files){
      if(typeof f.name!=='string'||path.basename(f.name)!==f.name||f.name.includes('\\')||seen.has(f.name)||!(required.includes(f.name)||[base+'.exe.blockmap',base+'.zip.blockmap',base+'.dmg.blockmap'].includes(f.name)))throw Error('Invalid release artifact filename');
      seen.add(f.name);
      const bytes=fs.readFileSync(path.join(m.dir,f.name));
      if(bytes.length!==f.size||digest(bytes)!==f.sha256)throw Error('Artifact checksum or size mismatch');
      if(f.name.endsWith('.yml')){
        const data=yaml.load(bytes.toString());
        if(data.version!==version||!Array.isArray(data.files)||!data.files.length)throw Error('Invalid update metadata');
        metadata.set(m.target,data);
      }else{
        if(artifacts.has(f.name))throw Error('Duplicate release artifact');
        artifacts.set(f.name,bytes);
      }
    }
  }
  for(const [target,data] of metadata){
    for(const f of data.files){
      const bytes=artifacts.get(f.url);
      if(!bytes||digest(bytes,'sha512','base64')!==f.sha512||bytes.length!==f.size)throw Error('Update metadata does not match the verified artifact');
      const prefix=target==='win32-x64'?`Sahl-Video-${version}.exe`:`Sahl-Video-${version}-mac-${target.slice(7)}.`;
      if(!f.url.startsWith(prefix))throw Error('Update metadata targets the wrong architecture');
    }
  }
  const macManifests=manifests.filter(m=>m.target.startsWith('darwin'));
  if(macManifests[0].autoUpdate!==macManifests[1].autoUpdate)throw Error('Both Mac architectures must use the same signing policy');
  artifacts.set('latest.yml',Buffer.from(yaml.dump(metadata.get('win32-x64'))));
  if(macManifests.every(m=>m.autoUpdate)){
    const intel=metadata.get('darwin-x64'),arm=metadata.get('darwin-arm64');
    artifacts.set('latest-mac.yml',Buffer.from(yaml.dump({...intel,files:[...intel.files,...arm.files]})));
  }
  fs.mkdirSync(output,{recursive:true});
  for(const [name,bytes] of artifacts)fs.writeFileSync(path.join(output,name),bytes);
  const checksums=[...artifacts].map(([name,bytes])=>`${digest(bytes)}  ${name}`).sort().join('\n')+'\n';
  fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),checksums);
  return [...artifacts.keys(),'SHA256SUMS.txt'];
}
module.exports={assemble,targets};

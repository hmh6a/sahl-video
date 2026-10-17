const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pkg=require('../package.json'),{verifyPackage}=require('./verify-package.cjs');
const {versionFromTag}=require('./set-build-version.cjs');
const version=versionFromTag(process.env.GITHUB_REF_NAME);
if(pkg.version!==version)throw Error('Package version must match the pushed tag');
const verified=verifyPackage(),target=process.platform+'-'+process.arch,output=path.resolve(pkg.build.directories.output);
const mac=process.platform==='darwin',autoUpdate=verified.package.sahlAutoUpdate!==false;
if(mac&&autoUpdate){
  const {execFileSync}=require('node:child_process'),app=path.resolve(verified.resources,'../..');
  execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
  // Stapling is an independent check that notarization actually completed.
  execFileSync('xcrun',['stapler','validate',app],{stdio:'pipe'});
}
const base=mac?`Sahl-Video-${version}-mac-${process.arch}`:`Sahl-Video-${version}`;
const required=mac?[base+'.dmg',base+'.zip',...(autoUpdate?['latest-mac.yml']:[])]:[base+'.exe','latest.yml'];
for(const file of required)if(!fs.existsSync(path.join(output,file)))throw Error(`Missing release artifact: ${file}`);
const names=[...required,...fs.readdirSync(output).filter(n=>n.startsWith(base+'.')&&n.endsWith('.blockmap'))];
fs.mkdirSync('release',{recursive:true});
const files=names.map(name=>{
  const bytes=fs.readFileSync(path.join(output,name));
  if(!bytes.length)throw Error(`Empty artifact: ${name}`);
  fs.writeFileSync(path.join('release',name),bytes);
  return {name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
const manifest={format:2,version,tag:process.env.GITHUB_REF_NAME,commit:process.env.GITHUB_SHA,target,autoUpdate,files};
fs.writeFileSync('release/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${target}: ${names.join(', ')}. In-app updates: ${autoUpdate}.`);

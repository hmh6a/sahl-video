const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const source=fs.readFileSync(path.resolve('scripts/build-release.cjs'),'utf8');
function setup({env={},platform='darwin',arch='arm64',missing,fail}={}){
 const calls=[],checked=[],module={exports:{}},processMock={platform,arch,env:{...env}};
 const target={createTarget:(names,arch)=>({names,arch})};
 const builder={Platform:{MAC:target,WINDOWS:target},Arch:{arm64:'arm64',x64:'x64'},async build(options){calls.push({options,env:{...processMock.env}});if(fail)throw Error('signing failed');}};
 vm.runInNewContext(source,{module,process:processMock,console:{log(){}},require:name=>name==='electron-builder'?builder:name==='node:fs'?{existsSync(file){checked.push(file);return !file.endsWith(missing||'.missing');},statSync:()=>({size:100})}:name==='../package.json'?{version:'1.0.2',build:{directories:{output:'dist'}}}:require(name)});
 return {run:module.exports.run,calls,checked};
}
test('empty GitHub signing secrets produce unsigned Mac installers for both architectures',async()=>{
 for(const arch of ['arm64','x64']){
  const d=setup({arch,env:{CSC_LINK:'',CSC_KEY_PASSWORD:'',APPLE_ID:'',APPLE_APP_SPECIFIC_PASSWORD:'',APPLE_TEAM_ID:'',UNRELATED:'kept'}});await d.run();
  const {options,env}=d.calls[0];assert.deepEqual(env,{UNRELATED:'kept'});assert.equal(options.config.mac.identity,'-');assert.equal(options.config.mac.notarize,false);assert.equal(options.config.extraMetadata.sahlAutoUpdate,false);
  assert.deepEqual(Array.from(options.targets.names),['dmg','zip']);assert.equal(options.targets.arch,arch);assert.ok(d.checked.some(f=>f.endsWith(`Sahl-Video-1.0.2-mac-${arch}.dmg`)));assert.ok(d.checked.some(f=>f.endsWith(`Sahl-Video-1.0.2-mac-${arch}.zip`)));
 }
});
test('signed credentials are preserved and incomplete signing fails before building',async()=>{
 const env={CSC_LINK:'certificate.p12',CSC_KEY_PASSWORD:' password with spaces ',APPLE_ID:'dev@example.com',APPLE_APP_SPECIFIC_PASSWORD:'secret',APPLE_TEAM_ID:'team'};
 const d=setup({env});await d.run();assert.deepEqual(d.calls[0].env,env);assert.equal(d.calls[0].options.config.mac.notarize,true);assert.equal(d.calls[0].options.config.extraMetadata.sahlAutoUpdate,true);
 for(const partial of [{CSC_LINK:'certificate.p12'},{APPLE_ID:'dev@example.com',CSC_LINK:'  '}]){const d=setup({env:partial});await assert.rejects(d.run(),/Mac signing requires/);assert.equal(d.calls.length,0);}
});
test('missing installers and builder rejection fail in the build step; Windows remains an NSIS build',async()=>{
 for(const missing of ['.dmg','.zip'])await assert.rejects(setup({missing}).run(),/required installer/);
 await assert.rejects(setup({fail:true}).run(),/signing failed/);
 const win=setup({platform:'win32',arch:'x64'});await win.run();assert.deepEqual(Array.from(win.calls[0].options.targets.names),['nsis']);assert.equal(win.calls[0].options.config.extraMetadata.sahlAutoUpdate,true);assert.ok(win.checked[0].endsWith('Sahl-Video-1.0.2.exe'));
});
test('CLI exits nonzero even when builder cleanup would reset exitCode',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-build-failure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'node_modules/electron-builder'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/build-release.cjs'),source);
 fs.writeFileSync(path.join(root,'node_modules/electron-builder/index.js'),"process.on('beforeExit',()=>{process.exitCode=0;});const target={createTarget:()=>({})};module.exports={Platform:{MAC:target,WINDOWS:target},Arch:{arm64:1,x64:2},build:async()=>{throw Error('simulated signing failure');}};");
 const env={...process.env};for(const key of ['CSC_LINK','CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID'])env[key]='';
 const result=spawnSync(process.execPath,['scripts/build-release.cjs'],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/simulated signing failure|native macOS or Windows/);
});

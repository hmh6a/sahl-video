const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
// Exercise the installed asar traversal with both host path implementations.
// This reproduces the Windows failure even when the tests run on macOS.
for(const [platform,paths]of [['Windows',path.win32],['POSIX',path.posix]])test(`packaged source verification traverses nested ${platform} archive paths and detects stale files`,()=>{
 const asarFile=path.join(path.dirname(require.resolve('@electron/asar')),'filesystem.js'),asarModule={exports:{}},asarRequire=createRequire(asarFile);
 vm.runInNewContext(fs.readFileSync(asarFile,'utf8'),{exports:asarModule.exports,require:name=>name==='path'?paths:asarRequire(name),Buffer});
 const archive=new asarModule.exports.Filesystem('archive');
 archive.setHeader({files:{app:{files:{assets:{files:{fonts:{files:{'Anton-OFL.txt':{size:7,offset:'0'}}}}}}}}},0);
 let contents=Buffer.from('license');const verified=[];
 const module={exports:{}},sourceFile=path.resolve('scripts/verify-package.cjs'),sourceRequire=createRequire(sourceFile);
 vm.runInNewContext(fs.readFileSync(sourceFile,'utf8'),{module,process,console,require:name=>{
  if(name==='node:path')return paths;
  if(name==='node:fs')return {readdirSync:directory=>[{name:directory==='app'?'assets':directory===paths.join('app','assets')?'fonts':'Anton-OFL.txt',isDirectory:()=>directory!==paths.join('app','assets','fonts')}],readFileSync:()=>Buffer.from('license')};
  if(name==='@electron/asar')return {extractFile:(_file,entry)=>{assert.equal(archive.getFile(entry).size,7);verified.push(entry);return contents;}};
  return sourceRequire(name);
 }});
 module.exports.verifyDirectory('archive','app');assert.deepEqual(verified,[paths.join('app','assets','fonts','Anton-OFL.txt')]);
 contents=Buffer.from('stale');assert.throws(()=>module.exports.verifyDirectory('archive','app'),/Packaged source differs/);
});

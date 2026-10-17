const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const asar=require('@electron/asar'),pkg=require('../package.json');
function resourcesPath(platform=process.platform,arch=process.arch){
  return path.resolve(pkg.build.directories.output,platform==='win32'?'win-unpacked':arch==='x64'?'mac':`mac-${arch}`,...(platform==='win32'?['resources']:[pkg.build.productName+'.app','Contents','Resources']));
}
function verifyPackage(){
  const resources=resourcesPath(),archive=path.join(resources,'app.asar'),unpacked=archive+'.unpacked';
  function verifyDirectory(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())verifyDirectory(file);else if(!fs.readFileSync(file).equals(asar.extractFile(archive,file)))throw Error(`Packaged source differs: ${file}`);}}
  verifyDirectory('app');
  const suffix=process.platform==='win32'?'.exe':'',target=process.platform+'-'+process.arch;
  const ffmpeg=path.join(unpacked,'node_modules','ffmpeg-static','ffmpeg'+suffix),ffprobe=path.join(unpacked,'node_modules','@ffprobe-installer',target,'ffprobe'+suffix);
  // No system FFmpeg, FFprobe or Homebrew paths are available to either process.
  const env={...process.env,PATH:''};delete env.DYLD_LIBRARY_PATH;delete env.DYLD_FALLBACK_LIBRARY_PATH;
  const run=(exe,args,childEnv=env)=>execFileSync(exe,args,{env:childEnv,encoding:'utf8',timeout:60000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const executable=process.platform==='win32'?path.resolve(resources,'..',pkg.build.productName+'.exe'):path.resolve(resources,'..','MacOS',pkg.build.productName);
  const smoke=`const assert=require('node:assert/strict');const req=require('node:module').createRequire(${JSON.stringify(path.join(archive,'app','main.js'))});const unpack=p=>p.replace('app.asar','app.asar.unpacked');assert.equal(unpack(req('ffmpeg-static')),${JSON.stringify(ffmpeg)});assert.equal(unpack(req('@ffprobe-installer/ffprobe').path),${JSON.stringify(ffprobe)});assert.equal(typeof req('electron-updater').MacUpdater,'function');console.log('Packaged runtime dependencies resolved');`;
  run(executable,['-e',smoke],{...env,ELECTRON_RUN_AS_NODE:'1'});
  for(const binary of [ffmpeg,ffprobe]){
    if(!fs.existsSync(binary))throw Error(`Missing bundled tool: ${binary}`);
    if(process.platform==='darwin'){
      const arch=run('/usr/bin/lipo',['-archs',binary]).trim();
      if(!arch.split(/\s+/).includes(process.arch==='x64'?'x86_64':'arm64'))throw Error(`Wrong tool architecture: ${binary}: ${arch}`);
      const libraries=run('/usr/bin/otool',['-L',binary]);
      if(/\/opt\/homebrew|\/usr\/local|\/opt\/local|@rpath|@loader_path|@executable_path/.test(libraries))throw Error(`Bundled tool requires external libraries: ${binary}`);
    }
    run(binary,['-version']);
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-packaged-'));
  try{
    const output=path.join(dir,'offline.mp4');
    run(ffmpeg,['-v','error','-f','lavfi','-i','color=s=320x180:r=30:d=0.2','-c:v','libx264','-pix_fmt','yuv420p',output]);
    const data=JSON.parse(run(ffprobe,['-v','error','-show_streams','-of','json',output]));
    if(data.streams[0].width!==320||data.streams[0].height!==180)throw Error('Packaged offline export failed');
    const input=path.join(dir,'hdr.mkv'),hdrOutput=path.join(dir,'hdr.mp4');
    run(ffmpeg,['-v','error','-f','lavfi','-i','color=s=320x180:r=30:d=0.2,format=yuv420p10le','-c:v','ffv1','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc',input]);
    const {inspect,exportArgs}=require('../app/export');
    const meta=inspect(JSON.parse(run(ffprobe,['-v','error','-show_format','-show_streams','-of','json',input])));
    run(ffmpeg,exportArgs(input,null,hdrOutput,meta,{start:0,end:.2,encoder:'cpu'}));
    const hdr=JSON.parse(run(ffprobe,['-v','error','-show_streams','-of','json',hdrOutput])).streams[0];
    if(hdr.profile!=='Main 10'||hdr.pix_fmt!=='yuv420p10le'||hdr.color_transfer!=='smpte2084')throw Error('Packaged offline HDR export failed');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  const config=fs.readFileSync(path.join(resources,'app-update.yml'),'utf8');
  if(!config.includes('hmh6a')||!config.includes('sahl-video'))throw Error('Missing updater provider configuration');
  console.log(`PASS: packaged ${target} exports and probes SDR/HDR video with PATH empty; no external FFmpeg installation required.`);
  return {resources,package:JSON.parse(asar.extractFile(archive,'package.json'))};
}
if(require.main===module)verifyPackage();
module.exports={verifyPackage,resourcesPath};

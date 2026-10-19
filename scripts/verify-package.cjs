const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const asar=require('@electron/asar'),pkg=require('../package.json');
function windowsImports(bytes){
  const pe=bytes.readUInt32LE(0x3c);
  if(bytes.toString('ascii',pe,pe+4)!=='PE\0\0'||bytes.readUInt16LE(pe+4)!==0x8664)throw Error('Expected x64 PE executable');
  const optional=pe+24,size=bytes.readUInt16LE(pe+20),count=bytes.readUInt16LE(pe+6),sections=optional+size;
  if(bytes.readUInt16LE(optional)!==0x20b||size<128)throw Error('Invalid PE32+ header');
  const offset=rva=>{for(let i=0;i<count;i++){const section=sections+i*40,start=bytes.readUInt32LE(section+12),length=bytes.readUInt32LE(section+16);if(rva>=start&&rva<start+length)return bytes.readUInt32LE(section+20)+rva-start;}throw Error('Invalid PE import address');};
  const address=bytes.readUInt32LE(optional+120);if(!address)return [];
  let cursor=offset(address);const result=[];
  for(let i=0;i<256;i++,cursor+=20){const name=bytes.readUInt32LE(cursor+12);if(!name)return result;const start=offset(name),end=bytes.indexOf(0,start);if(end<start||end-start>256)throw Error('Invalid PE import name');result.push(bytes.toString('ascii',start,end));}
  throw Error('Invalid PE import table');
}
function resourcesPath(platform=process.platform,arch=process.arch){
  return path.resolve(pkg.build.directories.output,platform==='win32'?'win-unpacked':arch==='x64'?'mac':`mac-${arch}`,...(platform==='win32'?['resources']:[pkg.build.productName+'.app','Contents','Resources']));
}
function verifyPackage(){
  const resources=resourcesPath(),archive=path.join(resources,'app.asar'),unpacked=archive+'.unpacked';
  function verifyDirectory(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(file===path.join('app','native'))continue;if(entry.isDirectory())verifyDirectory(file);else if(!fs.readFileSync(file).equals(asar.extractFile(archive,file.split(path.sep).join('/'))))throw Error(`Packaged source differs: ${file}`);}}
  verifyDirectory('app');
  const suffix=process.platform==='win32'?'.exe':'',target=process.platform+'-'+process.arch;
  const entries=asar.listPackage(archive).map(f=>f.replaceAll('\\','/'));
  if(entries.some(f=>/\/(?:test-output|\.local-plans|scripts|tests)(?:\/|$)/.test(f)&&!f.startsWith('/node_modules/')))throw Error('Development files leaked into the package');
  const speechRoot=path.join(unpacked,'app','native','transcription'),speech=path.join(speechRoot,target,'whisper-cli'+suffix);
  if(fs.readdirSync(speechRoot).join(',')!==target)throw Error('Bundle contains speech binaries for a different platform');
  const {ENGINE_COMMIT,VAD}=require('../app/speech-config'),speechInfo=JSON.parse(fs.readFileSync(path.join(speechRoot,target,'build.json'),'utf8'));
  if(speechInfo.commit!==ENGINE_COMMIT||speechInfo.platform!==process.platform||speechInfo.arch!==process.arch||speechInfo.cpu!=='baseline'||(process.platform==='win32'&&speechInfo.crt!=='static'))throw Error('Incorrect packaged speech engine');
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(speechRoot,target,VAD.file))).digest('hex')!==VAD.sha256)throw Error('Corrupt packaged speech detector');
  const expected=['whisper-cli'+suffix,VAD.file,'build.json','WHISPER-CPP-LICENSE.txt','SILERO-VAD-LICENSE.txt'].sort();
  if(JSON.stringify(fs.readdirSync(path.join(speechRoot,target)).sort())!==JSON.stringify(expected))throw Error('Unexpected speech runtime files or missing licenses');
  const ffmpeg=path.join(unpacked,'node_modules','ffmpeg-static','ffmpeg'+suffix),ffprobe=path.join(unpacked,'node_modules','@ffprobe-installer',target,'ffprobe'+suffix);
  // No system FFmpeg, FFprobe or Homebrew paths are available to either process.
  const env={...process.env,PATH:''};delete env.DYLD_LIBRARY_PATH;delete env.DYLD_FALLBACK_LIBRARY_PATH;
  const run=(exe,args,childEnv=env)=>execFileSync(exe,args,{env:childEnv,encoding:'utf8',timeout:60000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const executable=process.platform==='win32'?path.resolve(resources,'..',pkg.build.productName+'.exe'):path.resolve(resources,'..','MacOS',pkg.build.productName);
  const smoke=`const assert=require('node:assert/strict');const req=require('node:module').createRequire(${JSON.stringify(path.join(archive,'app','main.js'))});const unpack=p=>p.replace('app.asar','app.asar.unpacked');assert.equal(unpack(req('ffmpeg-static')),${JSON.stringify(ffmpeg)});assert.equal(unpack(req('@ffprobe-installer/ffprobe').path),${JSON.stringify(ffprobe)});assert.equal(typeof req('electron-updater').MacUpdater,'function');console.log('Packaged runtime dependencies resolved');`;
  run(executable,['-e',smoke],{...env,ELECTRON_RUN_AS_NODE:'1'});
  for(const binary of [ffmpeg,ffprobe,speech]){
    if(!fs.existsSync(binary))throw Error(`Missing bundled tool: ${binary}`);
    if(process.platform==='darwin'){
      const arch=run('/usr/bin/lipo',['-archs',binary]).trim();
      if(!arch.split(/\s+/).includes(process.arch==='x64'?'x86_64':'arm64'))throw Error(`Wrong tool architecture: ${binary}: ${arch}`);
      const libraries=run('/usr/bin/otool',['-L',binary]);
      if(/\/opt\/homebrew|\/usr\/local|\/opt\/local|@rpath|@loader_path|@executable_path/.test(libraries))throw Error(`Bundled tool requires external libraries: ${binary}`);
    }
    if(process.platform==='win32'){const imports=windowsImports(fs.readFileSync(binary));if(binary===speech&&imports.some(name=>/^(?:vcruntime|msvcp|concrt|libgcc|libstdc|libgomp|libwinpthread|ggml|whisper)/i.test(name)))throw Error('Speech engine requires a separate runtime DLL: '+imports.join(', '));}
    run(binary,[binary===speech?'--help':'-version']);
  }
  if(process.platform==='darwin')run('/usr/bin/codesign',['--verify','--deep','--strict',path.resolve(resources,'..','..')]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sahl-packaged-'));
  try{
    const model=process.env.SAHL_SPEECH_MODEL;
    if(model){
      const wave=path.join(dir,'silence.wav');run(ffmpeg,['-v','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','2',wave]);
      fs.copyFileSync(model,path.join(dir,'ggml-small.bin'));
      const speechSmoke=`const assert=require('node:assert/strict');const {TranscriptionService}=require(${JSON.stringify(path.join(archive,'app','transcription.js'))});const s=new TranscriptionService(${JSON.stringify(ffmpeg)},${JSON.stringify(speech)},${JSON.stringify(dir)});s.transcribe({assetId:'a',start:0,end:2,at:0,speed:1},{a:{path:${JSON.stringify(wave)},name:'silence',kind:'audio',meta:{audio:true,duration:2}}}).then(r=>{assert.ok(!r.error,r.error);assert.deepEqual(r.cues,[]);console.log('Packaged speech works offline');}).catch(e=>{console.error(e);process.exitCode=1;});`;
      run(executable,['-e',speechSmoke],{...env,ELECTRON_RUN_AS_NODE:'1'});
    }else console.log('Speech inference not checked: set SAHL_SPEECH_MODEL to a verified local model for the offline check.');
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
  console.log(`PASS: packaged ${target} exports and probes SDR/HDR video with PATH empty; bundled speech engine and detector verified, no external tools required.`);
  return {resources,package:JSON.parse(asar.extractFile(archive,'package.json'))};
}
if(require.main===module)verifyPackage();
module.exports={verifyPackage,resourcesPath,windowsImports};

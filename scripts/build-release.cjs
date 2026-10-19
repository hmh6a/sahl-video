const fs=require('node:fs'),path=require('node:path');
async function run(){
  if(!['darwin','win32'].includes(process.platform))throw Error('Build releases on native macOS or Windows runners');
  const mac=process.platform==='darwin';
  const credentials=['CSC_LINK','CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID'];
  // Missing GitHub secrets arrive as empty strings. electron-builder treats an
  // empty CSC_LINK as a certificate path pointing to the project directory.
  for(const key of credentials)if(typeof process.env[key]==='string'&&!process.env[key].trim())delete process.env[key];
  const signed=mac&&!!process.env.CSC_LINK;
  if(mac&&credentials.some(k=>process.env[k])&&!credentials.every(k=>process.env[k]))throw Error('Mac signing requires CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID');
  const {prepare}=require('./prepare-transcription.cjs');
  const runtime=await prepare(),target=process.platform+'-'+process.arch;
  const config={extraMetadata:{sahlAutoUpdate:!mac||signed},files:[
    'app/**/*','package.json','LICENSE','!app/native/transcription/**/*',
    {from:runtime.directory,to:'app/native/transcription/'+target,filter:['whisper-cli','whisper-cli.exe','ggml-silero-v5.1.2.bin','build.json','*-LICENSE.txt']}
  ]};
  if(mac){
    config.mac={identity:signed?undefined:'-',hardenedRuntime:signed,forceCodeSigning:signed,notarize:signed,binaries:[
      'Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg',
      `Contents/Resources/app.asar.unpacked/app/native/transcription/${target}/whisper-cli`,
      `Contents/Resources/app.asar.unpacked/node_modules/@ffprobe-installer/darwin-${process.arch}/ffprobe`
    ]};
    if(!signed)console.log('Building an unsigned Mac release. Direct updates stay disabled until Apple signing secrets are configured.');
  }
  const {build,Platform,Arch}=require('electron-builder');
  await build({targets:(mac?Platform.MAC:Platform.WINDOWS).createTarget(mac?['dmg','zip']:['nsis'],Arch[process.arch]),publish:'never',config});
  const pkg=require('../package.json'),base=mac?`Sahl-Video-${pkg.version}-mac-${process.arch}`:`Sahl-Video-${pkg.version}`;
  for(const ext of mac?['dmg','zip']:['exe']){
    const file=path.resolve(pkg.build.directories.output,base+'.'+ext);
    if(!fs.existsSync(file)||!fs.statSync(file).size)throw Error(`Build did not produce the required installer: ${path.basename(file)}`);
  }
}
// Fail immediately: builder cleanup handlers must not turn a failed build into
// a successful CI step and defer the actual error to prepare-release.
if(require.main===module)run().catch(e=>{console.error(e);process.exit(1);});
module.exports={run};

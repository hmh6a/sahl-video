const {build,Platform,Arch}=require('electron-builder');
async function run(){
  if(!['darwin','win32'].includes(process.platform))throw Error('Build releases on native macOS or Windows runners');
  const mac=process.platform==='darwin';
  const credentials=['CSC_LINK','CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID'];
  const signed=mac&&!!process.env.CSC_LINK;
  if(mac&&credentials.some(k=>process.env[k])&&!credentials.every(k=>process.env[k]))throw Error('Mac signing requires CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID');
  const config={extraMetadata:{sahlAutoUpdate:!mac||signed}};
  if(mac){
    config.mac={identity:signed?undefined:'-',hardenedRuntime:signed,forceCodeSigning:signed,notarize:signed,binaries:[
      'Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg',
      `Contents/Resources/app.asar.unpacked/node_modules/@ffprobe-installer/darwin-${process.arch}/ffprobe`
    ]};
    if(!signed)console.log('Building an unsigned Mac release. Direct updates stay disabled until Apple signing secrets are configured.');
  }
  await build({targets:(mac?Platform.MAC:Platform.WINDOWS).createTarget(mac?['dmg','zip']:['nsis'],Arch[process.arch]),publish:'never',config});
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});

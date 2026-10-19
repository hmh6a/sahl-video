// Explicit developer/CI command. The application only downloads on user request.
const path=require('node:path'),fs=require('node:fs');
const {TranscriptionService}=require('../app/transcription');
async function provision(){
 const directory=path.resolve('test-output/transcription');fs.mkdirSync(directory,{recursive:true});
 const service=new TranscriptionService('', '',directory);let verified=false;
 try{await service.verify();verified=true;}catch{}
 if(!verified){const result=await service.download();if(result.error||result.canceled)throw Error(result.error||'Model download canceled');}
 await service.verify();console.log('Verified speech model: '+service.modelPath);return service.modelPath;
}
if(require.main===module)provision().catch(e=>{console.error(e);process.exitCode=1;});module.exports={provision};

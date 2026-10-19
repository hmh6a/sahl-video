const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {ENGINE_COMMIT:COMMIT,VAD}=require('../app/speech-config');
const root=path.resolve(__dirname,'..');
function runtimeDirectory(platform=process.platform,arch=process.arch){if(!((platform==='darwin'&&['arm64','x64'].includes(arch))||(platform==='win32'&&arch==='x64')))throw Error('Unsupported transcription platform: '+platform+'-'+arch);return path.join(root,'app','native','transcription',platform+'-'+arch);}
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function assertRuntime(platform=process.platform,arch=process.arch){const directory=runtimeDirectory(platform,arch),name=platform==='win32'?'whisper-cli.exe':'whisper-cli',binary=path.join(directory,name);let info;try{info=JSON.parse(fs.readFileSync(path.join(directory,'build.json'),'utf8'));}catch{throw Error('Missing speech runtime; run npm run prepare:transcription on the target platform.');}
 if(info.commit!==COMMIT||info.platform!==platform||info.arch!==arch||info.cpu!=='baseline'||(platform==='win32'&&info.crt!=='static')||info.binarySHA256!==hash(binary)||hash(path.join(directory,VAD.file))!==VAD.sha256)throw Error('Speech runtime is stale or corrupt; run npm run prepare:transcription.');for(const name of ['WHISPER-CPP-LICENSE.txt','SILERO-VAD-LICENSE.txt'])if(!fs.existsSync(path.join(directory,name)))throw Error('Missing speech license: '+name);return {directory,binary,info};}
async function prepare({arch=process.arch}={}){
 const platform=process.platform,target=runtimeDirectory(platform,arch),source=path.join(root,'test-output','speech-build-source'),build=path.join(source,'build-'+platform+'-'+arch);
 if(platform!=='darwin'&&arch!==process.arch)throw Error('Build the speech engine on a native runner.');
 try{const cached=assertRuntime(platform,arch);console.log('Verified cached speech runtime: '+target);return cached;}catch{}
 const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,stdio:'inherit'});
 if(!fs.existsSync(path.join(source,'.git'))){fs.mkdirSync(source,{recursive:true});run('git',['init'],source);run('git',['remote','add','origin','https://github.com/ggml-org/whisper.cpp.git'],source);}
 run('git',['fetch','--depth','1','origin',COMMIT],source);run('git',['checkout','--detach',COMMIT],source);
 const flags=['-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DGGML_NATIVE=OFF','-DGGML_METAL=OFF','-DGGML_OPENMP=OFF','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_EXAMPLES=ON',...['SSE42','AVX','AVX2','AVX512','F16C','FMA','BMI2'].map(x=>'-DGGML_'+x+'=OFF')];
 if(platform==='darwin')flags.push('-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0','-DCMAKE_OSX_ARCHITECTURES='+(arch==='x64'?'x86_64':'arm64'));
 if(platform==='win32')flags.push('-A','x64','-DCMAKE_POLICY_DEFAULT_CMP0091=NEW','-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded$<$<CONFIG:Debug>:Debug>');
 run('cmake',['-S',source,'-B',build,...flags]);run('cmake',['--build',build,'--config','Release','--target','whisper-cli','-j','4']);
 const name=platform==='win32'?'whisper-cli.exe':'whisper-cli',binary=[path.join(build,'bin','Release',name),path.join(build,'bin',name)].find(fs.existsSync);if(!binary)throw Error('whisper-cli binary missing after build');fs.mkdirSync(target,{recursive:true});fs.copyFileSync(binary,path.join(target,name));if(platform!=='win32')fs.chmodSync(path.join(target,name),0o755);
 const vad=path.join(target,VAD.file);if(!fs.existsSync(vad)||hash(vad)!==VAD.sha256){const response=await fetch(VAD.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('VAD download HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==VAD.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==VAD.sha256)throw Error('VAD checksum mismatch');const temp=vad+'.part';fs.writeFileSync(temp,bytes);fs.renameSync(temp,vad);}
 fs.copyFileSync(path.join(source,'LICENSE'),path.join(target,'WHISPER-CPP-LICENSE.txt'));fs.copyFileSync(path.join(root,'app/assets/transcription/SILERO-VAD-LICENSE.txt'),path.join(target,'SILERO-VAD-LICENSE.txt'));
 fs.writeFileSync(path.join(target,'build.json'),JSON.stringify({commit:COMMIT,platform,arch,cpu:'baseline',...(platform==='win32'?{crt:'static'}:{}),vadSHA256:VAD.sha256,binarySHA256:hash(path.join(target,name))},null,2));
 const result=assertRuntime(platform,arch);console.log('Prepared verified native transcription runtime: '+target);return result;
}
if(require.main===module)prepare({arch:process.argv.includes('--x64')?'x64':process.arch}).catch(e=>{console.error(e);process.exit(1);});
module.exports={prepare,assertRuntime,runtimeDirectory,COMMIT};

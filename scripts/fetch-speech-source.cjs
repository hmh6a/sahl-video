const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fetchSpeechSource(directory,commit,{run=execute,wait=delay,log=console.warn}={}){
  for(let attempt=1;attempt<=3;attempt++){
    try{
      await run('git',['fetch','--depth','1','origin',commit],{cwd:directory,timeout:120000,windowsHide:true});
      return;
    }catch(error){
      const transient=/Could not resolve host|Could not resolve proxy|Failed to connect|Connection (?:reset|timed out)|Operation timed out|HTTP (?:502|503|504)\b|requested URL returned error: (?:502|503|504)\b/i.test(String(error.stderr||error.message))||error.code==='ETIMEDOUT';
      if(!transient||attempt===3)throw error;
      log(`Speech source network failure; retrying pinned commit (${attempt+1}/3).`);
      await wait(attempt*2000);
    }
  }
}
module.exports={fetchSpeechSource};

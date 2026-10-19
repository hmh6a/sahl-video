const {test}=require('node:test'),assert=require('node:assert/strict');
const {fetchSpeechSource}=require('../scripts/fetch-speech-source.cjs');
const {ENGINE_COMMIT}=require('../app/speech-config');
test('temporary DNS failure retries the same pinned fetch with bounded backoff',async()=>{
 const calls=[],waits=[];
 await fetchSpeechSource('/source',ENGINE_COMMIT,{run:async(...args)=>{calls.push(args);if(calls.length<3)throw Object.assign(Error('git failed'),{stderr:'fatal: Could not resolve host: github.com'});},wait:async ms=>waits.push(ms),log(){}});
 assert.equal(calls.length,3);assert.deepEqual(waits,[2000,4000]);
 for(const call of calls){assert.deepEqual(call.slice(0,2),['git',['fetch','--depth','1','origin',ENGINE_COMMIT]]);assert.equal(call[2].cwd,'/source');assert.equal(call[2].timeout,120000);}
});
test('persistent network failure stops after three attempts and preserves the error',async()=>{
 const error=Object.assign(Error('git failed'),{stderr:'Failed to connect to github.com'});let calls=0;
 await assert.rejects(fetchSpeechSource('/source',ENGINE_COMMIT,{run:async()=>{calls++;throw error;},wait:async()=>{},log(){}}),e=>e===error);assert.equal(calls,3);
});
test('invalid refs and authorization errors fail immediately',async()=>{
 for(const stderr of ['fatal: not our ref deadbeef','fatal: Authentication failed','fatal: repository not found']){
  let calls=0,waits=0;const error=Object.assign(Error('git failed'),{stderr});
  await assert.rejects(fetchSpeechSource('/source',ENGINE_COMMIT,{run:async()=>{calls++;throw error;},wait:async()=>{waits++;},log(){}}),e=>e===error);assert.equal(calls,1);assert.equal(waits,0);
 }
});

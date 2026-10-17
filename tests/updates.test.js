const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Updates}=require('../app/updates');
class Updater extends EventEmitter {
  checks=0;downloads=0;installs=[];
  async checkForUpdates(){this.checks++;await new Promise(r=>setImmediate(r));this.emit('update-available',{version:'1.0.1'});}
  async downloadUpdate(token){this.downloads++;this.token=token;this.emit('download-progress',{percent:45});await new Promise(r=>setImmediate(r));if(token.cancelled)throw Error('canceled');this.emit('update-downloaded',{version:'1.0.1'});return ['private-cache/update'];}
  quitAndInstall(...args){this.installs.push(args);}
}
function fixture(options={}){const updater=new Updater(),states=[];const service=new Updates('1.0.0',{updater,notify:s=>states.push(s),tokenFactory:()=>({cancelled:false,cancel(){this.cancelled=true;}}),...options});return {updater,service,states};}
test('updates use the native updater cache and require an explicit install without auto-install on quit',async()=>{
 const {updater,service,states}=fixture();
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowPrerelease,false);assert.equal(updater.allowDowngrade,false);
 const first=service.check();assert.equal(service.check(),first);assert.equal((await first).phase,'available');assert.equal(updater.checks,1);
 const pending=service.download();assert.equal(service.download(),pending);assert.equal((await pending).phase,'downloaded');assert.equal(updater.downloads,1);assert.equal(updater.installs.length,0);
 assert.ok(states.some(s=>s.percent===45));assert.equal((await service.check()).phase,'downloaded');
 assert.equal(service.install().phase,'installing');service.install();assert.deepEqual(updater.installs,[[true,true]]);
});
test('failed integrity verification never enables installation and download can be retried',async()=>{
 const {updater,service}=fixture();await service.check();
 const real=updater.downloadUpdate.bind(updater);updater.downloadUpdate=async()=>{throw Error('sha512 checksum mismatch');};
 assert.equal((await service.download()).phase,'error');assert.equal(service.status().canInstall,false);service.install();assert.equal(updater.installs.length,0);
 updater.downloadUpdate=real;assert.equal((await service.download()).phase,'downloaded');
});
test('canceling an in-app download restores the update button and permits retry',async()=>{
 const {service,updater}=fixture();await service.check();const pending=service.download();service.cancel();
 assert.equal((await pending).phase,'available');assert.equal(service.downloaded,false);assert.equal(updater.installs.length,0);
 assert.equal((await service.download()).phase,'downloaded');
});
test('offline checks and installation errors are reported without losing the ready update',async()=>{
 const {service,updater}=fixture();updater.checkForUpdates=async()=>{throw Error('offline');};assert.equal((await service.check()).phase,'error');
 updater.checkForUpdates=Updater.prototype.checkForUpdates;await service.check();await service.download();updater.quitAndInstall=()=>{throw Error('installation denied');};
 assert.equal(service.install().phase,'error');assert.equal(service.status().canInstall,true);
 updater.quitAndInstall=Updater.prototype.quitAndInstall;assert.equal(service.install().phase,'installing');
});
test('development and unsigned Mac builds cannot check, download or install through the native updater',async()=>{
 const {service,updater}=fixture({enabled:false,disabledReason:'unsigned Mac'});
 assert.equal((await service.check()).phase,'disabled');assert.equal((await service.download()).phase,'disabled');assert.equal(service.install().phase,'disabled');assert.equal(updater.checks,0);assert.equal(updater.downloads,0);assert.equal(updater.installs.length,0);
});

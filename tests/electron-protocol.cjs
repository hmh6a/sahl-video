const {app,protocol,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {mediaResponse}=require('../app/media');
app.setPath('userData',path.resolve('test-output/protocol-profile'));
protocol.registerSchemesAsPrivileged([{scheme:'sahl-test',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.whenReady().then(async()=>{
 const file=path.resolve('test-output/electron-range.bin');fs.writeFileSync(file,'0123456789abcdef');
 protocol.handle('sahl-test',request=>mediaResponse(file,request));
 try{const result=await net.fetch('sahl-test://video/source',{headers:{Range:'bytes=9-12'}});assert.equal(result.status,206);assert.equal(result.headers.get('content-range'),'bytes 9-12/16');assert.equal(await result.text(),'9abc');console.log('PASS: Electron custom media protocol serves the selected byte range');app.exit(0);}catch(e){console.error(e);app.exit(1);}
});

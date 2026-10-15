const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const {FrameService}=require('../app/frames'),ffmpeg=require('ffmpeg-static');
const dir=path.resolve('test-output');fs.mkdirSync(dir,{recursive:true});
test('timeline thumbnails decode distinct source times, cache repeated seeks and invalidate on import',async()=>{
 const file=path.join(dir,'frames-source.mp4');
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=320x180:r=10:d=4','-c:v','libx264',file],{windowsHide:true});
 const service=new FrameService(ffmpeg);service.setSource(file,4);
 const first=service.get(.2),again=service.get(.2);assert.equal(first,again);
 const images=await Promise.all([first,service.get(1.5),service.get(3.5)]);
 assert.ok(images.every(i=>i?.startsWith('data:image/jpeg;base64,')));assert.equal(new Set(images).size,3);
 const old=service.get(2.5);service.setSource(file,4);assert.equal(await old,null);assert.ok(await service.get(.2));
});

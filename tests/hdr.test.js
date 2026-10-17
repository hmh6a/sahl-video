const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const ffmpeg=require('ffmpeg-static'),ffprobe=require('@ffprobe-installer/ffprobe').path;
const {inspect,exportArgs}=require('../app/export'),{detectEncoders}=require('../app/encoding'),{FrameService}=require('../app/frames');
const dir=path.resolve('test-output/hdr');fs.mkdirSync(dir,{recursive:true});
const run=args=>execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'pipe',timeout:60000});
const probe=file=>JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{stdio:'pipe'}));
const file=name=>path.join(dir,name),sources={};
const luma=(name,time=.4)=>run(['-ss',String(time),'-i',name,'-frames:v','1','-pix_fmt','yuv420p10le','-f','rawvideo','-']);
const at=(buffer,x,y=200)=>buffer.readUInt16LE((y*640+x)*2);
function fixture(transfer){
 const name=file(transfer+'.mkv');
 run(['-f','lavfi','-i','nullsrc=s=640x360:r=60000/1001:d=1,format=yuv420p10le,geq=lum=64+876*X/W:cb=512:cr=512','-f','lavfi','-i','sine=frequency=440:duration=1','-color_trc',transfer,'-color_primaries','bt2020','-colorspace','bt2020nc','-color_range','tv','-c:v','ffv1','-c:a','pcm_s16le',name]);
 const meta=inspect(probe(name));sources[transfer]={path:name,kind:'video',meta};return sources[transfer];
}
test('PQ and HLG export as real 10-bit HDR with audio, timed alpha titles and unchanged highlight detail',()=>{
 const title=file('title.png');
 run(['-f','lavfi','-i','color=black@0:s=640x360,format=rgba,drawbox=x=40:y=40:w=160:h=80:color=white:t=fill:replace=1','-frames:v','1',title]);
 for(const transfer of ['smpte2084','arib-std-b67']){
  const a=fixture(transfer),output=file(transfer+'.mp4');
  run(exportArgs(a.path,[{path:title,start:.1,duration:.6,animation:'fade'}],output,a.meta,{start:0,end:.9,quality:'maximum'}));
  const data=probe(output),v=data.streams.find(s=>s.codec_type==='video');
  assert.equal(v.codec_name,'hevc');assert.equal(v.profile,'Main 10');assert.equal(v.codec_tag_string,'hvc1');assert.equal(v.pix_fmt,'yuv420p10le');
  assert.equal(v.color_transfer,transfer);assert.equal(v.color_primaries,'bt2020');assert.equal(v.color_space,'bt2020nc');assert.equal(v.color_range,'tv');
  assert.equal(v.width,640);assert.equal(v.height,360);assert.equal(v.r_frame_rate,a.meta.fps);const [n,d]=v.avg_frame_rate.split('/').map(Number);assert.ok(Math.abs(n/d-60000/1001)<.01);assert.ok(data.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(data.format.duration)-.9)<.04);
  const original=luma(a.path),result=luma(output),after=luma(output,.8),before=luma(output,0);
  let error=0;const levels=new Set();for(let x=10;x<630;x++){error+=Math.abs(at(result,x)-at(original,x));levels.add(at(result,x));}
  assert.ok(error/620<3,`HDR signal changed: mean error ${error/620}`);assert.ok(levels.size>256,'HDR must not pass through an 8-bit intermediate');
  assert.ok(at(result,610)>880,'HDR highlights must not be tone mapped to SDR');
  assert.ok(Math.abs(at(result,80,70)-(transfer==='smpte2084'?572:720))<8,'sRGB title white must map to reference white, not HDR peak');
  assert.ok(Math.abs(at(before,80,70)-at(original,80,70))<8,'title must start at its scheduled time');
  assert.ok(Math.abs(at(after,80,70)-at(original,80,70))<8,'title must end at its scheduled time');
  run(['-xerror','-i',output,'-f','null','-']);
 }
});
test('mixed HDR, SDR and still images share the first HDR color space without clipping SDR whites',()=>{
 const sdr=file('sdr.mp4'),image=file('white.png'),output=file('mixed.mp4');
 run(['-f','lavfi','-i','color=white:s=640x360:r=60000/1001:d=1','-c:v','libx264','-color_trc','bt709','-colorspace','bt709','-color_primaries','bt709',sdr]);
 run(['-f','lavfi','-i','color=white:s=640x360','-frames:v','1',image]);
 const assets={pq:sources.smpte2084,hlg:sources['arib-std-b67'],sdr:{path:sdr,kind:'video',meta:inspect(probe(sdr))},image:{path:image,kind:'image',meta:{width:640,height:360,duration:5,audio:false,hdr:false}}};
 const clips=['pq','sdr','hlg','image'].map(assetId=>({assetId,start:0,end:.5,transition:'none'}));
 run(exportArgs(assets,null,output,assets.pq.meta,{clips}));
 const data=probe(output);assert.equal(inspect(data).color.transfer,'smpte2084');assert.ok(Math.abs(Number(data.format.duration)-2)<.04);
 for(const time of [.7,1.7])assert.ok(Math.abs(at(luma(output,time),300)-572)<8,'SDR/image white should be 203 nits in PQ');
 // Audio is present through the montage, including silence for image/silent segments.
 assert.ok(data.streams.find(s=>s.codec_type==='audio').duration>1.98);
});
test('HDR preview frames are tone mapped for SDR thumbnails without changing the source',async()=>{
 const a=sources.smpte2084,f=new FrameService(ffmpeg);f.setSource(a.path,a.meta.duration,a.meta);
 const result=await f.get(.2,176);assert.match(result,/^data:image\/jpeg;base64,/);
 const preview=file('preview.jpg');fs.writeFileSync(preview,Buffer.from(result.split(',')[1],'base64'));
 assert.equal(probe(preview).streams[0].width,176);assert.equal(inspect(probe(a.path)).hdr,true);
});
test('verified Main 10 hardware exports HDR with transitions and titles',async t=>{
 const device=(await detectEncoders(ffmpeg)).find(d=>d.hdrEncoder);
 if(!device){t.skip('No verified 10-bit HEVC hardware on this host');return;}
 const a=sources.smpte2084,output=file('hardware.mp4');
 run(exportArgs(a.path,[{path:file('title.png'),start:0,duration:.7,animation:'fade'}],output,a.meta,{encoder:device.id,hdrEncoder:device.hdrEncoder,clips:[{start:0,end:.4,transition:'fade'},{start:.5,end:.9,transition:'none'}]}));
 const v=probe(output).streams[0];assert.equal(v.profile,'Main 10');assert.equal(v.color_transfer,'smpte2084');assert.equal(v.pix_fmt,'yuv420p10le');
 run(['-xerror','-i',output,'-f','null','-']);
 assert.ok(at(luma(output,.1),610)>850);assert.ok(at(luma(output,.4),610)<85,'transition should fade to HDR black');
 const input4k=file('4k60.mkv'),output4k=file('4k60.mp4');
 run(['-f','lavfi','-i','color=white:s=3840x2160:r=60:d=0.4,format=yuv420p10le','-c:v','ffv1','-color_trc','smpte2084','-color_primaries','bt2020','-colorspace','bt2020nc',input4k]);
 run(exportArgs(input4k,[{path:file('title.png'),start:0,duration:.4}],output4k,inspect(probe(input4k)),{start:0,end:.4,encoder:device.id,hdrEncoder:device.hdrEncoder}));
 const large=probe(output4k).streams[0];assert.equal(large.width,3840);assert.equal(large.height,2160);assert.equal(large.avg_frame_rate,'60/1');assert.equal(large.pix_fmt,'yuv420p10le');assert.equal(large.color_transfer,'smpte2084');
 run(['-xerror','-i',output4k,'-f','null','-']);
});

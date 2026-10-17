const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const candidates=[{id:'h264_videotoolbox',name:'Apple · VideoToolbox'},{id:'h264_nvenc',name:'NVIDIA · NVENC'},{id:'h264_amf',name:'AMD · AMF'},{id:'h264_qsv',name:'Intel · Quick Sync'}];
function encodingArgs(encoder='cpu',quality='high',video={width:1920,height:1080,fps:'30'}) {
  const q=quality==='maximum'?'15':'18';
  if(video.hdr){
    const common=['-profile:v','main10','-tag:v','hvc1','-pix_fmt',encoder==='cpu'?'yuv420p10le':'p010le'];
    if(encoder==='cpu')return ['-c:v','libx265','-preset','fast','-crf',q,...common];
    if(encoder==='hevc_videotoolbox')return [...encodingArgs('h264_videotoolbox',quality,{...video,hdr:false}).map(v=>v==='h264_videotoolbox'?encoder:v),...common];
    if(encoder==='hevc_nvenc')return ['-c:v',encoder,'-preset','p5','-rc','vbr','-cq',q,'-b:v','0',...common];
    if(encoder==='hevc_amf')return ['-c:v',encoder,'-quality','quality','-rc','cqp','-qp_i',q,'-qp_p',q,...common];
    if(encoder==='hevc_qsv')return ['-c:v',encoder,'-preset','medium','-global_quality',q,...common];
    throw new Error('ترميز HDR يحتاج HEVC بعمق 10-bit. اختار المعالج CPU.');
  }
  if(encoder==='cpu')return ['-c:v','libx264','-preset','fast','-crf',q];
  if(encoder==='h264_videotoolbox'){
    // Bitrate mode works on Intel Macs too; VideoToolbox constant quality is Apple Silicon only.
    const [frames,seconds=1]=String(video.fps).split('/').map(Number);
    const bitrate=Math.round(Math.max(quality==='maximum'?4000000:2000000,video.width*video.height*(frames/seconds)*(quality==='maximum'?0.2:0.12)));
    return ['-c:v','h264_videotoolbox','-allow_sw','0','-b:v',String(bitrate)];
  }
  if(encoder==='h264_nvenc')return ['-c:v','h264_nvenc','-preset','p5','-rc','vbr','-cq',q,'-b:v','0'];
  if(encoder==='h264_amf')return ['-c:v','h264_amf','-quality','quality','-rc','cqp','-qp_i',q,'-qp_p',q];
  if(encoder==='h264_qsv')return ['-c:v','h264_qsv','-preset','medium','-global_quality',q];
  throw new Error('اختار كارت شاشة مدعوم أو المعالج من إعدادات التصدير.');
}
async function detectEncoders(ffmpeg) {
  const results=await Promise.all(candidates.map(async candidate=>{
    try {
      await exec(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=size=1280x720:rate=60','-frames:v','3','-pix_fmt','yuv420p',...encodingArgs(candidate.id,'high',{width:1280,height:720,fps:'60'}),'-f','null','-'],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
      // H.264 support does not imply HEVC Main 10 support (especially older GPUs).
      const hdrEncoder=candidate.id.replace('h264_','hevc_');
      try{
        await exec(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=size=1280x720:rate=60,format=yuv420p10le','-frames:v','3',...encodingArgs(hdrEncoder,'high',{width:1280,height:720,fps:'60',hdr:true}),'-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc','-f','null','-'],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
        return {...candidate,hdrEncoder};
      }catch{return candidate;}
    }catch{return null;}
  }));
  return results.filter(Boolean);
}
module.exports={encodingArgs,detectEncoders};

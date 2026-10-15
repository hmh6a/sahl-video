const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const candidates=[{id:'h264_nvenc',name:'NVIDIA · NVENC'},{id:'h264_amf',name:'AMD · AMF'},{id:'h264_qsv',name:'Intel · Quick Sync'}];
function encodingArgs(encoder='cpu',quality='high') {
  const q=quality==='maximum'?'15':'18';
  if(encoder==='cpu')return ['-c:v','libx264','-preset','fast','-crf',q];
  if(encoder==='h264_nvenc')return ['-c:v','h264_nvenc','-preset','p5','-rc','vbr','-cq',q,'-b:v','0'];
  if(encoder==='h264_amf')return ['-c:v','h264_amf','-quality','quality','-rc','cqp','-qp_i',q,'-qp_p',q];
  if(encoder==='h264_qsv')return ['-c:v','h264_qsv','-preset','medium','-global_quality',q];
  throw new Error('اختار كارت شاشة مدعوم أو المعالج من إعدادات التصدير.');
}
async function detectEncoders(ffmpeg) {
  const results=await Promise.all(candidates.map(async candidate=>{
    try {
      await exec(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=size=1280x720:rate=60','-frames:v','3','-pix_fmt','yuv420p',...encodingArgs(candidate.id),'-f','null','-'],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
      return candidate;
    }catch{return null;}
  }));
  return results.filter(Boolean);
}
module.exports={encodingArgs,detectEncoders};

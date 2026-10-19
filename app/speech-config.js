// Model bytes are verified before use; these are data files, never downloaded executables.
const ENGINE_COMMIT='4979e04f5dcaccb36057e059bbaed8a2f5288315';
const VAD={file:'ggml-silero-v5.1.2.bin',bytes:885098,sha256:'29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf',url:'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin'};
const MODEL={id:'small',name:'Whisper Small متعدد اللغات',bytes:487601967,sha256:'1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',url:'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'};
function recognitionArgs(model,wave,out,vad){return ['-m',model,'-f',wave,'-l','ar','-oj','-of',out,'-pp','-ng','-t','4','--vad','-vm',vad,'-vt','0.5','-vspd','250','-vsd','300','-vp','200','-vmsd','30'];}
module.exports={ENGINE_COMMIT,VAD,MODEL,recognitionArgs};

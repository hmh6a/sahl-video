// Created on the first playback gesture, shared across all clips on the main track.
let audioPreview=null;
async function prepareAudioPreview(){
  if(!audioPreview){
    const context=new AudioContext(),source=context.createMediaElementSource(video),gain=context.createGain(),limiter=context.createWaveShaper(),analyser=context.createAnalyser();
    const curve=new Float32Array(65537);for(let i=0;i<curve.length;i++)curve[i]=SahlClipSettings.limit((i/(curve.length-1)*2-1)*2)/2;
    // WaveShaper inputs are [-1,1]. Scale before/after to cover gains up to 2.
    const pre=context.createGain(),post=context.createGain(),bus=context.createGain(),masterPre=context.createGain(),masterPost=context.createGain(),masterLimiter=context.createWaveShaper();masterPre.gain.value=.5;masterPost.gain.value=2;pre.gain.value=.5;post.gain.value=2;limiter.curve=curve;
    source.connect(gain);gain.connect(pre);pre.connect(limiter);limiter.connect(post);post.connect(bus);bus.connect(masterPre);masterPre.connect(masterLimiter);masterLimiter.connect(masterPost);masterPost.connect(analyser);analyser.connect(context.destination);analyser.fftSize=256;
    audioPreview={context,gain,limiter,curve,analyser,bus,masterLimiter,mixLimited:false,limited:true,samples:new Float32Array(analyser.fftSize)};video.volume=1;
  }
  await audioPreview.context.resume();updateClipAudio();
}
function updateClipAudio(){
  const at=TL.locate(clips,cursor),c=at&&clips[at.index],a=SahlClipSettings.audio(c?.audio),level=c&&SahlAudioTracks.audible(mainTrack,mainTrack,audioTracks)?SahlClipSettings.gain(a,at.local,c.end-c.start)*TL.gain(clips,cursor):0;
  if(audioPreview){audioPreview.gain.gain.value=level;const limited=a.volume>1;if(audioPreview.limited!==limited){audioPreview.limiter.curve=limited?audioPreview.curve:null;audioPreview.limited=limited;}const mixLimited=audioTracks.some(t=>SahlAudioTracks.audible(t,mainTrack,audioTracks)&&t.clips.some(c=>c.at<total()));if(audioPreview.mixLimited!==mixLimited){audioPreview.masterLimiter.curve=mixLimited?audioPreview.curve:null;audioPreview.mixLimited=mixLimited;}video.volume=1;}
  else video.volume=Math.min(1,level);
  const meter=$('clip-audio-meter');if(!meter)return;
  let peak=0;if(audioPreview&&playing){audioPreview.analyser.getFloatTimeDomainData(audioPreview.samples);for(const sample of audioPreview.samples)peak=Math.max(peak,Math.abs(sample));}
  meter.value=Math.min(1,peak);meter.title=peak>0?(20*Math.log10(peak)).toFixed(1)+' dBFS':'لا يوجد صوت';
}

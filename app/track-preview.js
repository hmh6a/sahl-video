const trackPlayers=new Map();let trackPlaybackRevision=0;
function pauseTrackAudio(){trackPlaybackRevision++;for(const player of trackPlayers.values()){player.abort?.abort();player.media.pause();player.pending=null;player.gain.gain.value=0;}}
function resetTrackPreview(){pauseTrackAudio();for(const player of trackPlayers.values()){player.source.disconnect();player.gain.disconnect();player.post.disconnect();player.media.removeAttribute('src');player.media.load();}trackPlayers.clear();}
function trackAudioFailure(error){if(error?.message==='canceled')return;pause();status('تعذّر تشغيل مسار الصوت: '+error.message,true);}
function trackPlayer(c){
  let p=trackPlayers.get(c.id);if(p)return p;const asset=assets.find(a=>a.id===c.assetId),context=audioPreview.context,media=new Audio();media.crossOrigin='anonymous';media.preload='auto';media.src=asset.url;
  const source=context.createMediaElementSource(media),gain=context.createGain(),pre=context.createGain(),limiter=context.createWaveShaper(),post=context.createGain();pre.gain.value=.5;post.gain.value=2;gain.gain.value=0;source.connect(gain);gain.connect(pre);pre.connect(limiter);limiter.connect(post);post.connect(audioPreview.bus);media.load();
  p={media,source,gain,limiter,post,limited:false,pending:null,abort:null};trackPlayers.set(c.id,p);return p;
}
async function syncTrackAudio(time,run,prepare=false){
  if(!audioPreview)return;const revision=trackPlaybackRevision,active=new Set(),jobs=[];
  for(const track of audioTracks)for(const c of track.clips){
    const local=time-c.at;if(!run||local<0||local>=TL.length(c)||!AT.audible(track,mainTrack,audioTracks))continue;active.add(c.id);const p=trackPlayer(c),a=SettingsAudio(c.audio),limited=a.volume>1;
    const linkedGain=c.link?TL.audioGain(clips,clips.findIndex(p=>p.id===c.link.clipId),time):1;p.gain.gain.value=SahlClipSettings.gain(a,local,TL.length(c))*linkedGain;if(p.limited!==limited){p.limiter.curve=limited?audioPreview.curve:null;p.limited=limited;}
    if(p.pending){jobs.push(p.pending);continue;}const target=TL.sourceTime(c,local);p.media.playbackRate=TL.rate(c);p.media.preservesPitch=c.preservePitch!==false;
    if(p.media.paused||Math.abs(p.media.currentTime-target)>.12){
      p.abort?.abort();const controller=new AbortController();p.abort=controller;
      const job=(async()=>{await SahlPlayback.seekReady(p.media,Math.min(target,c.end-.001),controller.signal);if(controller.signal.aborted||revision!==trackPlaybackRevision||prepare)return;await p.media.play();if(controller.signal.aborted||revision!==trackPlaybackRevision)p.media.pause();})();
      const pending=job.catch(e=>{if(!controller.signal.aborted)throw e;}).finally(()=>{if(p.pending===pending)p.pending=null;});p.pending=pending;jobs.push(pending);
    }
  }
  const valid=new Set(audioTracks.flatMap(t=>t.clips.map(c=>c.id)));
  for(const [id,p]of trackPlayers)if(!active.has(id)){p.abort?.abort();p.media.pause();p.gain.gain.value=0;p.pending=null;if(!valid.has(id)){p.source.disconnect();p.gain.disconnect();p.post.disconnect();p.media.removeAttribute('src');p.media.load();trackPlayers.delete(id);}}
  await Promise.all(jobs);
}

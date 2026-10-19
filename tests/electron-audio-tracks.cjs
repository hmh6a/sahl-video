// Native renderer integration: actual preload, custom media protocol and Web Audio.
const {app,BrowserWindow,protocol,ipcMain}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {MediaLibrary}=require('../app/library'),{mediaResponse}=require('../app/media'),Project=require('../app/project');
app.setPath('userData',path.resolve('test-output/audio-tracks-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{scheme:'sahl-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const deadline=setTimeout(()=>{console.error('Native clip controls test timed out');app.exit(1);},60000);
app.whenReady().then(async()=>{
  const library=new MediaLibrary(require('ffmpeg-static'),require('@ffprobe-installer/ffprobe').path),imported=await library.import([path.resolve('test-output/three-colors.mp4')]);let saved;
  const musicFile=path.resolve('test-output/batch-02-music.wav');require('node:child_process').execFileSync(require('ffmpeg-static'),['-v','error','-y','-f','lavfi','-i','sine=frequency=900:duration=6',musicFile]);const music=await library.import([musicFile]),photo=await library.import([path.resolve('test-output/photo.png')]);
  protocol.handle('sahl-media',request=>{const id=new URL(request.url).pathname.slice(1),a=library.assets[id];return a?mediaResponse(a.path,request):new Response(null,{status:404});});
  for(const channel of ['fonts','encoders','list-templates','list-recovery'])ipcMain.handle(channel,()=>[]);
  ipcMain.handle('update-status',()=>({phase:'disabled',installedVersion:'test'}));ipcMain.handle('choose-media',(_,kind)=>kind==='audio'?music:kind==='image'?photo:imported);
  ipcMain.handle('waveform',(_,id)=>library.waveforms.get(library.assets[id]));
  ipcMain.handle('thumbnail',(_,id,t)=>library.frame(id,t,176));ipcMain.handle('frame',(_,id,t)=>library.frame(id,t,960));
  ipcMain.handle('save-project',(_,raw)=>{saved=Project.state(raw,library.assets);return {path:'test.sahl',folder:'test-output',name:'test'};});
  ipcMain.handle('open-project',()=>({state:saved,assets:library.descriptors(),path:'test.sahl'}));ipcMain.on('project-state',()=>{});
  const win=new BrowserWindow({show:false,width:1500,height:960,webPreferences:{preload:path.resolve('app/preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',(...args)=>{const level=args[0].level??args[1],message=args[0].message??args[2];if(level==='error'||level===3)errors.push(message);});
  try{
    await win.loadFile(path.resolve('app/index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const check=(ok,message)=>{if(!ok)throw new Error(message);},wait=ms=>new Promise(r=>setTimeout(r,ms));
      const change=(id,value)=>{const el=$(id);if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));};
      await importResult(()=>window.sahl.choose());await importResult(()=>window.sahl.choose('audio'),{insert:true,time:0});
      check(audioTracks.length===1&&audioTracks[0].clips.length===1,'audio import');const musicId=audioTracks[0].clips[0].id;
      change('audio-end',2);change('audio-at',1);change('audio-volume',70);change('audio-fade-in',.2);check(audioTracks[0].clips[0].at===1&&audioTracks[0].clips[0].audio.volume===.7,'audio properties');
      change('audio-fade-in',0);change('audio-volume',100);const initial=snapshot();
      // One undo for a duplicate or grouped drag, including two selected pieces.
      selectAudio(musicId);const count=history.length;duplicateTimelineSelection();check(audioTracks[0].clips.length===2&&history.length===count+1,'duplicate undo group');
      const second=selectedAudio;check(selectedAudioEntry().clip.at===3,'duplicate placement');timelineSelection=['audio:'+musicId,'audio:'+second];snapEnabled=false;
      const surface=$('timeline-surface'),capture=surface.setPointerCapture;surface.setPointerCapture=()=>{};
      const before=history.length;startEditDrag({pointerId:1,clientX:0},'audio',musicId);const scale=editDrag.scale;applyEditDrag({pointerId:1,clientX:.5/scale});applyEditDrag({pointerId:1,clientX:1/scale});finishEditDrag({pointerId:1});surface.setPointerCapture=capture;
      check(history.length===before+1,'group drag one undo');check(audioTracks[0].clips[0].at===2&&audioTracks[0].clips[1].at===4,'group drag positions');undo();check(audioTracks[0].clips[0].at===1&&audioTracks[0].clips[1].at===3,'group drag undo');
      selectAudio(musicId);$('audio-delete-mode').value='ripple';deleteTimelineSelection();check(audioTracks[0].clips[0].at===1,'ripple closes selected interval');undo();$('audio-delete-mode').value='gap';deleteTimelineSelection();check(audioTracks[0].clips[0].at===3,'gap retains position');undo();
      // Track lock blocks a whole mixed selection without an undo or partial mutation.
      audioTracks[0].locked=true;timelineSelection=['clip:'+clips[0].id,'audio:'+musicId];const lockedBefore=history.length;deleteTimelineSelection();check(clips.length===1&&audioTracks[0].clips.length===2&&history.length===lockedBefore,'locked batch atomic');audioTracks[0].locked=false;
      restore(initial);
      // Edge trimming updates the source and timeline time, in one undo step.
      const cap=surface.setPointerCapture;surface.setPointerCapture=()=>{};selectAudio(musicId);startEditDrag({pointerId:2,clientX:0},'audio',musicId,'start');const trimScale=editDrag.scale;applyEditDrag({pointerId:2,clientX:.5/trimScale});finishEditDrag({pointerId:2});surface.setPointerCapture=cap;
      check(selectedAudioEntry().clip.start===.5&&selectedAudioEntry().clip.at===1.5,'audio edge trim');undo();check(selectedAudioEntry().clip.start===0,'trim undo');
      // Modifier and marquee selection pass through the real DOM listeners.
      const clipEl=document.querySelector('.clip');clipEl.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,ctrlKey:true}));check(selectedKeys().includes('clip:'+clips[0].id)&&selectedKeys().includes('audio:'+musicId),'modifier selection');
      const cap2=surface.setPointerCapture;surface.setPointerCapture=()=>{};const rect=surface.getBoundingClientRect();surface.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,shiftKey:true,pointerId:3,clientX:rect.left,clientY:rect.top}));surface.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:3,clientX:rect.right,clientY:rect.bottom}));surface.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:3}));surface.setPointerCapture=cap2;check(selectedKeys().includes('clip:'+clips[0].id)&&selectedKeys().includes('audio:'+musicId),'marquee selection');
      restore(initial);selectionKind='clip';timelineSelection=['clip:'+clips[0].id];selectedClip=0;extractSelectedAudio();check(audioTracks.length===2&&clips[0].audio.muted,'extract suppresses double audio');
      const linkedId=audioTracks[1].clips[0].id;selectionKind='clip';timelineSelection=['clip:'+clips[0].id];seekTo(3);splitHere();check(clips.length===2&&audioTracks[1].clips.length===2,'linked split');check(audioTracks[1].clips[1].link.clipId===clips[1].id&&audioTracks[1].clips[1].at===3,'linked source mapping');
      timelineSelection=['clip:'+clips[1].id];moveMainSelection(1,0);check(audioTracks[1].clips.find(c=>c.link.clipId===clips[0].id).at===0,'linked reorder');check(audioTracks[0].clips[0].at===1,'music fixed on reorder');undo();
      audioTracks[1].locked=true;selectionKind='clip';selectedClip=0;const beforeLocked=clips.length;seekTo(1);splitHere();check(clips.length===beforeLocked,'locked linked track blocks parent split');audioTracks[1].locked=false;
      selectAudio(linkedId);$('unlink-audio').click();check(!selectedAudioEntry().clip.link,'unlink');undo();
      selectTitle(titles[0].id);change('title-binding',clips[1].id);$('title-start').value='4';$('title-start').dispatchEvent(new Event('input',{bubbles:true}));check(titles[0].link.offset===1,'title numeric binding');timelineSelection=['clip:'+clips[1].id];moveMainSelection(1,0);check(titles[0].titleStart===1,'linked title reorder');await saveCurrentProject();check(titles[0].titleStart===1,'save preserves linked title position');undo();check(titles[0].titleStart===4,'linked title undo');
      openMarker();$('marker-name').value='إشارة الموسيقى';$('marker-time').value='1.5';$('save-marker').click();check(markers.length===1,'named marker');snapEnabled=true;check(snapTimelineTime(1.51)===1.5,'marker snapping');snapEnabled=false;
      await saveCurrentProject();const savedSnapshot=JSON.stringify({audioTracks,markers,mainTrack});audioTracks=[];markers=[];await openSavedProject();check(JSON.stringify({audioTracks,markers,mainTrack})===savedSnapshot,'saved audio round trip');
      // Real Web Audio playback: solo music is silent before its start, then synchronized.
      audioTracks[0].solo=true;refreshAfterEdit();seekTo(.2);await $('play').onclick();await wait(250);audioPreview.analyser.getFloatTimeDomainData(audioPreview.samples);check(audioPreview.samples.every(s=>Math.abs(s)<1e-6),'solo suppresses main audio before music');pause();
      seekTo(1.2);await $('play').onclick();await wait(450);check(playing,'playback running');const p=trackPlayers.get(musicId);check(p&&!p.media.paused,'music plays');check(Math.abs((p.media.currentTime-audioTracks[0].clips[0].start)-(cursor-audioTracks[0].clips[0].at))<.16,'music sync after seek');audioPreview.analyser.getFloatTimeDomainData(audioPreview.samples);const peak=Math.max(...audioPreview.samples.map(Math.abs));check(peak>.01,'native music audible');pause();check([...trackPlayers.values()].every(p=>p.media.paused),'pause stops all tracks');
      audioTracks[0].muted=true;seekTo(1.2);await $('play').onclick();await wait(250);audioPreview.analyser.getFloatTimeDomainData(audioPreview.samples);check(audioPreview.samples.every(s=>Math.abs(s)<1e-6),'muted solo is silent');pause();audioTracks[0].muted=false;audioTracks[0].solo=false;
      seekTo(2.8);await $('play').onclick();await wait(700);check(cursor>3.2&&playing,'cross segment playback');const linked=audioTracks[1].clips.find(c=>c.at===3),player=trackPlayers.get(linked.id);check(player&&!player.media.paused&&Math.abs(player.media.currentTime-(linked.start+cursor-linked.at))<.16,'linked audio across cut');pause();
      const beforeImage=snapshot();await importResult(()=>window.sahl.choose('image'),{insert:true,time:0});clips[0].end=1;refreshAfterEdit();audioTracks[0].clips[0].at=0;audioTracks[0].solo=true;seekTo(.2);await $('play').onclick();await wait(250);check(playing&&trackPlayers.get(musicId)&&!trackPlayers.get(musicId).media.paused,'music over still image');pause();restore(beforeImage);
      selectAudio(musicId);refreshAfterEdit();await wait(200);check([...waveformCache.values()].some(r=>r.peaks?.length),'waveform prepared');
      return {peak,tracks:audioTracks.length,pieces:audioTracks.reduce((n,t)=>n+t.clips.length,0),markers:markers.length};
    })()`,true);
    assert.deepEqual(errors,[]);fs.writeFileSync(path.resolve('test-output/batch-02-audio.png'),(await win.webContents.capturePage()).toPNG());
    win.setContentSize(1120,740);await win.webContents.executeJavaScript("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const layout=await win.webContents.executeJavaScript("({scrollable:$('audio-controls').scrollHeight>$('audio-controls').clientHeight&&getComputedStyle($('audio-controls')).overflowY==='auto',bodyWidth:document.body.clientWidth,viewport:innerWidth})");assert.ok(layout.scrollable);assert.ok(layout.bodyWidth<=layout.viewport);
    fs.writeFileSync(path.resolve('test-output/batch-02-small.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: audio tracks, waveform, linked editing, clipboard, grouped undo, locks, markers, solo, mute, seek/segment synchronization and portable state',JSON.stringify(result));clearTimeout(deadline);win.destroy();app.exit(0);
  }catch(e){console.error(e);console.error(errors);fs.writeFileSync(path.resolve('test-output/batch-02-failure.png'),(await win.webContents.capturePage()).toPNG());clearTimeout(deadline);win.destroy();app.exit(1);}
}).catch(e=>{console.error(e);app.exit(1);});

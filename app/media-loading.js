(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SahlMediaLoading=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // One background decode at a time. Obsolete queued work never reaches FFmpeg.
  class ThumbnailQueue{
    constructor({onChange=()=>{},limit=220}={}){this.entries=new Map();this.running=0;this.paused=false;this.limit=limit;this.onChange=onChange;}
    request(key,load,group='timeline'){
      const existing=this.entries.get(key);if(existing)return existing.promise;
      const entry={key,load,group,state:'queued'};entry.promise=new Promise(resolve=>entry.resolve=resolve);this.entries.set(key,entry);
      this.notify();queueMicrotask(()=>this.pump());return entry.promise;
    }
    retain(group,keys){for(const [key,e]of this.entries)if(e.group===group&&e.state==='queued'&&!keys.has(key)){this.entries.delete(key);e.resolve(null);}this.notify();}
    setPaused(value){this.paused=value;this.notify();if(!value)this.pump();}
    clear(){for(const e of this.entries.values())e.resolve(null);this.entries.clear();this.notify();}
    notify(){this.onChange({pending:[...this.entries.values()].filter(e=>e.state!=='done').length,paused:this.paused});}
    pump(){
      if(this.paused||this.running)return;
      const e=[...this.entries.values()].find(e=>e.state==='queued');if(!e)return;
      e.state='running';this.running++;this.notify();
      Promise.resolve().then(e.load).then(value=>{if(this.entries.get(e.key)===e){e.state='done';e.resolve(value);if(!value)this.entries.delete(e.key);}},()=>{e.resolve(null);if(this.entries.get(e.key)===e)this.entries.delete(e.key);}).finally(()=>{
        this.running--;while(this.entries.size>this.limit){const cached=[...this.entries.values()].find(item=>item.state==='done');if(!cached)break;this.entries.delete(cached.key);}this.notify();this.pump();
      });
    }
  }
  // Tokens keep late loads and errors from overwriting a newer seek or source.
  class PreviewState{
    constructor(onChange,{now=()=>Date.now(),setIntervalFn=(fn,ms)=>setInterval(fn,ms),clearIntervalFn=timer=>clearInterval(timer)}={}){this.onChange=onChange;this.now=now;this.setInterval=setIntervalFn;this.clearInterval=clearIntervalFn;this.token=0;this.phase='idle';}
    start(detail=''){
      const continuing=this.phase==='loading';this.stopClock();this.token++;this.phase='loading';this.detail=detail;
      if(!continuing)this.started=this.now();this.error='';this.emit();this.timer=this.setInterval(()=>this.emit(),250);return this.token;
    }
    ready(token){if(token!==this.token)return;this.stopClock();this.phase='ready';this.emit();}
    fail(token,error){if(token!==this.token)return;this.stopClock();this.phase='error';this.error=error;this.emit();}
    cancel(){this.token++;this.stopClock();this.phase='idle';this.emit();}
    stopClock(){if(this.timer!==undefined)this.clearInterval(this.timer);this.timer=undefined;}
    emit(){this.onChange({phase:this.phase,detail:this.detail,error:this.error,elapsed:this.phase==='loading'?(this.now()-this.started)/1000:0});}
  }
  return {ThumbnailQueue,PreviewState};
});

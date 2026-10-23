// Every IPC request is dispatched by its originating webContents, never the focused window.
class ProjectRouter{
  constructor(ipc){this.ipc=ipc;this.windows=new Map();this.handled=new Set();this.events=new Set();}
  forWindow(win){
    const id=win.webContents.id,routes={handlers:new Map(),events:new Map()};this.windows.set(id,routes);
    win.on('closed',()=>this.windows.delete(id));
    const register=(channel,fn,event)=>{
      routes[event?'events':'handlers'].set(channel,fn);const registered=event?this.events:this.handled;
      if(registered.has(channel))return;registered.add(channel);
      this.ipc[event?'on':'handle'](channel,(e,...args)=>{
        const handler=this.windows.get(e.sender.id)?.[event?'events':'handlers'].get(channel);
        if(!handler){if(event)return;throw Error('نافذة المشروع غير متاحة.');}
        return handler(e,...args);
      });
    };
    return {handle:(channel,fn)=>register(channel,fn,false),on:(channel,fn)=>register(channel,fn,true)};
  }
}
module.exports={ProjectRouter};

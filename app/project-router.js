// Every IPC request is dispatched by its originating webContents, never the focused window.
class ProjectRouter{
  constructor(ipc){this.ipc=ipc;this.windows=new Map();this.handled=new Set();this.events=new Set();}
  forWindow(win){
    return this.register(win.webContents,win,'closed');
  }
  forContents(contents){return this.register(contents,contents,'destroyed');}
  register(contents,owner,closedEvent){
    const id=contents.id,routes={handlers:new Map(),events:new Map()};this.windows.set(id,routes);
    owner.on(closedEvent,()=>this.windows.delete(id));
    const register=(channel,fn,event)=>{
      routes[event?'events':'handlers'].set(channel,fn);const registered=event?this.events:this.handled;
      if(registered.has(channel))return;registered.add(channel);
      this.ipc[event?'on':'handle'](channel,(e,...args)=>{
        const handler=this.windows.get(e.sender.id)?.[event?'events':'handlers'].get(channel);
        if(!handler){if(event)return;throw Error('تاب المشروع غير متاح.');}
        return handler(e,...args);
      });
    };
    return {handle:(channel,fn)=>register(channel,fn,false),on:(channel,fn)=>register(channel,fn,true)};
  }
}
module.exports={ProjectRouter};

const {EventEmitter}=require('node:events');
function fakeDesktop({send=()=>{},onWindow=()=>{}}={}){
 let next=0;
 class Contents extends EventEmitter{
  constructor(id){super();this.id=id;this.session={protocol:{handle(){},unhandle(){}}};this.dead=false;}
  setWindowOpenHandler(){}send(name,value){send(name,value);}loadFile(){}focus(){}isDestroyed(){return this.dead;}
  close(){this.dead=true;this.emit('destroyed');}
 }
 class Window extends EventEmitter{
  constructor(){super();this.webContents=new Contents(9000);this.contentView={addChildView(){},removeChildView(){}};onWindow(this);}
  setTitle(title){this.title=title;}getContentSize(){return [1500,1008];}loadFile(){}isDestroyed(){return !!this.closed;}
  close(){const event={preventDefault(){this.prevented=true;}};this.emit('close',event);if(!event.prevented){this.closed=true;this.emit('closed');}}
 }
 class View{constructor(){this.webContents=new Contents(++next);}setBounds(){}setVisible(){}}
 return {BrowserWindow:Window,WebContentsView:View};
}
module.exports={fakeDesktop};

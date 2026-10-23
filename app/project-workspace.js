const path=require('node:path');
const TAB_HEIGHT=48;

// One native window; each tab owns a live, isolated editor WebContentsView.
class ProjectWorkspace{
  constructor({BrowserWindow,ipcMain,directory,version,onNew,canChange=()=>true}){
    this.tabs=[];this.active=null;this.busy=false;this.closing=false;this.onNew=onNew;this.canChange=canChange;
    this.baseTitle='سهل — Sahl Video '+version;
    this.win=new BrowserWindow({width:1500,height:1008,minWidth:1120,minHeight:788,backgroundColor:'#14131a',icon:path.join(directory,'assets/icon.ico'),autoHideMenuBar:true,title:this.baseTitle,webPreferences:{preload:path.join(directory,'workspace-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    const contents=this.win.webContents;
    contents.setWindowOpenHandler(()=>({action:'deny'}));contents.on('will-navigate',e=>e.preventDefault());
    for(const [channel,fn]of Object.entries({
      'workspace-state':()=>this.snapshot(),
      'workspace-new':()=>this.create(),
      'workspace-select':id=>this.select(id,false,false),
      'workspace-close':id=>this.closeTab(id),
      'workspace-rename':(id,name)=>this.rename(id,name)
    }))ipcMain.handle(channel,(event,...args)=>{
      if(event.sender!==contents)throw Error('طلب غير مسموح.');return fn(...args);
    });
    contents.on('did-finish-load',()=>this.refresh());this.bindShortcuts(contents);
    this.win.on('resize',()=>this.layout());
    this.win.on('close',event=>{if(this.closing)return;event.preventDefault();void this.closeWindow();});
    // Closing a BrowserWindow does not automatically destroy its WebContentsViews.
    this.win.on('closed',()=>{for(const tab of this.tabs)tab.dispose();this.tabs=[];});
    this.win.loadFile(path.join(directory,'workspace.html'));
  }
  name(tab){return tab.name||'مشروع '+(this.tabs.indexOf(tab)+1);}
  snapshot(){return {active:this.active,busy:this.busy,tabs:this.tabs.map(tab=>({id:tab.id,name:this.name(tab),dirty:tab.dirty,status:tab.status}))};}
  rename(id,name){
    const tab=this.tabs.find(t=>t.id===id);if(!tab||this.busy||!this.canChange())return {canceled:true};
    if(typeof name!=='string'||name.trim().length>64||/[\x00-\x1f\x7f]/.test(name))return {error:'اكتب اسم من سطر واحد، بحد أقصى 64 حرف.'};
    return tab.rename(name.trim());
  }
  refresh(){
    if(this.win.isDestroyed())return;
    const active=this.tabs.find(tab=>tab.id===this.active);
    this.win.setTitle(active?(active.dirty?'● ':'')+this.name(active)+' — '+this.baseTitle:this.baseTitle);
    this.win.webContents.send('workspace-state',this.snapshot());
  }
  layout(){
    if(this.win.isDestroyed())return;const [width,height]=this.win.getContentSize();
    for(const tab of this.tabs)tab.view.setBounds({x:0,y:TAB_HEIGHT,width,height:Math.max(0,height-TAB_HEIGHT)});
  }
  create(){if(this.busy||!this.canChange())return {error:'انتظر انتهاء العملية الحالية.'};return this.onNew();}
  add(tab){
    this.tabs.push(tab);this.win.contentView.addChildView(tab.view);this.layout();this.bindShortcuts(tab.view.webContents);
    tab.view.webContents.on('did-finish-load',()=>tab.message('project-active',this.active===tab.id));
    this.select(tab.id);return tab;
  }
  select(id,force=false,focusEditor=true){
    if(this.busy&&!force)return {canceled:true};const target=this.tabs.find(tab=>tab.id===id);if(!target)return {canceled:true};
    const previous=this.active;this.active=id;
    for(const tab of this.tabs){tab.view.setVisible(tab===target);if(previous!==id)tab.message('project-active',tab===target);}
    if(focusEditor&&!target.view.webContents.isDestroyed())target.view.webContents.focus();this.refresh();return {selected:true};
  }
  bindShortcuts(contents){
    contents.on('before-input-event',(event,input)=>{
      if(input.type!=='keyDown'||(!input.control&&!input.meta)||input.alt)return;
      const key=input.key.toLowerCase();
      if(key==='t'&&!input.shift){event.preventDefault();this.create();}
      else if(key==='w'&&!input.shift){event.preventDefault();void this.closeTab(this.active);}
      else if(key==='tab'){
        event.preventDefault();const index=this.tabs.findIndex(t=>t.id===this.active),step=input.shift?-1:1;
        if(this.tabs.length)this.select(this.tabs[(index+step+this.tabs.length)%this.tabs.length].id);
      }
    });
  }
  async closeTab(id){
    if(this.tabs.length<=1)return {canceled:true,lastTab:true};
    const tab=this.tabs.find(t=>t.id===id);if(!tab||this.busy||!this.canChange())return {canceled:true};
    this.busy=true;this.select(id,true);
    try{
      if(!await tab.confirmClose())return {canceled:true};
      const index=this.tabs.indexOf(tab);this.win.contentView.removeChildView(tab.view);this.tabs.splice(index,1);tab.dispose();
      this.active=null;if(this.tabs.length)this.select(this.tabs[Math.min(index,this.tabs.length-1)].id,true);
      return {closed:true};
    }finally{this.busy=false;this.refresh();}
  }
  async closeWindow(){
    if(this.busy||!this.canChange())return;this.busy=true;this.refresh();
    try{
      // Retain every tab if any project declines to close.
      for(const tab of this.tabs){this.select(tab.id,true);if(!await tab.confirmClose())return;}
      this.closing=true;this.win.close();
    }finally{this.busy=false;this.refresh();}
  }
}
module.exports={ProjectWorkspace};

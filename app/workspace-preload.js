const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workspace',{
  state:()=>ipcRenderer.invoke('workspace-state'),
  create:()=>ipcRenderer.invoke('workspace-new'),
  select:id=>ipcRenderer.invoke('workspace-select',id),
  close:id=>ipcRenderer.invoke('workspace-close',id),
  onState:fn=>ipcRenderer.on('workspace-state',(_,state)=>fn(state))
});

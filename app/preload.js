const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('sahl',{
 listTemplates:()=>ipcRenderer.invoke('list-templates'),saveLayout:(name,titles)=>ipcRenderer.invoke('save-layout',name,titles),
 encoders:()=>ipcRenderer.invoke('encoders'),fonts:()=>ipcRenderer.invoke('fonts'),
 choose:kind=>ipcRenderer.invoke('choose-media',kind),importFiles:files=>ipcRenderer.invoke('import-media',Array.from(files).map(file=>webUtils.getPathForFile(file)).filter(Boolean)),
 thumbnail:(id,t)=>ipcRenderer.invoke('thumbnail',id,t),frame:(id,t)=>ipcRenderer.invoke('frame',id,t),
 cancelProjectSave:()=>ipcRenderer.invoke('cancel-project-save'),onProjectCopy:fn=>ipcRenderer.on('project-copy',(_,value)=>fn(value)),
 listRecovery:()=>ipcRenderer.invoke('list-recovery'),restoreRecovery:(id,state)=>ipcRenderer.invoke('restore-recovery',id,state),onAutosave:fn=>ipcRenderer.on('autosave',(_,value)=>fn(value)),
 saveProject:(state,saveAs)=>ipcRenderer.invoke('save-project',state,saveAs),openProject:state=>ipcRenderer.invoke('open-project',state),projectState:(state,dirty)=>ipcRenderer.send('project-state',state,dirty),
 export:opts=>ipcRenderer.invoke('export',opts),cancel:()=>ipcRenderer.invoke('cancel-export'),showOutput:()=>ipcRenderer.invoke('show-output'),
 onProjectSaved:fn=>ipcRenderer.on('project-saved',(_,value)=>fn(value)),onProgress:fn=>ipcRenderer.on('progress',(_,value)=>fn(value)),onComplete:fn=>ipcRenderer.on('complete',(_,value)=>fn(value))
});

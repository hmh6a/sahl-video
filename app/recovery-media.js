const path=require('node:path'),Project=require('./project');

// A portable copy retains its asset ID. Never substitute a similarly named video.
function resolveRecoveryMedia(entry,projectFiles=[]){
  const sources=entry.sources.map(source=>({...source}));
  if(sources.some(source=>!source.resolved)){
    const files=[entry.raw.recovery?.projectPath,...projectFiles].filter(file=>typeof file==='string'&&path.isAbsolute(file));
    for(const file of new Set(files)){
      let saved;try{saved=Project.readProject(file);}catch{continue;}
      for(const source of sources){
        if(source.resolved)continue;
        const copy=saved.sources.find(a=>a.id===source.id&&a.kind===source.kind&&a.resolved);
        if(copy)source.resolved=copy.resolved;
      }
      if(sources.every(source=>source.resolved))break;
    }
  }
  return {...entry,sources,missingFiles:sources.filter(source=>!source.resolved).map(source=>({id:source.id,name:source.name||path.basename(source.path||source.relativePath||'ملف وسائط')}))};
}
module.exports={resolveRecoveryMedia};

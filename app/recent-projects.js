const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
class RecentProjects{
 constructor(directory){this.file=path.join(directory,'recent-projects.json');}
 read(){try{if(fs.statSync(this.file).size>8*1024*1024)return [];const rows=JSON.parse(fs.readFileSync(this.file,'utf8'));return Array.isArray(rows)?rows.filter(r=>typeof r.path==='string'&&path.isAbsolute(r.path)&&Number.isFinite(r.openedAt)).slice(0,20):[];}catch{return [];}}
 list(){return this.read().map(r=>({...r,missing:!fs.existsSync(r.path)}));}
 write(rows){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(rows));fs.renameSync(temp,this.file);}finally{fs.rmSync(temp,{force:true});}}
 key(file){const p=path.resolve(file);return process.platform==='win32'?p.toLowerCase():p;}
 remember(file,thumbnail=null){file=path.resolve(file);const rows=this.read(),old=rows.find(r=>this.key(r.path)===this.key(file));const image=typeof thumbnail==='string'&&thumbnail.startsWith('data:image/jpeg;base64,')&&thumbnail.length<300000?thumbnail:old?.thumbnail||null;this.write([{path:file,name:path.basename(file),openedAt:Date.now(),thumbnail:image},...rows.filter(r=>this.key(r.path)!==this.key(file))].slice(0,20));}
 remove(file){this.write(this.read().filter(r=>this.key(r.path)!==this.key(file)));}
}
module.exports={RecentProjects};

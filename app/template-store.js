const fs=require('node:fs'),path=require('node:path'),Titles=require('./titles');
class TemplateStore{
  constructor(directory){this.file=path.join(directory,'templates-v2.json');this.legacy=path.join(directory,'template.json');}
  list(){
    if(fs.existsSync(this.file)){const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!Array.isArray(data))throw new Error('ملف القوالب غير صالح.');return data.map(p=>({...p,titles:Titles.normalize(p.titles)}));}
    if(fs.existsSync(this.legacy)){const s=JSON.parse(fs.readFileSync(this.legacy,'utf8'));return [{...Titles.preset('قالبي السابق',[s]),id:'legacy-template'}];}
    return [];
  }
  save(name,items){
    const entries=this.list(),entry=Titles.preset(name,items);
    if(entries.length>=100)throw new Error('وصلت لحد 100 قالب محفوظ.');
    // Names are descriptive; saving creates a new version and preserves earlier templates.
    entries.push(entry);fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(entries,null,2));fs.renameSync(tmp,this.file);return {entry,entries};
  }
}
module.exports={TemplateStore};

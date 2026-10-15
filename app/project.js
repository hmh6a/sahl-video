const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TL=require('./timeline'),Titles=require('./titles');
function frameRate(value){const rate=String(value||'30');if(!/^\d+(?:\.\d+)?(?:\/\d+)?$/.test(rate))throw new Error('معدل الإطارات غير صالح.');const [a,b=1]=rate.split('/').map(Number);if(!Number.isFinite(a/b)||a/b<1||a/b>240)throw new Error('معدل الإطارات غير صالح.');return rate;}
function format(meta){const width=Number(meta?.width),height=Number(meta?.height);if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>8192||height>8192)throw new Error('دقة المشروع غير صالحة.');return {width,height,fps:frameRate(meta.fps)};}
function outputSize(meta,resolution='source'){
  const m=format(meta);if(resolution==='source')return {width:Math.ceil(m.width/2)*2,height:Math.ceil(m.height/2)*2};
  const short=Number(resolution);if(![2160,1440,1080,720,480].includes(short))throw new Error('اختار دقة تصدير صحيحة.');
  const scale=short/Math.min(m.width,m.height),width=Math.max(2,Math.round(m.width*scale/2)*2),height=Math.max(2,Math.round(m.height*scale/2)*2);
  if(width>8192||height>8192)throw new Error('هذي الدقة كبيرة لهذي الأبعاد. اختار دقة أصغر.');return {width,height};
}
function state(raw,assets){
  if(!raw||typeof raw!=='object')throw new Error('ملف المشروع غير صالح.');
  const meta=raw.meta?format(raw.meta):null,clips=raw.clips?.length?TL.validate(meta,{clips:raw.clips},assets):[];
  if(clips.length&&!meta)throw new Error('دقة المشروع مفقودة.');
  const titles=Titles.normalize(raw.titles||[]),resolution=String(raw.resolution||'source');if(meta)outputSize(meta,resolution);
  return {meta,clips,titles,cursor:Math.max(0,Math.min(TL.duration(clips),Number(raw.cursor)||0)),selectedClip:Number.isInteger(raw.selectedClip)?Math.max(-1,Math.min(clips.length-1,raw.selectedClip)):-1,selectedTitle:titles.some(t=>t.id===raw.selectedTitle)?raw.selectedTitle:titles[0]?.id||null,selectionKind:raw.selectionKind==='title'?'title':'clip',zoom:Math.max(1,Math.min(100,Number(raw.zoom)||1)),resolution,quality:raw.quality==='maximum'?'maximum':'high',encoder:['cpu','h264_nvenc','h264_amf','h264_qsv'].includes(raw.encoder)?raw.encoder:'gpu-auto'};
}
function writeProject(file,raw,registry){
  const ids=Array.from(new Set(raw.assetIds||raw.clips.map(c=>c.assetId))),assets={};
  for(const id of ids){if(!registry[id])throw new Error('ملف من ملفات المشروع مفقود.');assets[id]=registry[id];}
  const clean=state(raw,assets),document={app:'sahl-video',version:1,...clean,assets:Object.entries(assets).map(([id,a])=>({id,kind:a.kind,path:path.resolve(a.path),relativePath:path.relative(path.dirname(file),a.path)}))};
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify(document,null,2),'utf8');fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return document;
}
function readProject(file){
  if(fs.statSync(file).size>5*1024*1024)throw new Error('حجم ملف المشروع غير صالح.');const raw=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(raw.app!=='sahl-video'||raw.version!==1||!Array.isArray(raw.assets)||raw.assets.length>128)throw new Error('هذا مو ملف مشروع سهل مدعوم.');
  const seen=new Set();const sources=raw.assets.map(a=>{if(!a||typeof a.id!=='string'||!/^[\w-]{1,80}$/.test(a.id)||seen.has(a.id)||!['video','image'].includes(a.kind))throw new Error('بيانات ملفات المشروع غير صالحة.');seen.add(a.id);
    if(raw.portable&&(!a.relativePath||!inside(path.dirname(file),path.resolve(path.dirname(file),a.relativePath))))throw new Error('مسار ملف خارج مجلد المشروع.');
    const candidates=[typeof a.relativePath==='string'?path.resolve(path.dirname(file),a.relativePath):null,!raw.portable&&typeof a.path==='string'?a.path:null].filter(Boolean);
    const found=candidates.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());return {...a,resolved:found||null};});
  return {raw,sources};
}
function inside(root,file){const relative=path.relative(path.resolve(root),path.resolve(file));return !!relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
module.exports={state,format,frameRate,outputSize,writeProject,readProject,inside};

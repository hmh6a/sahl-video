const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
function byteRange(value,size){
  if(!value)return {start:0,end:size-1,status:200};
  const m=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!m||(!m[1]&&!m[2]))return null;
  let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
  let end=m[1]&&m[2]?Math.min(size-1,Number(m[2])):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
  return {start,end,status:206};
}
async function mediaResponse(file,request){
  const size=(await fs.promises.stat(file)).size,r=byteRange(request.headers.get('range'),size);
  const headers={'Accept-Ranges':'bytes','Content-Type':({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska'})[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'};
  if(!r)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  headers['Content-Length']=String(r.end-r.start+1);
  if(r.status===206)headers['Content-Range']=`bytes ${r.start}-${r.end}/${size}`;
  if(request.method==='HEAD')return new Response(null,{status:r.status,headers});
  const stream=fs.createReadStream(file,{start:r.start,end:r.end});
  return new Response(Readable.toWeb(stream),{status:r.status,headers});
}
module.exports={byteRange,mediaResponse};

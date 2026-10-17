// Explicit color conversion is required before mixing HDR, SDR and canvas titles.
// Keep all HDR processing at 10-bit or above, including alpha compositing.
const transfers=['bt709','smpte170m','smpte240m','bt470m','bt470bg','linear','iec61966-2-1','bt2020-10','bt2020-12','smpte2084','arib-std-b67'];
const primaries=['bt709','bt470m','bt470bg','smpte170m','smpte240m','film','bt2020','smpte431','smpte432'];
const matrices=['gbr','bt709','fcc','bt470bg','smpte170m','smpte240m','ycgco','bt2020nc','bt2020c'];
const pick=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
function metadata(stream){return {transfer:stream.color_transfer,primaries:stream.color_primaries,matrix:stream.color_space,range:stream.color_range,pixelFormat:stream.pix_fmt};}
function input(meta={},image=false){
  const c=meta.color||{},rgb=image||/^(?:gbr|rgb|bgr)/.test(c.pixelFormat||'');
  return {transfer:pick(c.transfer,transfers,meta.hdr?'smpte2084':image?'iec61966-2-1':'bt709'),primaries:pick(c.primaries,primaries,meta.hdr?'bt2020':'bt709'),matrix:rgb?'gbr':pick(c.matrix,matrices,meta.hdr?'bt2020nc':'bt709'),range:pick(c.range,['pc','tv','full','limited'],rgb?'full':'limited')};
}
function source(meta,image){const c=input(meta,image);return `pin=${c.primaries}:tin=${c.transfer}:min=${c.matrix}:rin=${c.range}`;}
function outputMetadata(transfer){
  // A montage's edits invalidate source mastering and dynamic HDR metadata.
  return `sidedata=mode=delete,setparams=range=limited:color_primaries=bt2020:color_trc=${transfer}:colorspace=bt2020nc`;
}
function toHDR(meta,transfer,image=false){
  return `${image?'format=gbrp16le,':''}zscale=${source(meta,image)}:p=bt2020:t=${transfer}:m=bt2020nc:r=limited:npl=203:dither=error_diffusion,format=yuv420p10le`;
}
function titleToHDR(transfer){
  // Canvas PNGs are sRGB. Map white to SDR reference white (203 nits), not HDR peak.
  // zscale preserves the alpha plane, including anti-aliased text edges.
  return `format=gbrap16le,zscale=${source({},true)}:p=bt2020:t=${transfer}:m=bt2020nc:r=limited:npl=203,format=yuva420p10le`;
}
function previewToSDR(meta){
  if(!meta?.hdr)return '';
  return `zscale=${source(meta)}:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=2,zscale=t=bt709:m=bt709:r=limited:dither=error_diffusion,format=yuv420p,sidedata=mode=delete`;
}
function outputArgs(transfer){return ['-color_primaries','bt2020','-color_trc',transfer,'-colorspace','bt2020nc','-color_range','tv'];}
module.exports={metadata,input,toHDR,titleToHDR,previewToSDR,outputMetadata,outputArgs};

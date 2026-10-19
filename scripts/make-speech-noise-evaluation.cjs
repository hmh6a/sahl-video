// Reproducible synthetic-noise stress set; not a substitute for real noisy recordings.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const source=path.resolve('test-output/transcription/expanded'),manifest=JSON.parse(fs.readFileSync(path.join(source,'samples.json'))),ff=require('ffmpeg-static');
const selected=['iq','msa'].flatMap(d=>manifest.filter(s=>s.dialect===d).slice(0,3));
for(const mode of ['noisy','denoised'])fs.mkdirSync(path.resolve('test-output/transcription',mode),{recursive:true});
for(const sample of selected){
 const noisy=path.resolve('test-output/transcription/noisy',sample.file),filtered=path.resolve('test-output/transcription/denoised',sample.file);
 execFileSync(ff,['-v','error','-y','-i',path.join(source,sample.file),'-f','lavfi','-i','anoisesrc=c=pink:a=0.05:r=16000:seed=42','-filter_complex','[0:a]aresample=16000[a];[a][1:a]amix=inputs=2:duration=first:normalize=0[out]','-map','[out]','-ac','1','-c:a','pcm_s16le',noisy],{stdio:'pipe'});
 execFileSync(ff,['-v','error','-y','-i',noisy,'-af','highpass=f=80,afftdn=nf=-25',filtered],{stdio:'pipe'});
}
for(const mode of ['noisy','denoised'])fs.writeFileSync(path.resolve('test-output/transcription',mode,'samples.json'),JSON.stringify(selected,null,2));
console.log('Prepared six paired noisy/denoised samples; originals unchanged.');

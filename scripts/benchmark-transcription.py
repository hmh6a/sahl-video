"""Local exploratory benchmark. Input manifest: [{file, reference, dialect, source}].
Requires an explicitly supplied whisper-cli binary and model. Never uploads audio.
macOS /usr/bin/time -l records per-process peak RSS; elsewhere that metric is null.
"""
import argparse,json,pathlib,re,subprocess,sys,time,unicodedata

def words(text):
    text=re.sub(r'\[[^\]]*\]',' ',text)
    text=''.join(c for c in unicodedata.normalize('NFKC',text) if unicodedata.category(c)!='Mn')
    text=text.translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ى':'ي','ـ':''})).lower()
    return ''.join(c if c.isalnum() or c.isspace() else ' ' for c in text).split()

def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        new=[i]
        for j,y in enumerate(b,1):new.append(min(new[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=new
    return row[-1]

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--engine',required=True);p.add_argument('--model',required=True);p.add_argument('--manifest',required=True);p.add_argument('--output',required=True);p.add_argument('--vad');args=p.parse_args()
    manifest=pathlib.Path(args.manifest).resolve();results=[];out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
    for sample in json.loads(manifest.read_text()):
        audio=manifest.parent/sample['file'];prefix=out/audio.stem
        cmd=[str(pathlib.Path(args.engine).resolve()),'-m',str(pathlib.Path(args.model).resolve()),'-f',str(audio),'-l','ar','-oj','-of',str(prefix),'-ng','-t','4','-nt']
        if args.vad:cmd+=['--vad','-vm',str(pathlib.Path(args.vad).resolve()),'-vt','0.5','-vspd','250','-vsd','300','-vp','200','-vmsd','30']
        if sys.platform=='darwin':cmd=['/usr/bin/time','-l']+cmd
        started=time.monotonic();r=subprocess.run(cmd,capture_output=True,text=True,timeout=600);elapsed=time.monotonic()-started
        prefix.with_suffix('.log').write_text(r.stdout+'\n'+r.stderr)
        if r.returncode:raise RuntimeError(r.stderr[-2000:])
        data=json.loads(prefix.with_suffix('.json').read_text());segments=data.get('transcription',[]);actual=' '.join(s['text'].strip() for s in segments);ref=words(sample['reference']);hyp=words(actual);peak=re.search(r'(\d+)\s+maximum resident set size',r.stderr)
        row={**sample,'hypothesis':actual,'seconds':elapsed,'peakRssBytes':int(peak[1]) if peak else None,'referenceWords':len(ref),'wordErrors':distance(ref,hyp),'wer':distance(ref,hyp)/max(1,len(ref))}
        results.append(row);print(json.dumps({k:row[k] for k in ['file','seconds','peakRssBytes','wer']},ensure_ascii=False),flush=True)
    report={'engine':args.engine,'model':args.model,'vad':args.vad,'normalization':'NFKC, remove diacritics/punctuation and bracketed events, normalize alef and alef-maqsura, lowercase. No dialect-to-MSA substitution.','samples':results,'weightedWER':sum(r['wordErrors'] for r in results)/max(1,sum(r['referenceWords'] for r in results))}
    (out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

"""Download only a fixed held-out evaluation subset. Never invoked by the application.
Audio/reference text stay in ignored test-output; no credentials or uploads.
"""
import argparse,json,pathlib,urllib.request,urllib.parse,concurrent.futures,time,struct,hashlib,datetime

def rows(dataset,config,offset,length):
    url='https://datasets-server.huggingface.co/rows?'+urllib.parse.urlencode(dict(dataset=dataset,config=config,split='test',offset=offset,length=length))
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=45) as r:return json.load(r)['rows']
        except Exception:
            if attempt==2:raise
            time.sleep(1)

def fetch_sample(item,root):
    row,source,dialect=item;data=row['row'];name=dialect+'-'+str(row['row_idx'])+'.wav';file=root/name
    with urllib.request.urlopen(data['audio'][0]['src'],timeout=45) as response:file.write_bytes(response.read())
    # IEEE-float WAV (format 3) is valid evaluation input but unsupported by Python wave.
    content=file.read_bytes();offset=12;byte_rate=None;data_size=None
    if content[:4]!=b'RIFF' or content[8:12]!=b'WAVE':raise ValueError('Expected RIFF WAV')
    while offset+8<=len(content):
        kind=content[offset:offset+4];size=struct.unpack_from('<I',content,offset+4)[0];offset+=8
        if kind==b'fmt ':byte_rate=struct.unpack_from('<I',content,offset+8)[0]
        if kind==b'data':data_size=size
        offset+=size+(size%2)
    if not byte_rate or data_size is None:raise ValueError('Missing WAV duration fields')
    duration=data_size/byte_rate
    return dict(file=name,reference=data.get('transcript_text',data.get('transcription')),dialect=dialect,row=row['row_idx'],source='https://huggingface.co/datasets/'+source,split='test',duration=duration,audioSHA256=hashlib.sha256(content).hexdigest())

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',default='test-output/transcription/expanded');a=p.parse_args();root=pathlib.Path(a.output);root.mkdir(parents=True,exist_ok=True)
    dataset='oddadmix/dialectal-arabic-lahgtna-v2';selected=[]
    def revisions():
        result={}
        for name in [dataset,'google/fleurs']:
            with urllib.request.urlopen('https://huggingface.co/api/datasets/'+name,timeout=30) as response:result[name]=json.load(response)['sha']
        return result
    before=revisions()
    # First 20 Iraqi-labelled test rows by ascending row index: no selection by ASR output.
    for offset in range(0,3056,100):
        batch=rows(dataset,'default',offset,min(100,3056-offset));selected += [(r,dataset,'iq') for r in batch if r['row']['language']=='iq']
        print('scanned',offset+len(batch),'Iraqi',len(selected),flush=True)
        if len(selected)>=20:break
    selected=selected[:20]+[(r,'google/fleurs','msa') for r in rows('google/fleurs','ar_eg',0,10)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:manifest=list(pool.map(lambda item:fetch_sample(item,root),selected))
    after=revisions()
    if before!=after:raise RuntimeError('Dataset revision changed while fetching; retry evaluation download')
    (root/'provenance.json').write_text(json.dumps(dict(revisions=after,downloaded=datetime.datetime.now(datetime.timezone.utc).isoformat()),indent=2))
    (root/'samples.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('downloaded',len(manifest),flush=True)

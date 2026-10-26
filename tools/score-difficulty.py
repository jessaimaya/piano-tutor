#!/usr/bin/env python3
"""Rate MusicXML/.mxl files by difficulty from what is in the notes (no audio, no tempo).

    python3 -I tools/score-difficulty.py app/scores            # a folder of .mxl files
    python3 -I tools/score-difficulty.py file1.mxl file2.mxl

Prints one line per file: score, suggested stage, and the features behind it. Score about 20 = very easy, 200 = virtuoso.
Stage thresholds: <=55 -> 3, <=85 -> 4, <=125 -> 5, above -> 6. The score ignores tempo, so fast pieces read easier than they
are: bump those up by hand. Weights were set by hand against pieces of known grade; treat the result as a first sort.
"""
import zipfile,glob,re,sys,xml.etree.ElementTree as ET
STEP={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def load(f):
    z=zipfile.ZipFile(f)
    rp=None
    if 'META-INF/container.xml' in z.namelist():
        m=re.search(r'full-path="([^"]+)"',z.read('META-INF/container.xml').decode('utf8','replace')); rp=m and m.group(1)
    if not rp: rp=[n for n in z.namelist() if not n.startswith('META-INF') and n.lower().endswith(('.xml','.musicxml'))][0]
    return ET.fromstring(z.read(rp))
def analyze(f):
    r=load(f)
    part=r.find('part'); parts=len(r.findall('part'))
    div=4; fifths=0; beats=4; bt=4; staves=1
    events={}  # (staff) -> list of (onset_quarters, dur, [midi])
    bar_dens=[]; acc=0; nn=0; shortest=99; pit=[]; tempo=None; maxchord=0; span=0; leaps=[]
    pos=0.0; nbars=0
    last={1:None,2:None}
    for p in r.findall('part')[:1]:
        for m in p.findall('measure'):
            nbars+=1
            barstart=pos; cnt=0
            for el in m:
                if el.tag=='attributes':
                    d=el.findtext('divisions'); div=int(d) if d else div
                    k=el.find('key/fifths'); fifths=int(k.text) if k is not None else fifths
                    t=el.find('time')
                    if t is not None and t.findtext('beats') and t.findtext('beats').isdigit(): beats=int(t.findtext('beats')); bt=int(t.findtext('beat-type'))
                    s=el.findtext('staves'); staves=int(s) if s else staves
                elif el.tag=='direction':
                    s=el.find('.//sound[@tempo]')
                    if s is not None and tempo is None: tempo=float(s.get('tempo'))
                elif el.tag=='note':
                    dur=int(el.findtext('duration') or 0)/div
                    chord=el.find('chord') is not None
                    st=int(el.findtext('staff') or 1)
                    pp=el.find('pitch')
                    if pp is not None:
                        mid=(int(pp.findtext('octave'))+1)*12+STEP[pp.findtext('step')]+int(float(pp.findtext('alter') or 0))
                        pit.append(mid); nn+=1; cnt+=1
                        if el.find('accidental') is not None: acc+=1
                        if dur>0: shortest=min(shortest,dur)
                        events.setdefault(st,[]).append((pos if not chord else lastpos,dur,mid,chord))
                        if not chord and last[st] is not None: leaps.append(abs(mid-last[st]))
                        if not chord: last[st]=mid
                    if not chord:
                        lastpos=pos
                        if el.find('grace') is None: pos+=dur
                elif el.tag=='forward': pos+=int(el.findtext('duration'))/div
                elif el.tag=='backup': pos-=int(el.findtext('duration'))/div
            barlen=beats*4/bt
            bar_dens.append(cnt/ max(barlen,0.5))
            pos=max(pos,barstart)  # keep forward
    # chords per hand
    for st,ev in events.items():
        byon={}
        for on,dur,mid,ch in ev: byon.setdefault(round(on,3),[]).append(mid)
        for on,ms in byon.items():
            maxchord=max(maxchord,len(ms)); span=max(span,max(ms)-min(ms))
    total=pos
    bd=sorted(bar_dens)
    p90=bd[int(len(bd)*0.9)] if bd else 0
    return dict(bars=nbars,notes=nn,fifths=fifths,ts=f"{beats}/{bt}",tempo=tempo,range=(min(pit),max(pit)) if pit else None,
        dens_mean=round(nn/max(nbars*beats*4/bt,1),2),dens_p90=round(p90,2),shortest=shortest if shortest<99 else None,
        acc_share=round(acc/max(nn,1),2),maxchord=maxchord,span=span,leap_p90=sorted(leaps)[int(len(leaps)*0.9)] if leaps else 0,
        title=(r.findtext('.//work-title') or r.findtext('.//movement-title') or '').strip()[:40], beats_total=round(total))

def score(v):
    sh=v['shortest'] or 1
    return round(7*min(v['dens_p90'],14) + 1.6*min(v['span'],30) + 40*v['acc_share'] + 3*abs(v['fifths'])
        + (6 if sh<=0.125 else 0) + (6 if sh<=0.0625 else 0) + 2*min(v['maxchord'],6) + min(v['bars'],160)/10 + 0.6*v['leap_p90'])

def stage(s): return 3 if s<=55 else 4 if s<=85 else 5 if s<=125 else 6

if __name__=='__main__':
    import os
    files=[]
    for a in sys.argv[1:]:
        files += sorted(glob.glob(a+'/*.mxl')+glob.glob(a+'/*.musicxml')) if os.path.isdir(a) else [a]
    rows=[]
    for f in files:
        try:
            v=analyze(f); rows.append((score(v),f,v))
        except Exception as e: print('ERR',f,e)
    for s,f,v in sorted(rows):
        print(f"{s:4} stage {stage(s)}  {os.path.basename(f)[:46]:46} {v['ts']:>4} key{v['fifths']:+d} bars{v['bars']:>4} dens{v['dens_p90']:>5} span{v['span']:>2} acc{v['acc_share']:.2f}")

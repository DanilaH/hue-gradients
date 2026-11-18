"""Independent offline field checks and legal replay. No generator import.

This is a research oracle, not the shipped editor, UI, cloud or human perception test.
"""
import argparse, collections, hashlib, itertools, json, math, re
from fractions import Fraction
from pathlib import Path
from validate_prototype_pack import oklab, cycle_minimum, witness, bfs, board_svg

ROOT=Path(__file__).resolve().parents[1]
HEX=re.compile(r'^#[0-9A-Fa-f]{6}$')

def fingerprint(l):
    # Logical ID, title, author, seed and unused corner parameters are not gameplay.
    obj={k:l[k] for k in ('width','height','solvedTileColors','startTileAtPosition')}
    obj['pinnedPositions']=sorted(l['pinnedPositions'])
    obj['solvedTileColors']=[c.upper() for c in obj['solvedTileColors']]
    return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def expected_colors(w,h,corners):
    c=[[int(v[i:i+2],16) for i in (1,3,5)] for v in corners];out=[]
    for y in range(h):
        for x in range(w):
            u=Fraction(x,w-1) if w>1 else Fraction(0);v=Fraction(y,h-1) if h>1 else Fraction(0)
            weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v]
            out.append('#'+''.join(f'{int(sum(c[k][channel]*weights[k] for k in range(4))+Fraction(1,2)):02X}' for channel in range(3)))
    return out

def orientation_ambiguities(w,h,pins,colors):
    maps=[('mirror-x',lambda x,y:(w-1-x,y)),('mirror-y',lambda x,y:(x,h-1-y)),('rotate-180',lambda x,y:(w-1-x,h-1-y))]
    if w==h:
        maps += [('transpose',lambda x,y:(y,x)),('anti-transpose',lambda x,y:(w-1-y,h-1-x)),
                 ('rotate-90',lambda x,y:(w-1-y,x)),('rotate-270',lambda x,y:(y,h-1-x))]
    found=[];seen=set()
    for name,fn in maps:
        mapping=tuple((lambda xy:xy[1]*w+xy[0])(fn(i%w,i//w)) for i in range(w*h))
        if mapping in seen or mapping==tuple(range(w*h)):continue
        seen.add(mapping)
        if {mapping[i] for i in pins}==pins and all(colors[i]==colors[mapping[i]] for i in pins):
            if any(colors[i]!=colors[mapping[i]] for i in range(w*h) if i not in pins):found.append(name)
    return found

def inspect(l):
    if not isinstance(l,dict):return {'errors':['FIELD_OBJECT'],'warnings':[]}
    errors=[];warnings=[]; w=l.get('width');h=l.get('height')
    if type(w) is not int or type(h) is not int or not(1<=w<=6 and 1<=h<=5):return {'errors':['DIMENSIONS'],'warnings':[]}
    n=w*h; rawpins=l.get('pinnedPositions');colors=l.get('solvedTileColors');p=l.get('startTileAtPosition')
    if not isinstance(rawpins,list) or any(type(x) is not int or not 0<=x<n for x in rawpins):errors.append('PIN_INDEX')
    elif len(set(rawpins))!=len(rawpins):errors.append('DUPLICATE_PIN')
    if not isinstance(colors,list) or len(colors)!=n or any(not isinstance(c,str) or not HEX.fullmatch(c) for c in colors):errors.append('COLORS')
    if not isinstance(p,list) or len(p)!=n or any(type(v) is not int for v in p) or sorted(p)!=list(range(n)):errors.append('PERMUTATION')
    if errors:return {'errors':errors,'warnings':warnings}
    pins=set(rawpins); moving=[i for i in range(n) if i not in pins]; colors=[c.upper() for c in colors]
    if len(pins)<2:errors.append('ANCHOR_COUNT')
    if len(moving)<2:errors.append('MOVABLE_COUNT')
    if any(p[i]!=i for i in pins):errors.append('PIN_MOVED')
    if len({colors[i] for i in moving})<len(moving):errors.append('DUPLICATE_MOVABLE_RGB')
    if len({colors[i] for i in pins})<2:errors.append('ANCHOR_COLORS')
    corners=l.get('cornerColorsTLTRBLBR')
    if not isinstance(corners,list) or len(corners)!=4 or any(not isinstance(c,str) or not HEX.fullmatch(c) for c in corners):errors.append('CORNERS')
    elif expected_colors(w,h,corners)!=colors:errors.append('COLOR_RECONSTRUCTION')
    amb=orientation_ambiguities(w,h,pins,colors)
    if amb:errors.append('ORIENTATION_AMBIGUITY')
    minimum=cycle_minimum(p)
    if minimum==0:errors.append('ALREADY_SOLVED_START')
    distance=None;pair=None
    if len(moving)>=2:
        distance,pair=min((math.dist(oklab(colors[i]),oklab(colors[j])),[i,j]) for i,j in itertools.combinations(moving,2))
        if distance<.025:warnings.append('CLOSE_COLORS_REVIEW')
    return {'errors':errors,'warnings':warnings,'minimumSwaps':minimum,'minimumNominalOklab':round(distance,9) if distance is not None else None,
            'closestMovablePair':pair,'orientationAmbiguities':amb,'fingerprint':fingerprint(l)}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--pack',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--previews',type=Path,required=True);a=ap.parse_args()
    raw=a.pack.read_bytes();pack=json.loads(raw); oldraw=(ROOT/'prototype/levels-0.1.json').read_bytes();old=json.loads(oldraw)
    assert pack['baselineSha256']==hashlib.sha256(oldraw).hexdigest()
    assert pack['campaign'][:15]==old['levels'];assert len(pack['campaign'])==60 and len(pack['daily'])==30
    alllevels=pack['campaign']+pack['daily'];assert len({l['id'] for l in alllevels})==90
    assert [i for chapter in pack['chapters'] for i in chapter['levelIds']]==[l['id'] for l in pack['campaign']]
    assert pack['dailySchedule']['releaseDates'] is None
    rows=[];fingerprints=set();targets=set();signatures=collections.Counter()
    for l in alllevels:
        check=inspect(l);assert not check['errors'],(l['id'],check)
        assert check['minimumSwaps']==l['minimumSwaps']
        pins=set(l['pinnedPositions']);p=l['startTileAtPosition'];moving=[i for i in range(len(p)) if i not in pins]
        assert all(p[i]!=i for i in moving)
        moves=witness(p,pins);assert len(moves)==check['minimumSwaps']
        # Replay the returned move list separately from construction.
        replay=p.copy()
        for x,y in moves:
            assert x!=y and x not in pins and y not in pins
            replay[x],replay[y]=replay[y],replay[x]
        assert replay==list(range(len(p)))
        exact=bfs(p,pins) if len(moving)<=5 else None
        if exact:assert exact[0]==check['minimumSwaps']
        assert check['fingerprint'] not in fingerprints;fingerprints.add(check['fingerprint'])
        target=(l['width'],l['height'],tuple(l['pinnedPositions']),tuple(l['solvedTileColors']))
        assert target not in targets;targets.add(target)
        signature=f"{l['width']}x{l['height']}:{l['anchorRule']}:{len(moving)}"
        signatures[signature]+=1
        rows.append({'id':l['id'],'width':l['width'],'height':l['height'],'movable':len(moving),'role':l['sequenceRole'],
                     **check,'bfs':{'distance':exact[0],'visited':exact[1]} if exact else None,'legalOptimalWitness':moves})
    a.previews.mkdir(parents=True,exist_ok=True)
    for group in range(6):
        levels=alllevels[group*15:(group+1)*15]
        svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1640" viewBox="0 0 1440 1640">',
          '<rect width="1440" height="1640" fill="#F5F3EF"/>','<g font-family="DejaVu Sans,sans-serif" fill="#20252B">',
          f'<text x="24" y="36" font-size="24">Candidate sheet {group+1} — START / SOLVED</text>',
          '<text x="24" y="62" font-size="14">Exact content render. Not final UI; human difficulty and display color have not been validated.</text>']
        for k,l in enumerate(levels):
            x=16+(k%3)*474;y=84+(k//3)*308
            svg += [f'<rect x="{x}" y="{y}" width="458" height="292" rx="10" fill="#FFF" stroke="#D1D0CC"/>',
              f'<text x="{x+16}" y="{y+27}" font-size="17">{l["id"]} / {l["width"]}x{l["height"]} / min {l["minimumSwaps"]}</text>',
              board_svg(l,x+12,y+64,210,210,False),board_svg(l,x+236,y+64,210,210,True)]
        svg+=['</g></svg>'];(a.previews/f'sheet-{group+1:02}.svg').write_text('\n'.join(svg)+'\n')
    report={'status':'TECHNICAL_PASS_HUMAN_REVIEW_REQUIRED','packSha256':hashlib.sha256(raw).hexdigest(),
      'baselineUnchanged':True,'campaign':60,'daily':30,'legalOptimalReplays':len(rows),'exhaustiveBfs':sum(r['bfs'] is not None for r in rows),
      'exactDuplicateTargets':0,'structuralSignatures':dict(sorted(signatures.items())),
      'colorWarningPolicy':'Nominal Euclidean Oklab <0.025 is a chosen review trigger, not a universal perception/accessibility threshold.',
      'colorWarnings':[r['id'] for r in rows if r['warnings']],
      'humanPlaytest':False,'phoneValidation':False,'newApkRuns':False,'rows':rows}
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('rows','structuralSignatures')},ensure_ascii=False,indent=2))

if __name__=='__main__':main()

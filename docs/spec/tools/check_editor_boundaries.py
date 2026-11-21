"""Executable research boundary fixtures, not an app/UI/cloud test."""
import copy, json
from pathlib import Path
from validate_release_candidates import inspect, fingerprint

ROOT=Path(__file__).resolve().parents[1]

def cycle_start(n,pins):
    moving=[i for i in range(n) if i not in pins]; p=list(range(n))
    for i,j in zip(moving,moving[1:]+moving[:1]):p[i]=j
    return p

def main():
    pack=json.loads((ROOT/'candidates/levels-0.1.json').read_text())
    base=pack['campaign'][5]; rows=[]
    def check(name,value,error=None,warning=None):
        got=inspect(value)
        if error:assert error in got['errors'],(name,got)
        else:assert not got['errors'],(name,got)
        if warning:assert warning in got['warnings'],(name,got)
        rows.append({'case':name,'passed':True,'expectedError':error,'expectedWarning':warning,
                     'actualErrors':got['errors'],'actualWarnings':got['warnings']})
    def changed(**kw):
        b=copy.deepcopy(base);b.update(kw);return b
    check('valid baseline',base)
    check('not an object',None,'FIELD_OBJECT')
    check('boolean is not width',changed(width=True),'DIMENSIONS')
    check('zero width',changed(width=0),'DIMENSIONS')
    check('seven columns',changed(width=7),'DIMENSIONS')
    check('six rows',changed(height=6),'DIMENSIONS')
    check('duplicate pin',changed(pinnedPositions=base['pinnedPositions']+[base['pinnedPositions'][0]]),'DUPLICATE_PIN')
    check('negative pin',changed(pinnedPositions=[-1]),'PIN_INDEX')
    check('boolean pin',changed(pinnedPositions=[True,2]),'PIN_INDEX')
    check('invalid RGB',changed(solvedTileColors=['red']+base['solvedTileColors'][1:]),'COLORS')
    check('short color array',changed(solvedTileColors=base['solvedTileColors'][:-1]),'COLORS')
    check('duplicate permutation',changed(startTileAtPosition=[0]*len(base['solvedTileColors'])),'PERMUTATION')
    p=base['startTileAtPosition'].copy();p[0],p[1]=p[1],p[0]
    check('moving a pinned tile',changed(startTileAtPosition=p),'PIN_MOVED')
    n=base['width']*base['height']
    check('no anchors',changed(pinnedPositions=[],startTileAtPosition=cycle_start(n,[])),'ANCHOR_COUNT')
    check('one movable tile',changed(pinnedPositions=list(range(n-1)),startTileAtPosition=list(range(n))),'MOVABLE_COUNT')
    check('solved initial board',changed(startTileAtPosition=list(range(n))),'ALREADY_SOLVED_START')
    check('malformed corner colors',changed(cornerColorsTLTRBLBR=['#000000']),'CORNERS')
    colors=base['solvedTileColors'].copy();colors[0]='#012345'
    check('rendered RGB disagrees with corners',changed(solvedTileColors=colors),'COLOR_RECONSTRUCTION')
    check('white board rejected',changed(solvedTileColors=['#FFFFFF']*n,cornerColorsTLTRBLBR=['#FFFFFF']*4),'DUPLICATE_MOVABLE_RGB')
    check('white anchors rejected',changed(solvedTileColors=['#FFFFFF']*n,cornerColorsTLTRBLBR=['#FFFFFF']*4),'ANCHOR_COLORS')
    # Explicit arithmetic fixtures; values are not imported from the generator.
    ambiguous={'width':3,'height':3,'pinnedPositions':[0,4,8],
       'cornerColorsTLTRBLBR':['#101010','#E01010','#10E010','#E0E010'],
       'solvedTileColors':['#101010','#781010','#E01010','#107810','#787810','#E07810','#10E010','#78E010','#E0E010'],
       'startTileAtPosition':cycle_start(9,[0,4,8])}
    check('diagonal anchors allow transpose',ambiguous,'ORIENTATION_AMBIGUITY')
    fixed=copy.deepcopy(ambiguous);fixed['pinnedPositions']=[0,2,6,8];fixed['startTileAtPosition']=cycle_start(9,fixed['pinnedPositions'])
    check('four distinct corners remove transpose ambiguity',fixed)
    duplicate={'width':3,'height':3,'pinnedPositions':[0,2,6,8],
       'cornerColorsTLTRBLBR':['#000000','#808080','#808080','#FFFFFF'],
       'solvedTileColors':['#000000','#404040','#808080','#404040','#808080','#C0C0C0','#808080','#C0C0C0','#FFFFFF'],
       'startTileAtPosition':cycle_start(9,[0,2,6,8])}
    check('different anchors but duplicate movable RGB',duplicate,'DUPLICATE_MOVABLE_RGB')
    warning=next(l for l in pack['campaign'] if l['id']=='gradient-053')
    check('close colors warn but do not reject',warning,warning='CLOSE_COLORS_REVIEW')
    line={'width':6,'height':1,'pinnedPositions':[0,5],
       'cornerColorsTLTRBLBR':['#000000','#FFFFFF','#000000','#FFFFFF'],
       'solvedTileColors':['#000000','#333333','#666666','#999999','#CCCCCC','#FFFFFF'],
       'startTileAtPosition':[0,2,3,4,1,5]}
    check('one row with distinct endpoints',line)
    def same(name,l,r,equal=True):
        assert (fingerprint(l)==fingerprint(r))==equal,name
        rows.append({'case':name,'passed':True,'fingerprintEqual':equal})
    r=copy.deepcopy(line);r.update(id='renamed-id',title='Новое имя',seed=999,author='example')
    same('metadata is not gameplay revision',line,r)
    r=copy.deepcopy(line);r['pinnedPositions'].reverse();same('pin order is not gameplay revision',line,r)
    r=copy.deepcopy(line);r['solvedTileColors']=[c.lower() for c in r['solvedTileColors']];same('hex case is not gameplay revision',line,r)
    r=copy.deepcopy(line);r['cornerColorsTLTRBLBR'][2:] = ['#FF0000','#00FF00']
    check('unused corners do not affect one-row reconstruction',r)
    same('unused corner parameters are not gameplay revision',line,r)
    r=copy.deepcopy(line);r['startTileAtPosition']=[0,4,1,2,3,5];same('different start invalidates completion',line,r,False)
    r=copy.deepcopy(line);r['solvedTileColors'][1]='#343434';same('visible RGB invalidates completion',line,r,False)
    r=copy.deepcopy(line);r['pinnedPositions']=[0,4,5];same('pin mask invalidates completion',line,r,False)
    report={'status':'PASS','cases':len(rows),'scope':'Pure field and fingerprint oracle; no UI, durable storage, account or cloud execution.',
       'allWhitePlayable':False,'transposeAmbiguityDetected':True,'closeColorsAreWarning':True,'rows':rows}
    (ROOT/'candidates/editor-boundaries-0.1.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'},ensure_ascii=False))

if __name__=='__main__':main()

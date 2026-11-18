"""Read-only validator and exact-data preview for our original prototype pack.

Does not import the generator. Cycle counting and legal witness replay validate
every task; exhaustive BFS independently verifies small tasks (<=5 movable).
Color distances are nominal diagnostics, not human or display measurements.
"""
import argparse,collections,hashlib,html,itertools,json,math
from pathlib import Path


def oklab(color):
    rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    r,g,b=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    l=(.4122214708*r+.5363325363*g+.0514459929*b)**(1/3)
    m=(.2119034982*r+.6806995451*g+.1073969566*b)**(1/3)
    s=(.0883024619*r+.2817188376*g+.6299787005*b)**(1/3)
    return (.2104542553*l+.793617785*m-.0040720468*s,
            1.9779984951*l-2.428592205*m+.4505937099*s,
            .0259040371*l+.7827717662*m-.808675766*s)


def cycle_minimum(p):
    seen=set();cycles=0
    for i in range(len(p)):
        if i in seen:continue
        cycles+=1
        while i not in seen:seen.add(i);i=p[i]
    return len(p)-cycles


def witness(p,pins):
    a=p.copy();moves=[]
    for correct in range(len(a)):
        if a[correct]!=correct:
            found=a.index(correct)
            assert correct not in pins and found not in pins
            moves.append([correct,found]);a[correct],a[found]=a[found],a[correct]
    assert a==list(range(len(a)))
    return moves


def bfs(p,pins):
    free=[i for i in range(len(p)) if i not in pins]
    start=tuple(free.index(p[i]) for i in free);goal=tuple(range(len(free)))
    queue=collections.deque([(start,0)]);seen={start}
    while queue:
        a,d=queue.popleft()
        if a==goal:return d,len(seen)
        for i,j in itertools.combinations(range(len(a)),2):
            b=list(a);b[i],b[j]=b[j],b[i];b=tuple(b)
            if b not in seen:seen.add(b);queue.append((b,d+1))
    raise AssertionError('No path')


def board_svg(level,x,y,w,h,solved):
    cols,rows=level['width'],level['height'];cell=min(w/cols,h/rows,42)
    x+=(w-cell*cols)/2;y+=(h-cell*rows)/2;parts=[]
    order=list(range(cols*rows)) if solved else level['startTileAtPosition']
    for position,tile in enumerate(order):
        xx=x+position%cols*cell;yy=y+position//cols*cell
        parts.append(f'<rect x="{xx:.3f}" y="{yy:.3f}" width="{cell:.3f}" height="{cell:.3f}" fill="{level["solvedTileColors"][tile]}"/>')
        if position in level['pinnedPositions']:
            cx,cy=xx+cell/2,yy+cell/2
            parts.append(f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="2.5" fill="#20252B" stroke="#FFFFFF" stroke-width=".6"/>')
    return ''.join(parts)


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--pack',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--preview',type=Path,required=True);a=ap.parse_args()
    raw=a.pack.read_bytes();pack=json.loads(raw);levels=pack['levels'];assert len(levels)==15
    assert len({l['id'] for l in levels})==15
    assert math.dist(oklab('#FF0000'),(.62795536,.22486306,.12584630))<1e-7
    rows=[];svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1640" viewBox="0 0 1440 1640">',
        '<rect width="1440" height="1640" fill="#F5F3EF"/>',
        '<g font-family="DejaVu Sans, sans-serif" fill="#20252B">',
        '<text x="24" y="36" font-size="24">15 original prototype candidates — START / SOLVED</text>',
        '<text x="24" y="61" font-size="14">Dots are fixed tiles. Exact authored data; gameplay presentation and human difficulty are not validated.</text>']
    for k,l in enumerate(levels):
        n=l['width']*l['height'];p=l['startTileAtPosition'];pins=set(l['pinnedPositions']);colors=l['solvedTileColors']
        assert 1<=l['width']<=6 and 1<=l['height']<=5
        assert len(p)==len(colors)==n and sorted(p)==list(range(n))
        assert len(pins)==len(l['pinnedPositions']) and pins<=set(range(n))
        moving=[i for i in range(n) if i not in pins];assert len(moving)>=2
        assert all(p[i]==i for i in pins) and all(p[i]!=i for i in moving)
        assert len({colors[i] for i in moving})==len(moving)
        assert all(len(c)==7 and c.startswith('#') and 0<=int(c[1:],16)<=0xffffff for c in colors)
        minimum=cycle_minimum(p);moves=witness(p,pins)
        assert minimum==l['minimumSwaps']==len(moves)
        bfs_result=bfs(p,pins) if len(moving)<=5 else None
        if bfs_result:assert bfs_result[0]==minimum
        distance=min(math.dist(oklab(colors[i]),oklab(colors[j])) for i,j in itertools.combinations(moving,2))
        row={'id':l['id'],'width':l['width'],'height':l['height'],'pinned':len(pins),'movable':len(moving),
             'minimum_swaps':minimum,'min_movable_oklab':round(distance,9),'bfs':{'distance':bfs_result[0],'visited':bfs_result[1]} if bfs_result else None,
             'legal_optimal_witness':moves,'level_sha256':hashlib.sha256(json.dumps(l,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()}
        rows.append(row)
        x=16+(k%3)*474;y=84+(k//3)*308
        svg.append(f'<rect x="{x}" y="{y}" width="458" height="292" rx="10" fill="#FFFFFF" stroke="#D1D0CC"/>')
        svg.append(f'<text x="{x+16}" y="{y+27}" font-size="17">{html.escape(l["id"])} · {l["width"]}×{l["height"]} · min {minimum}</text>')
        svg.append(f'<text x="{x+16}" y="{y+49}" font-size="13">{len(moving)} movable · min Oklab {distance:.4f}</text>')
        svg.append(board_svg(l,x+12,y+63,210,210,False));svg.append(board_svg(l,x+236,y+63,210,210,True))
    svg.extend(['</g>','</svg>']);a.preview.parent.mkdir(parents=True,exist_ok=True);a.preview.write_text('\n'.join(svg)+'\n')
    result={'status':'PASS','content_version':pack['contentVersion'],'pack_sha256':hashlib.sha256(raw).hexdigest(),
            'levels':15,'legal_optimal_replays':15,'exhaustive_bfs_levels':sum(r['bfs'] is not None for r in rows),
            'distance_metric':'Euclidean Oklab on authored 8-bit nominal sRGB, no clipping; diagnostic, not a JND or accessibility threshold.',
            'human_playtest':False,'rows':rows}
    a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['status','levels','legal_optimal_replays','exhaustive_bfs_levels']},indent=2))
    print('\n'.join(f'{r["id"]}: {r["movable"]} movable, min {r["minimum_swaps"]}, Oklab {r["min_movable_oklab"]:.4f}' for r in rows))


if __name__=='__main__':main()

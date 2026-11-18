"""Original offline candidate bank, not a runtime generator or difficulty model."""
import argparse, colorsys, hashlib, json
from pathlib import Path
from build_prototype_pack import pinned, tile_colors, start_order

ROOT = Path(__file__).resolve().parents[1]
PLANS = [
 [(5,3,'top_bottom'),(4,5,'left_right'),(5,4,'frame'),(5,4,'top_bottom'),(4,4,'frame'),
  (5,4,'corners'),(6,3,'top_bottom'),(6,1,'ends'),(4,5,'corners'),(5,5,'frame'),
  (5,5,'top_bottom_center'),(6,4,'left_right'),(4,4,'frame'),(5,5,'corners_center'),(6,4,'corners')],
 [(5,5,'cross_corners'),(5,4,'top_bottom_center'),(5,5,'corners_center'),(6,4,'left_right'),(4,4,'frame'),
  (5,5,'top_bottom'),(6,5,'cross_corners'),(1,5,'ends'),(5,5,'left_right'),(6,4,'frame'),
  (6,5,'corners_center'),(5,4,'corners'),(4,4,'frame'),(6,5,'top_bottom_center'),(5,5,'corners')],
 [(6,4,'corners_center'),(5,5,'left_right'),(6,5,'cross_corners'),(5,5,'corners'),(4,4,'frame'),
  (6,5,'top_bottom'),(5,5,'corners_center'),(6,1,'ends'),(6,4,'corners'),(5,5,'frame'),
  (6,5,'left_right'),(5,5,'cross_corners'),(4,4,'frame'),(6,5,'corners_center'),(6,5,'corners')]
]
DAILY = [(3,3,'corners'),(4,4,'frame'),(5,4,'frame'),(4,4,'top_bottom'),(4,4,'left_right'),
         (5,3,'top_bottom'),(4,4,'corners_center'),(5,4,'cross_corners'),(5,5,'frame'),(5,4,'top_bottom')]
INTENT = {
 'ends':'Восстановить направление одного ряда; короткое знакомое действие.',
 'frame':'Сравнивать внутренние оттенки с готовой рамкой по двум осям.',
 'top_bottom':'Строить промежуточные строки между верхней и нижней опорой.',
 'left_right':'Перенести сравнение между опорами на боковые края.',
 'corners':'Восстановить края и внутренние клетки по четырём углам.',
 'corners_center':'Согласовать направления углов с внутренней контрольной точкой.',
 'top_bottom_center':'Проверять промежуточные строки по центральной опоре.',
 'cross_corners':'Разделить поле внутренними опорами на меньшие области.'
}

def palette(serial,w,h,attempt=0):
    # Own parametric palette: two hue/lightness axes, not extracted artwork.
    hue=(serial*137.507764 + attempt*23.7)%360
    values=[(hue,.48,.83),(hue+67,.60,.64),(hue-31,.58,.43),(hue+139,.62,.24)]
    c=[]
    for hh,s,l in values:
        rgb=colorsys.hls_to_rgb((hh%360)/360,l,s)
        c.append('#'+''.join(f'{int(v*255+.5):02X}' for v in rgb))
    if serial%2: c=[c[1],c[0],c[3],c[2]]
    if serial%3==0: c=[c[2],c[3],c[0],c[1]]
    if h==1: c=[c[0],c[1],c[0],c[1]]
    if w==1: c=[c[0],c[0],c[2],c[2]]
    return c

def level(serial,ordinal,plan,source,role):
    w,h,rule=plan; pins=pinned(w,h,rule)
    for attempt in range(32):
        c=palette(serial,w,h,attempt); colors=tile_colors(w,h,c)
        moving=[i for i in range(w*h) if i not in pins]
        if len({colors[i] for i in moving})==len(moving): break
    else: raise ValueError('Could not avoid exact RGB duplicates')
    seed=(0x43414e44 + serial*0x9e3779b9)&0xffffffff
    return {'id':f'gradient-{ordinal:03}' if source=='campaign' else f'gradient-daily-{ordinal:03}',
      'ordinal':ordinal,'title':f'{"Композиция" if source=="campaign" else "Ежедневная композиция"} {ordinal}',
      'intent':INTENT[rule], 'sequenceRole':role,'width':w,'height':h,'anchorRule':rule,
      'pinnedPositions':pins,'cornerColorsTLTRBLBR':c,'solvedTileColors':colors,
      'startTileAtPosition':start_order(w*h,pins,seed),'seed':seed,
      'minimumSwaps':w*h-len(pins)-1}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True);a=ap.parse_args()
    raw=(ROOT/'prototype/levels-0.1.json').read_bytes(); old=json.loads(raw)
    campaign=old['levels'].copy()
    for chapter,plans in enumerate(PLANS,2):
        for slot,plan in enumerate(plans,1):
            ordinal=(chapter-1)*15+slot
            role='recovery' if slot in (5,8,13) else ('combine' if slot in (7,11,14,15) else 'practice')
            campaign.append(level(ordinal,ordinal,plan,'campaign',role))
    daily=[level(1000+i,i,DAILY[(i-1)%len(DAILY)],'daily','daily_candidate') for i in range(1,31)]
    doc={'schemaVersion':1,'contentVersion':'gradient-release-candidates-0.1',
      'status':'TECHNICAL_CANDIDATES_NOT_RELEASE_APPROVED','authorship':'Original content; no APK inputs.',
      'baselineSha256':hashlib.sha256(raw).hexdigest(),'baselinePolicy':'First 15 level records unchanged.',
      'colorRule':old['colorRule'],'rng':old['rng'],
      'humanPlaytest':False,'phoneColorValidation':False,
      'chapters':[{'id':f'chapter-{c:02}','levelIds':[f'gradient-{i:03}' for i in range((c-1)*15+1,c*15+1)],
                   'nextChapterAt':10 if c<4 else None} for c in range(1,5)],
      'dailySchedule':{'status':'UNASSIGNED','releaseDates':None,'candidateOrder':[l['id'] for l in daily]},
      'campaign':campaign,'daily':daily}
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'campaign':len(campaign),'daily':len(daily),'status':doc['status']}))

if __name__=='__main__': main()

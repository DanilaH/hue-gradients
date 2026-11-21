"""Own authored gradient prototype: 15 small, fixed, reproducible tasks.

No APK inputs or competitor palettes/layouts. A draft for playtesting, not a
validated difficulty model. RGB quantization and RNG are explicitly specified.
"""
import argparse
import json
from pathlib import Path

# id, dimensions, anchor rule, original RGB corners TL/TR/BL/BR, teaching intent.
DESIGNS = [
 (1,4,1,"ends",["#EEBC72","#30596C","#EEBC72","#30596C"],"Первый обмен", "Обменять две перепутанные плитки между готовыми концами.","introduce"),
 (2,5,1,"ends",["#D8E8EA","#334B98","#D8E8EA","#334B98"],"Три оттенка", "Найти средний оттенок, затем восстановить направление ряда.","practice"),
 (3,1,5,"ends",["#E3DCA0","#E3DCA0","#2C6C65","#2C6C65"],"Вертикальный перенос", "Применить тот же приём в вертикальном ряду; это перенос навыка, не новая стратегия.","transfer"),
 (4,3,3,"corners",["#F2D398","#7AD8CA","#C65771","#5455AA"],"Два направления", "Согласовать положение плитки по горизонтальному и вертикальному изменению цвета.","introduce"),
 (5,4,4,"frame",["#E2D8A2","#6FB9CF","#B16841","#4957A1"],"Готовая рамка", "Расположить четыре внутренние плитки по полностью заданным краям.","recovery"),
 (6,4,4,"top_bottom",["#E5B8B2","#ADB7E1","#BA7843","#416B73"],"Опора сверху и снизу", "Восстановить промежуточные строки между двумя закреплёнными краями.","practice"),
 (7,4,4,"corners",["#E5D7AE","#75C9BD","#C86C7B","#585B99"],"Четыре опоры", "Сначала восстановить направление краёв, затем проверить внутренние клетки.","combine"),
 (8,6,1,"ends",["#E5CAB5","#7B385A","#E5CAB5","#7B385A"],"Короткая передышка", "Спокойно упорядочить знакомый одномерный ряд после более плотного поля.","recovery"),
 (9,4,4,"left_right",["#DEC6F2","#8BD6E2","#8D4E6C","#245C75"],"Опора по сторонам", "Перенести приём уровня 6 на два боковых края.","transfer"),
 (10,5,5,"frame",["#E9CA88","#76C6CF","#B15551","#554B8F"],"Внутренний квадрат", "Собрать внутренние 3×3 клетки, сверяясь с рамкой по обеим осям.","practice"),
 (11,5,5,"cross_corners",["#D9C8DE","#7CC9BC","#C28241","#365F90"],"Внутренние ориентиры", "Использовать закреплённый крест как границы четырёх небольших цветовых областей.","introduce"),
 (12,4,4,"corners",["#CCB8A1","#93BABC","#AD8C89","#7B8BA8"],"Более близкие оттенки", "На знакомом небольшом поле различить более близкие цвета; кандидат для проверки на телефоне.","precision_candidate"),
 (13,4,4,"frame",["#D6DDA5","#8EC7D1","#A68A51","#4E6B95"],"Снова четыре плитки", "Закрепить двумерное сравнение коротким полем с готовой рамкой.","recovery"),
 (14,5,5,"top_bottom_center",["#E6C9A0","#93C1D7","#C57689","#476D83"],"Центральная проверка", "Строить цвет между верхом и низом, проверяя промежуточный результат по центру.","combine"),
 (15,5,5,"corners_center",["#F0D391","#86D0C8","#CB6F7E","#575EA4"],"Сборка знакомых приёмов", "Использовать углы для направлений и центр для проверки внутренних оттенков.","combine"),
]


def pinned(w, h, rule):
    out=[]
    for y in range(h):
        for x in range(w):
            corner=x in (0,w-1) and y in (0,h-1)
            center=x==w//2 and y==h//2
            conditions={
                "ends": (x in (0,w-1) if h==1 else y in (0,h-1)),
                "corners":corner,
                "frame":x in (0,w-1) or y in (0,h-1),
                "top_bottom":y in (0,h-1),
                "left_right":x in (0,w-1),
                "cross_corners":x==w//2 or y==h//2 or corner,
                "top_bottom_center":y in (0,h-1) or center,
                "corners_center":corner or center,
            }
            if conditions[rule]:out.append(y*w+x)
    return out


def tile_colors(w,h,hexes):
    c=[[int(s[i:i+2],16) for i in (1,3,5)] for s in hexes]
    dx,dy=max(1,w-1),max(1,h-1);den=dx*dy;out=[]
    for y in range(h):
        for x in range(w):
            weights=[(dx-x)*(dy-y),x*(dy-y),(dx-x)*y,x*y]
            rgb=[(2*sum(c[i][channel]*weights[i] for i in range(4))+den)//(2*den) for channel in range(3)]
            out.append('#'+''.join(f'{v:02X}' for v in rgb))
    return out


class Rng:
    def __init__(self,seed):self.state=seed
    def next(self):
        x=self.state;x^=(x<<13)&0xffffffff;x^=x>>17;x^=(x<<5)&0xffffffff
        self.state=x&0xffffffff;return self.state
    def below(self,n):
        limit=2**32-(2**32%n)
        while True:
            r=self.next()
            if r<limit:return r%n


def start_order(n,pins,seed):
    moving=[i for i in range(n) if i not in pins];values=moving.copy();rng=Rng(seed)
    for i in range(len(values)-1,0,-1):
        j=rng.below(i);values[i],values[j]=values[j],values[i]
    out=list(range(n))
    for position,tile in zip(moving,values):out[position]=tile
    return out


def build():
    levels=[]
    for i,w,h,rule,corners,title,intent,role in DESIGNS:
        pins=pinned(w,h,rule);seed=(0x48554500+i*0x9e3779b9)&0xffffffff
        levels.append({"id":f"gradient-{i:03}","ordinal":i,"title":title,"intent":intent,"sequenceRole":role,
                       "width":w,"height":h,"anchorRule":rule,"pinnedPositions":pins,
                       "cornerColorsTLTRBLBR":corners,"solvedTileColors":tile_colors(w,h,corners),
                       "startTileAtPosition":start_order(w*h,pins,seed),"seed":seed,
                       "minimumSwaps":w*h-len(pins)-1})
    return {"schemaVersion":1,"contentVersion":"gradient-prototype-0.1","status":"PLAYTEST_CANDIDATE",
            "authorship":"Original authored content; no APK content inputs.",
            "indexing":"Row-major zero-based positions. Tile ID equals its solved position.",
            "colorRule":"Bilinear sRGB byte channels, integer arithmetic, round-half-up; degenerate axis denominator is 1.",
            "rng":"xorshift32 (13,17,5), unsigned 32-bit; rejection-sampled bounded integers; Sattolo cycle on movable positions.",
            "difficultyCaveat":"Optimal swaps and nominal color distance do not measure human difficulty or accessibility.","levels":levels}


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True);a=ap.parse_args()
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(build(),ensure_ascii=False,indent=2)+'\n')
    print('Authored 15 candidate levels:',a.out)


if __name__=='__main__':main()

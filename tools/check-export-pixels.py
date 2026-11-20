"""Independent PNG decode/geometry/CRC oracle. Does not import the TS layout/renderer."""
import hashlib,json,struct,zlib
from bisect import bisect_right
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw

root=Path('.test-output/m4b/png')
square=lambda x,y,s:(x,y,s,s)
layouts={
 'export-caption':((1800,2000),[square(96,96,1608)],(96,1752,1608,152)),
 'export-strip':((2400,960),[square(x,144,672) for x in (96,864,1632)],None),
 'export-grid':((2000,2000),[square(x,y,856) for y in (96,1048) for x in (96,1048)],None),
 'export-frame':((2000,2000),[square(200,200,1600)],None),
 'export-diptych':((2400,1400),[square(x,172,1056) for x in (96,1248)],None),
 'export-postcard':((1800,2200),[square(96,96,1608)],(96,1792,1608,312)),
 'chapter-page':((1800,3000),[square(x,y,496) for y in (208,752,1296,1840,2384) for x in (108,652,1196)],(108,32,1584,128)),
}

def axis_weights(size,count):
 if count==1:
  return [(0,0,1,0,1)]*size
 # The rounded anchors include both outermost pixel centres.
 steps=count-1
 anchors=[(2*i*(size-1)+steps)//(2*steps) for i in range(count)]
 weights=[]
 for pixel in range(size):
  low=min(bisect_right(anchors,pixel)-1,steps-1)
  left,right=anchors[low:low+2]
  weights.append((low,low+1,right-pixel,pixel-left,right-left))
 return weights

def expected_gradient(field,size):
 width,height=size
 cols,rows=field['width'],field['height']
 colours=[bytes.fromhex(colour[1:]) for colour in field['solvedTileColors']]
 horizontal=axis_weights(width,cols)
 spans=[span for *_,span in horizontal for _ in range(3)]
 source_rows=[
  [a*near+b*far for left,right,near,far,_ in horizontal
   for a,b in zip(colours[y*cols+left],colours[y*cols+right])]
  for y in range(rows)
 ]
 output=bytearray()
 for top,bottom,upper,lower,span in axis_weights(height,rows):
  divisors=[span*x_span for x_span in spans]
  scanline=bytes((2*(a*upper+b*lower)+d)//(2*d)
   for a,b,d in zip(source_rows[top],source_rows[bottom],divisors))
  output.extend(scanline)
 return output

report=[]
for row in json.loads((root/'works.json').read_text()):
 name=row['format'];path=root/row['file'];raw=path.read_bytes();assert raw[:8]==b'\x89PNG\r\n\x1a\n'
 chunks={};offset=8
 while offset<len(raw):
  n=struct.unpack_from('>I',raw,offset)[0];kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+n]
  assert zlib.crc32(kind+data)==struct.unpack_from('>I',raw,offset+8+n)[0],(name,kind,'CRC')
  chunks.setdefault(kind,[]).append(data);offset+=n+12
 assert offset==len(raw) and chunks[b'sRGB']==[b'\x01'] and struct.unpack('>I',chunks[b'gAMA'][0])[0]==45455
 assert not ({b'iCCP',b'cICP'} & chunks.keys())
 image=Image.open(path).convert('RGBA')
 assert image.getchannel('A').getextrema()==(255,255),(name,'Non-opaque pixels')
 proof={'format':name,'file':path.name,'dimensions':list(image.size),'sRGBIntent':1,'gamma':45455,'crc':'PASS','sha256':hashlib.sha256(raw).hexdigest()}
 if name=='clean':
  size,regions,text=(1080,1920),[(0,0,1080,1920)],None
 else:
  size,regions,text=layouts[name]
 assert image.size==size,(name,image.size,size)
 assert len(regions)==len(row['works'])
 image=image.convert('RGB')
 expected=Image.new('RGB',size,(255,242,222));mask=Image.new('L',size,0);md=ImageDraw.Draw(mask)
 for index,((x,y,width,height),field) in enumerate(zip(regions,row['works'])):
  box=(x,y,x+width,y+height)
  gradient=expected_gradient(field,(width,height))
  assert image.crop(box).tobytes()==gradient,(path.name,'interpolation or anchor mismatch',index)
  expected.paste(Image.frombytes('RGB',(width,height),bytes(gradient)),(x,y))
 if text:
  x,y,w,h=text;md.rectangle((x,y,x+w-1,y+h-1),fill=255)
 if name=='export-frame':md.rectangle((94,94,1906,1906),outline=255,width=8)
 difference=ImageChops.difference(image,expected);difference.paste((0,0,0),(0,0),mask)
 assert difference.getbbox() is None,(path.name,'tint/extra decoration outside allowed regions')
 report.append({**proof,'fields':regions,'allGradientPixelsAndAnchors':'PASS','outsideFieldsAndText':'PASS'})
Path('.test-output/m4b/pixels.json').write_text(json.dumps({'scope':'Real Canvas PNGs decoded independently with Pillow; future daily rights are synthetic renderer fixtures','results':report},indent=2)+'\n')
gradients=sum(len(row['fields']) for row in report)
print(f'PASS: {len(report)} PNGs with {gradients} gradient regions; all pixels, dimensions and sRGB chunks checked independently.')

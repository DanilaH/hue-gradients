"""Independent PNG decode/geometry/CRC oracle. Does not import the TS layout/renderer."""
import hashlib,json,struct,zlib
from bisect import bisect_right
from pathlib import Path
from PIL import Image

root=Path('.test-output/m4b/png')
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
 path=root/row['file'];name=path.name;raw=path.read_bytes();assert raw[:8]==b'\x89PNG\r\n\x1a\n'
 chunks={};offset=8
 while offset<len(raw):
  n=struct.unpack_from('>I',raw,offset)[0];kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+n]
  assert zlib.crc32(kind+data)==struct.unpack_from('>I',raw,offset+8+n)[0],(name,kind,'CRC')
  chunks.setdefault(kind,[]).append(data);offset+=n+12
 assert offset==len(raw) and chunks[b'sRGB']==[b'\x01'] and struct.unpack('>I',chunks[b'gAMA'][0])[0]==45455
 assert not ({b'iCCP',b'cICP'} & chunks.keys())
 image=Image.open(path).convert('RGBA')
 assert image.getchannel('A').getextrema()==(255,255),(name,'Non-opaque pixels')
 proof={'file':path.name,'dimensions':list(image.size),'sRGBIntent':1,'gamma':45455,'crc':'PASS','sha256':hashlib.sha256(raw).hexdigest()}
 size=tuple(row['size'])
 assert image.size==size,(name,image.size,size)
 gradient=expected_gradient(row['field'],size)
 assert image.convert('RGB').tobytes()==gradient,(path.name,'interpolation, edge anchors or background mismatch')
 report.append({**proof,'allGradientPixelsAndAnchors':'PASS'})
Path('.test-output/m4b/pixels.json').write_text(json.dumps({'scope':'Actual browser wallpaper downloads decoded independently with Pillow','results':report},indent=2)+'\n')
print(f'PASS: {len(report)} full-screen wallpaper PNGs; all pixels, dimensions, alpha and sRGB chunks checked independently.')

"""Independent PNG decode/geometry/CRC oracle. Does not import the TS layout/renderer."""
import hashlib,json,struct,zlib
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
report=[]
for row in json.loads((root/'works.json').read_text()):
 name=row['format'];path=root/f'{name}.png';raw=path.read_bytes();assert raw[:8]==b'\x89PNG\r\n\x1a\n'
 chunks={};offset=8
 while offset<len(raw):
  n=struct.unpack_from('>I',raw,offset)[0];kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+n]
  assert zlib.crc32(kind+data)==struct.unpack_from('>I',raw,offset+8+n)[0],(name,kind,'CRC')
  chunks.setdefault(kind,[]).append(data);offset+=n+12
 assert offset==len(raw) and chunks[b'sRGB']==[b'\x01'] and struct.unpack('>I',chunks[b'gAMA'][0])[0]==45455
 assert not ({b'iCCP',b'cICP'} & chunks.keys())
 image=Image.open(path).convert('RGBA')
 assert image.getchannel('A').getextrema()==(255,255),(name,'Non-opaque pixels')
 if name=='clean':
  f=row['works'][0];s=1800//max(f['width'],f['height']);size=(f['width']*s,f['height']*s);regions=[(0,0,*size)];text=None
 else:size,regions,text=layouts[name]
 assert image.size==size,(name,image.size,size)
 assert len(regions)==len(row['works'])
 expected=Image.new('RGBA',size,(255,242,222,255));mask=Image.new('L',size,0);md=ImageDraw.Draw(mask);tile_count=0;field_rects=[]
 for region,field in zip(regions,row['works']):
  x,y,rw,rh=region;cols,rows=field['width'],field['height'];s=min(rw//cols,rh//rows);fw,fh=cols*s,rows*s;left=x+(rw-fw)//2;top=y+(rh-fh)//2
  field_rects.append([left,top,fw,fh,s]);assert s>0
  for i,color in enumerate(field['solvedTileColors']):
   xx,yy=left+(i%cols)*s,top+(i//cols)*s;box=(xx,yy,xx+s,yy+s)
   tile=Image.new('RGBA',(s,s),color)
   assert ImageChops.difference(image.crop(box),tile).convert('RGB').getbbox() is None,(name,'RGB/seam/overlay mismatch',i)
   expected.paste(tile,(xx,yy));tile_count+=1
 if text:
  x,y,w,h=text;md.rectangle((x,y,x+w-1,y+h-1),fill=255)
 if name=='export-frame':md.rectangle((94,94,1906,1906),outline=255,width=8)
 difference=ImageChops.difference(image,expected);difference.paste((0,0,0,0),(0,0),mask)
 assert difference.convert('RGB').getbbox() is None,(name,'tint/extra decoration outside allowed regions')
 report.append({'format':name,'dimensions':list(size),'fields':field_rects,'exactOpaqueTiles':tile_count,'allTilePixelsAndSeams':'PASS','outsideFieldsAndText':'PASS','sRGBIntent':1,'gamma':45455,'crc':'PASS','sha256':hashlib.sha256(raw).hexdigest()})
Path('.test-output/m4b/pixels.json').write_text(json.dumps({'scope':'Real Canvas PNGs decoded independently with Pillow; future daily rights are synthetic renderer fixtures','results':report},indent=2)+'\n')
print(f'PASS: {len(report)} PNGs; every tile pixel, seam, integer fit, canvas size and sRGB chunk checked independently.')

import { ExportError, fitField, measuredLines, type ExportField, type ExportPlan } from '../domain/export';

// Provisional existing UI tokens; font approval is still an M2 owner-review gate.
export const EXPORT_STYLE={paper:'#FFF2DE',ink:'#261E32',font:'52px system-ui, sans-serif',lineHeight:64};
function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return(crc^0xffffffff)>>>0;
}
function chunk(type:string,data:Uint8Array):Uint8Array<ArrayBuffer> {
  const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);view.setUint32(bytes.length-4,crc32(bytes.subarray(4,bytes.length-4)));return bytes;
}
/** Annotate an sRGB Canvas PNG without re-encoding its IDAT/pixels. W3C PNG3 §11.3.2.5. */
export async function srgbPng(blob:Blob):Promise<Blob> {
  const bytes=new Uint8Array(await blob.arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
  if(signature.some((v,i)=>bytes[i]!==v))throw new ExportError('UNAVAILABLE','Не удалось подготовить PNG.');
  const parts:BlobPart[]=[bytes.slice(0,8)],view=new DataView(bytes.buffer);let offset=8,ended=false,header=false;
  while(offset+12<=bytes.length) {
    const size=view.getUint32(offset),end=offset+size+12;if(end>bytes.length)throw new ExportError('UNAVAILABLE','Повреждён PNG.');
    const type=new TextDecoder().decode(bytes.subarray(offset+4,offset+8));
    if(!header&&type!=='IHDR')throw new ExportError('UNAVAILABLE','Повреждён заголовок PNG.');
    if(!['sRGB','gAMA','cHRM','iCCP','cICP'].includes(type))parts.push(bytes.slice(offset,end));
    if(type==='IHDR') {if(header||size!==13)throw new ExportError('UNAVAILABLE','Повреждён заголовок PNG.');header=true;parts.push(chunk('sRGB',new Uint8Array([1])));const gamma=new Uint8Array(4);new DataView(gamma.buffer).setUint32(0,45455);parts.push(chunk('gAMA',gamma));}
    offset=end;if(type==='IEND'){ended=true;break;}
  }
  if(!ended||offset!==bytes.length)throw new ExportError('UNAVAILABLE','Повреждён PNG.');
  return new Blob(parts,{type:'image/png'});
}
function samplesOnAxis(pixels: number, nodes: number) {
  if (nodes === 1) return Array.from({ length: pixels }, () => ({ low: 0, high: 0, near: 1, far: 0, span: 1 }));
  // Put nodes on the nearest pixel centres, including both outermost pixels.
  const anchors = Array.from({ length: nodes }, (_, i) => Math.round(i * (pixels - 1) / (nodes - 1)));
  let low = 0;
  return Array.from({ length: pixels }, (_, pixel) => {
    while (low + 1 < nodes - 1 && pixel > anchors[low + 1]!) low++;
    const left = anchors[low]!, right = anchors[low + 1]!;
    return { low, high: low + 1, near: right - pixel, far: pixel - left, span: right - left };
  });
}

function drawGradient(ctx: CanvasRenderingContext2D, field: ExportField, width: number, height: number): void {
  const image = ctx.createImageData(width, height);
  const { data } = image;
  const colours = field.solvedTileColors.map(colour => {
    const rgb = Number.parseInt(colour.slice(1), 16);
    return [rgb >>> 16, (rgb >>> 8) & 255, rgb & 255];
  });
  const horizontal = samplesOnAxis(width, field.width);
  let index = 0;
  for (const y of samplesOnAxis(height, field.height)) {
    const top = y.low * field.width, bottom = y.high * field.width;
    for (const x of horizontal) {
      const a = colours[top + x.low]!, b = colours[top + x.high]!;
      const c = colours[bottom + x.low]!, d = colours[bottom + x.high]!;
      const span = x.span * y.span;
      // Blend the encoded sRGB components and round only at the final pixel.
      for (let channel = 0; channel < 3; channel++) {
        const upper = a[channel]! * x.near + b[channel]! * x.far;
        const lower = c[channel]! * x.near + d[channel]! * x.far;
        data[index++] = Math.round((upper * y.near + lower * y.far) / span);
      }
      data[index++] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function gradientThumbnail(field: ExportField): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
  if (context) drawGradient(context, field, canvas.width, canvas.height);
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function drawLayout(ctx: CanvasRenderingContext2D, plan: ExportPlan): void {
    const { width, height } = plan.layout;
    ctx.imageSmoothingEnabled=false;ctx.fillStyle=EXPORT_STYLE.paper;ctx.fillRect(0,0,width,height);
    if(plan.format==='export-frame'){ctx.strokeStyle=EXPORT_STYLE.ink;ctx.lineWidth=4;ctx.strokeRect(96,96,1808,1808);}
    plan.works.forEach((work,index)=>{
      const f=work.field,fit=fitField(f,plan.layout.fields[index]!);
      f.solvedTileColors.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(fit.x+(i%f.width)*fit.tileSize,fit.y+Math.floor(i/f.width)*fit.tileSize,fit.tileSize,fit.tileSize);});
    });
    const text=plan.layout.text;
    if(text) {
      ctx.font=EXPORT_STYLE.font;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=EXPORT_STYLE.ink;
      const measure=(s:string)=>{const m=ctx.measureText(s),left=Math.max(0,m.actualBoundingBoxLeft);return Math.ceil(Math.max(m.width,left+m.actualBoundingBoxRight));};
      const lines=measuredLines(plan.caption,text.width,plan.layout.maxLines!,measure);
      const metrics=lines.map(line=>ctx.measureText(line||'М')),ascent=Math.ceil(Math.max(0,...metrics.map(m=>m.actualBoundingBoxAscent))),descent=Math.ceil(Math.max(0,...metrics.map(m=>m.actualBoundingBoxDescent)));
      if(ascent+descent+(lines.length-1)*EXPORT_STYLE.lineHeight>text.height)throw new ExportError('TEXT_OVERFLOW','Сократите подпись.');
      lines.forEach((line,i)=>{const m=ctx.measureText(line);if(measure(line)>text.width)throw new ExportError('TEXT_OVERFLOW','Сократите подпись.');ctx.fillText(line,text.x+Math.ceil(Math.max(0,m.actualBoundingBoxLeft)),text.y+ascent+i*EXPORT_STYLE.lineHeight);});
    }
}

export async function renderExport(plan:ExportPlan):Promise<Blob> {
  const canvas=document.createElement('canvas');canvas.width=plan.layout.width;canvas.height=plan.layout.height;
  const ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});if(!ctx)throw new ExportError('UNAVAILABLE','Не удалось подготовить изображение. Попробуйте ещё раз.');
  try {
    if (plan.format === 'clean') drawGradient(ctx, plan.works[0]!.field, canvas.width, canvas.height);
    else drawLayout(ctx, plan);
    const raw=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new ExportError('UNAVAILABLE','Не удалось подготовить PNG. Проверьте свободную память.')),'image/png'));
    return await srgbPng(raw);
  } finally {canvas.width=1;canvas.height=1;}
}

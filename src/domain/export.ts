import { hasAuthorProof } from './creative';
import { chapters, getLevel } from './levels';
import { chapterCount, EXPORT_FORMATS } from './progression';
import type { LevelDefinition } from './puzzle';
import type { Workspace } from './workspace';

export type ExportFormat = 'clean' | typeof EXPORT_FORMATS[number]['id'] | 'chapter-page';
export type ExportField = Pick<LevelDefinition,'width'|'height'|'solvedTileColors'>;
export interface ExportWork { key:string; workId:string; title:string; source:string; field:ExportField }
export interface Rect { x:number; y:number; width:number; height:number }
export interface ExportLayout { width:number; height:number; fields:Rect[]; text?:Rect; maxCodePoints?:number; maxLines?:number }
export interface ExportRequest { format:ExportFormat; keys:readonly string[]; caption:string; chapterIndex?:number }
export interface ExportPlan { format:ExportFormat; layout:ExportLayout; works:ExportWork[]; caption:string }
export class ExportError extends Error {
  constructor(readonly code:'LOCKED'|'MISSING_WORKS'|'DUPLICATE_WORK'|'TEXT_OVERFLOW'|'INVALID_FIELD'|'UNAVAILABLE',message:string){super(message);}
}
const square=(x:number,y:number,size:number):Rect=>({x,y,width:size,height:size});
export const EXPORT_LAYOUTS:Readonly<Record<Exclude<ExportFormat,'clean'>,ExportLayout>>={
  'export-caption':{width:1800,height:2000,fields:[square(96,96,1608)],text:{x:96,y:1752,width:1608,height:152},maxCodePoints:80,maxLines:2},
  'export-strip':{width:2400,height:960,fields:[96,864,1632].map(x=>square(x,144,672))},
  'export-grid':{width:2000,height:2000,fields:[square(96,96,856),square(1048,96,856),square(96,1048,856),square(1048,1048,856)]},
  'export-frame':{width:2000,height:2000,fields:[square(200,200,1600)]},
  'export-diptych':{width:2400,height:1400,fields:[96,1248].map(x=>square(x,172,1056))},
  'export-postcard':{width:1800,height:2200,fields:[square(96,96,1608)],text:{x:96,y:1792,width:1608,height:312},maxCodePoints:140,maxLines:4},
  'chapter-page':{width:1800,height:3000,fields:[208,752,1296,1840,2384].flatMap(y=>[108,652,1196].map(x=>square(x,y,496))),text:{x:108,y:32,width:1584,height:128},maxCodePoints:80,maxLines:2},
};
export function eligibleExportWorks(state:Workspace):ExportWork[] {
  const works:ExportWork[]=state.completed.map(id=>{const l=getLevel(id);return{key:`campaign:${id}`,workId:`campaign:${id}`,title:l.title,source:`Кампания · ${l.ordinal}`,field:l};});
  for(const work of Object.values(state.creative?.works??{}))Object.values(work.nodes).forEach((node,index)=>{
    if(hasAuthorProof(work,node.nodeId))works.push({key:`own:${work.workId}:${node.nodeId}`,workId:`own:${work.workId}`,title:work.name,source:`Моя работа · версия ${index+1}`,field:node.field});
  });
  return works;
}
export function canExport(state:Workspace,format:ExportFormat,chapterIndex?:number):boolean {
  // A verified author victory unlocks basic clean rendering, without awarding campaign rights.
  if(format==='clean')return eligibleExportWorks(state).length>0;
  if(format==='chapter-page')return Number.isInteger(chapterIndex)&&!!chapters[chapterIndex!]&&chapterCount(state,chapterIndex!)===15;
  return state.rights.includes(format);
}
export function exportWorkCount(format:ExportFormat):number {return format==='clean'?1:EXPORT_LAYOUTS[format].fields.length;}
export function selectExportWork(keys: readonly string[], work: ExportWork, catalog: readonly ExportWork[], limit: number): string[] {
  if (keys.includes(work.key)) return keys.filter(key => key !== work.key);
  if (limit === 1) return [work.key];
  const previous = keys.findIndex(key => catalog.find(entry => entry.key === key)?.workId === work.workId);
  if (previous >= 0) return keys.map((key, index) => index === previous ? work.key : key);
  return keys.length < limit ? [...keys, work.key] : [...keys];
}
function validateExportField(field:ExportField):void {
  if(!Number.isInteger(field.width)||field.width<1||field.width>6||!Number.isInteger(field.height)||field.height<1||field.height>5||field.solvedTileColors.length!==field.width*field.height||field.solvedTileColors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new ExportError('INVALID_FIELD','Не удалось прочитать цвета работы.');
}
export function fitField(field:ExportField,region:Rect):Rect & {tileSize:number} {
  validateExportField(field);
  const tileSize=Math.floor(Math.min(region.width/field.width,region.height/field.height));
  if(tileSize<1)throw new ExportError('INVALID_FIELD','Поле не помещается в макет.');
  const width=tileSize*field.width,height=tileSize*field.height;
  return{x:region.x+Math.floor((region.width-width)/2),y:region.y+Math.floor((region.height-height)/2),width,height,tileSize};
}
export function exportPlan(state:Workspace,request:ExportRequest):ExportPlan {
  if(!canExport(state,request.format,request.chapterIndex))throw new ExportError('LOCKED','Этот макет ещё закрыт. Условие открытия указано в списке.');
  const catalog=eligibleExportWorks(state),map=new Map(catalog.map(w=>[w.key,w]));
  const keys=request.format==='chapter-page'?chapters[request.chapterIndex!]!.levelIds.map(id=>`campaign:${id}`):request.keys;
  const required=exportWorkCount(request.format),works=keys.map(key=>map.get(key));
  if(works.length>required)throw new ExportError('MISSING_WORKS',`Выберите ровно ${required} работ.`);
  if(works.length!==required||works.some(w=>!w)){const missing=required-works.filter(Boolean).length;throw new ExportError('MISSING_WORKS',`Выберите ещё ${missing} ${missing===1?'работу':missing<5?'работы':'работ'}.`);}
  const selected=works as ExportWork[];
  if(new Set(selected.map(w=>w.workId)).size!==selected.length)throw new ExportError('DUPLICATE_WORK','Выберите разные работы. Версии одной работы занимают одно место.');
  if(request.format==='clean') {
    validateExportField(selected[0]!.field);
    const width=1080,height=1920;
    return {format:'clean',layout:{width,height,fields:[{x:0,y:0,width,height}]},works:selected,caption:request.caption};
  }
  const layout=EXPORT_LAYOUTS[request.format];
  selected.forEach((w,i)=>fitField(w.field,layout.fields[i]!));
  const caption=request.format==='chapter-page'?`Глава ${request.chapterIndex!+1}`:request.caption;
  if(layout.text && [...caption].length>layout.maxCodePoints!)throw new ExportError('TEXT_OVERFLOW','Сократите подпись.');
  return{format:request.format,layout,works:selected,caption};
}
/** Font-independent line policy; the renderer supplies actual Canvas measureText widths. */
export function measuredLines(text:string,maxWidth:number,maxLines:number,measure:(s:string)=>number):string[] {
  const lines:string[]=[];
  for(const paragraph of text.replaceAll('\r\n','\n').replaceAll('\r','\n').split('\n')) {
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const token of paragraph.match(/\s+|\S+/gu)??[]) {
      if(measure(line+token)<=maxWidth){line+=token;continue;}
      if(line){lines.push(line.trimEnd());line='';}
      if(/^\s+$/u.test(token))continue;
      // A long word is split at code points only when necessary; never dropped/ellipsized.
      for(const char of token) {
        if(measure(line+char)>maxWidth){if(!line)throw new ExportError('TEXT_OVERFLOW','Сократите подпись.');lines.push(line);line='';}
        line+=char;
      }
    }
    lines.push(line.trimEnd());
  }
  if(lines.length>maxLines)throw new ExportError('TEXT_OVERFLOW','Сократите подпись.');
  return lines;
}

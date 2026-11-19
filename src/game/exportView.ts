import { canExport, eligibleExportWorks, exportPlan, exportWorkCount, selectExportWork, ExportError, EXPORT_LAYOUTS, type ExportFormat, type ExportWork } from '../domain/export';
import { EXPORT_FORMATS } from '../domain/progression';
import type { Workspace } from '../domain/workspace';
import { exportResultMessage, type ExportFiles } from '../app/exportFiles';
import { renderExport } from './exportRenderer';
import type { AlbumSelection } from './albumView';

export interface ExportRoute { kind:'export'; initialKey?:string; chapterIndex?:number; preset?:AlbumSelection }
export const isFocusedExport = (route: ExportRoute) => route.chapterIndex !== undefined || !!route.preset;
export function exportScreenTitle(route: ExportRoute): string {
  if (route.chapterIndex !== undefined) return `Страница главы ${route.chapterIndex + 1}`;
  return EXPORT_FORMATS.find(format => format.id === route.preset?.format)?.title ?? 'Другие макеты';
}
interface Props { state:Workspace; disabled:boolean; route:ExportRoute; files:ExportFiles; back():void }
export class ExportView {
  private state:Workspace;private disabled:boolean;private format:ExportFormat;private catalog:ExportWork[];
  private readonly selections=new Map<ExportFormat,string[]>();private caption='';private file:File|null=null;private url:string|null=null;
  private generation=0;private disposed=false;private sending=false;private timer:ReturnType<typeof setTimeout>|undefined;
  private message='';private authorityKey='';
  private readonly focused: boolean;
  private readonly panel=document.createElement('div');private readonly controls=document.createElement('div');private readonly status=document.createElement('p');
  private readonly content=document.createElement('div');private readonly preview=document.createElement('img');private readonly options=document.createElement('div');
  constructor(parent:HTMLElement,private readonly props:Props) {
    this.state=props.state;this.disabled=props.disabled;this.catalog=eligibleExportWorks(this.state);
    this.focused=isFocusedExport(props.route);
    this.format=props.route.preset?.format??(props.route.chapterIndex===undefined?'clean':'chapter-page');
    const first=props.route.initialKey??this.catalog[0]?.key;
    this.selections.set(this.format,props.route.preset?[...props.route.preset.keys]:first?[first]:[]);
    this.panel.className='export-panel';this.panel.dataset.focused=String(this.focused);this.controls.className='export-controls';this.status.className='export-status';this.status.setAttribute('role','status');
    this.content.className='export-content';this.options.className='export-options';this.preview.className='export-preview';this.preview.alt='Точный предпросмотр PNG';this.preview.hidden=true;
    if(this.focused) {
      const nav=document.createElement('nav');
      nav.className='export-focus-nav';
      this.button('Назад',()=>this.leave(),nav).className='quiet export-back';
      this.panel.append(nav,this.preview,this.controls,this.status);
    } else {
      this.content.append(this.options);
      this.panel.append(this.controls,this.status,this.preview,this.content);
    }
    parent.append(this.panel);this.drawOptions();this.refresh();
  }
  update(state:Workspace,disabled:boolean):void {
    this.state=state;this.disabled=disabled;this.catalog=eligibleExportWorks(state);
    const key=JSON.stringify([state.rights,this.catalog.map(w=>[w.key,w.title,w.source,w.field]),this.props.route.chapterIndex===undefined?null:state.completed]);
    if(this.authorityKey&&key!==this.authorityKey){this.drawOptions();this.refresh();}this.authorityKey=key;this.controlsState();
  }
  destroy():void{this.disposed=true;this.generation++;clearTimeout(this.timer);if(this.url)URL.revokeObjectURL(this.url);this.panel.remove();}
  leave():void{if(!this.sending)this.props.back();}
  private button(text:string,handler:()=>void,parent:HTMLElement,disabled=false):HTMLButtonElement {
    const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled||this.disabled||this.sending;b.onclick=handler;parent.append(b);return b;
  }
  private controlsState():void {
    this.controls.replaceChildren();this.status.textContent=this.message;
    this.button(this.focused?'Сохранить PNG':'Сохранить изображение',()=>void this.send('save'),this.controls,!this.file).dataset.saveImage='';
    const available=this.file?this.props.files.canShare(this.file):false;
    if(!this.focused||available) this.button('Поделиться',()=>void this.send('share'),this.controls,!this.file||!available).dataset.shareImage='';
    if(!this.focused) this.button('Назад',()=>this.leave(),this.controls).className='quiet export-back';
    const focusBack=this.panel.querySelector<HTMLButtonElement>('.export-focus-nav button');
    if(focusBack)focusBack.disabled=this.disabled||this.sending;
    this.options.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea').forEach(e=>{e.disabled=this.disabled||this.sending||e.dataset.unavailable==='true';});
    const note=this.options.querySelector<HTMLElement>('.export-share-note');if(note)note.textContent=this.file&&!available?'В этом браузере отправка файла недоступна. Сохраните PNG.':'';
  }
  private drawOptions():void {
    if(this.focused)return;
    const scroll=this.content.scrollTop;this.options.replaceChildren();
    const label=document.createElement('label');label.textContent='Макет';const select=document.createElement('select');select.setAttribute('aria-label','Макет');
    const formats:[ExportFormat,string][]=[['clean','Чистый градиент'],...EXPORT_FORMATS.map(f=>[f.id,`${f.title} · ${f.threshold} ${f.source==='campaign'?'работ кампании':'ежедневных работ'}`]as [ExportFormat,string])];
    for(const [id,title]of formats){const option=document.createElement('option');option.value=id;const open=canExport(this.state,id,this.props.route.chapterIndex);option.textContent=`${title}${open?'':' · закрыто'}`;option.disabled=!open;select.append(option);}select.value=this.format;
    select.onchange=()=>{
      this.format=select.value as ExportFormat;
      if(!this.selections.has(this.format)) {
        const first=exportWorkCount(this.format)===1?this.props.route.initialKey:undefined;
        this.selections.set(this.format,first?[first]:[]);
      }
      this.drawOptions();this.refresh();
    };label.append(select);this.options.append(label);
    if(this.format!=='chapter-page') {
      const count=exportWorkCount(this.format),keys=this.selections.get(this.format)??[],selectedWorks=keys.map(k=>this.catalog.find(w=>w.key===k)?.workId);
      const summary=document.createElement('p');summary.className='meta-note';summary.textContent=`Выбрано ${keys.length} / ${count}. Разные версии одной работы занимают одно место.`;this.options.append(summary);
      const list=document.createElement('div');list.className='export-work-list';this.options.append(list);
      for(const work of this.catalog) {
        const row=document.createElement('label');row.className='export-work';const input=document.createElement('input');input.type='checkbox';input.checked=keys.includes(work.key);input.setAttribute('aria-label',`${work.title} · ${work.source}`);input.dataset.exportKey=work.key;
        input.dataset.unavailable=String(count>1&&!input.checked&&keys.length>=count&&!selectedWorks.includes(work.workId));
        input.onchange=()=>{this.selections.set(this.format,selectExportWork(keys,work,this.catalog,count));this.drawOptions();this.refresh();};
        const title=document.createElement('span');title.textContent=work.title;const small=document.createElement('small');small.textContent=work.source;title.append(small);row.append(input,title);list.append(row);
      }
      if(!this.catalog.length){const p=document.createElement('p');p.textContent='Сначала соберите работу кампании или пройдите свою композицию.';list.append(p);}
    }
    const layout=this.format==='clean'?null:EXPORT_LAYOUTS[this.format];
    if(layout?.text&&this.format!=='chapter-page') {
      const row=document.createElement('label');row.textContent=`Подпись · до ${layout.maxCodePoints} символов`;const input=document.createElement('textarea');input.value=this.caption;input.rows=3;input.setAttribute('aria-label','Подпись');
      input.oninput=()=>{this.caption=input.value;this.refresh();};row.append(input);this.options.append(row);
    }
    const note=document.createElement('p');note.className='meta-note export-share-note';this.options.append(note);this.controlsState();this.content.scrollTop=scroll;
  }
  private refresh():void {
    clearTimeout(this.timer);const generation=++this.generation;this.file=null;this.panel.dataset.ready='false';this.preview.hidden=true;this.message='Подготавливаем PNG…';this.controlsState();
    this.timer=setTimeout(()=>void this.prepare(generation),200);
  }
  private async prepare(generation:number):Promise<void> {
    try {
      const request={format:this.format,keys:this.selections.get(this.format)??[],caption:this.caption,...(this.props.route.chapterIndex===undefined?{}:{chapterIndex:this.props.route.chapterIndex})};
      const plan=exportPlan(this.state,request),blob=await renderExport(plan);if(this.disposed||generation!==this.generation)return;
      const file=new File([blob],`Poluson-${this.format}.png`,{type:'image/png'});if(this.url)URL.revokeObjectURL(this.url);this.url=URL.createObjectURL(file);this.preview.src=this.url;this.preview.hidden=false;this.file=file;
      this.message=this.focused?'':`PNG готов · ${plan.layout.width} × ${plan.layout.height} пикселей`;this.panel.dataset.ready='true';
    }catch(error){if(this.disposed||generation!==this.generation)return;this.message=error instanceof ExportError?error.message:'Не удалось подготовить PNG. Попробуйте другой макет или повторите выбор.';this.panel.dataset.ready='false';}
    this.controlsState();
  }
  private async send(kind:'save'|'share'):Promise<void> {
    if(!this.file||this.disabled||this.sending)return;
    this.sending=true;this.message=kind==='save'?'Сохраняем изображение…':'Открываем отправку…';this.controlsState();
    try {
      // No preparation/network await before invoking browser share/file picker.
      const pending=this.props.files[kind](this.file),result=await pending;
      if(!this.disposed)this.message=exportResultMessage(result);
    }catch{if(!this.disposed)this.message=kind==='save'?'Не удалось сохранить изображение. Проверьте доступ и свободное место; можно повторить.':'Не удалось открыть отправку. Изображение осталось здесь; его можно сохранить.';}
    finally{this.sending=false;if(!this.disposed)this.controlsState();}
  }
}

import { anotherStart, defaultPins, FIELD_MESSAGES, inspectField, makeField, normalizedCorners, validName, type EditorField } from '../domain/editor';
import { authorBests, hasAuthorProof, type CreativeAction, type CreativeWork } from '../domain/creative';

interface EditorProps {
  work:CreativeWork; disabled:boolean;
  pending:boolean; recover():Promise<boolean>;
  commit(action:CreativeAction):Promise<boolean>;
  play(workId:string,nodeId:string):void;
  exportWork(workId:string,nodeId:string):void;
  back():void;
}
/** Owns the live form, not durable authority. Re-rendering busy/host state never destroys input. */
export class EditorView {
  private work:CreativeWork; private disabled:boolean; private field:EditorField; private seed:number; private baseNodeId:string;
  private editId:string; private dirty=false; private nameDirty=false; private disposed=false; private timer:ReturnType<typeof setTimeout>|undefined;
  private recoveredEditId:string|undefined;
  private queue:Promise<boolean>=Promise.resolve(true); private sequence=0; private savedSequence=0;
  private pending=false; private failedAction:CreativeAction|null=null;
  private exitPrompt=false;
  private mode:'palette'|'pins'|'start'|'history'='palette';
  private message='Сохранено на устройстве';
  private readonly panel=document.createElement('div'); private readonly controls=document.createElement('div');
  private readonly content=document.createElement('div'); private readonly status=document.createElement('p');
  private readonly name=document.createElement('input');
  constructor(parent:HTMLElement,private readonly props:EditorProps) {
    this.work=props.work;this.disabled=props.disabled;
    const buffer=Object.values(this.work.buffers).at(-1),node=this.work.nodes[this.work.headNodeId]!;
    this.baseNodeId=buffer?.baseNodeId??node.nodeId;this.field=buffer?.field??node.field;this.seed=buffer?.seed??node.seed;
    this.editId=crypto.randomUUID();this.recoveredEditId=buffer?.editId;this.dirty=!!buffer;
    if(buffer)this.message='Восстановлен сохранённый предпросмотр. Примените или отмените изменения.';
    this.panel.className='editor-panel';this.controls.className='editor-controls';this.content.className='editor-content';
    this.status.className='editor-status';this.status.setAttribute('role','status');
    const label=document.createElement('label');label.className='editor-name';label.textContent='Название';
    this.name.type='text';this.name.value=this.work.name;this.name.setAttribute('aria-label','Название работы');
    this.name.oninput=()=>{this.nameDirty=true;this.schedule();};label.append(this.name);
    this.panel.append(this.controls,this.status,label,this.content);parent.append(this.panel);this.draw();
  }
  update(work:CreativeWork,disabled:boolean,pending=false):void { this.work=work;this.disabled=disabled;this.pending=pending;this.name.disabled=disabled||pending;this.drawControls(); }
  destroy():void { this.disposed=true;clearTimeout(this.timer);this.panel.remove(); }
  private button(text:string,action:()=>void,parent:HTMLElement,disabled=false):HTMLButtonElement {
    const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.ineligible=String(disabled);b.disabled=this.disabled||disabled;b.onclick=action;parent.append(b);return b;
  }
  private drawControls():void {
    this.controls.replaceChildren();const check=inspectField(this.field);
    if(this.pending) {
      const retry=this.button('Повторить сохранение',()=>void this.retry(),this.controls);retry.disabled=this.disabled;
      this.message='Не удалось подтвердить запись. Форма сохранена здесь. Повторите проверку.';
    } else if(this.exitPrompt) {
      this.button('Остаться',()=>{this.exitPrompt=false;this.drawControls();},this.controls);
      this.button('Выйти без этих изменений',this.props.back,this.controls);
    } else if(this.dirty) {
      this.button('Применить',()=>void this.apply(),this.controls).dataset.editorApply='';
      this.button('Отмена',()=>void this.cancel(),this.controls).dataset.editorCancel='';
    } else {
      this.button('Пройти',()=>void this.play(),this.controls,!!check.errors.length).dataset.authorPlay='';
      this.button('Назад',()=>void this.leave(),this.controls);
    }
    this.status.textContent=this.message;
    this.panel.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select').forEach(e=>{e.disabled=this.disabled||this.pending||e.dataset.unused==='true';});
    this.content.querySelectorAll<HTMLButtonElement>('button').forEach(e=>{e.disabled=this.disabled||this.pending||e.dataset.ineligible==='true';});
  }
  private draw():void {
    this.content.replaceChildren();this.drawControls();
    const tabs=document.createElement('div');tabs.className='editor-tabs';this.content.append(tabs);
    for(const [id,label]of [['palette','Цвета'],['pins','Закрепления'],['start','Старт'],['history','История']]as const) {
      const b=this.button(label,()=>{this.mode=id;this.draw();},tabs);b.setAttribute('aria-pressed',String(this.mode===id));
    }
    if(this.mode==='history') {this.history();return;}
    const wrap=document.createElement('div');wrap.className='editor-board-scroll';const grid=document.createElement('div');grid.className='editor-grid';grid.style.setProperty('--columns',String(this.field.width));grid.style.setProperty('--rows',String(this.field.height));wrap.append(grid);this.content.append(wrap);
    this.field.solvedTileColors.forEach((_,i)=>{
      const tile=this.mode==='start'?this.field.startTileAtPosition[i]!:i,color=this.field.solvedTileColors[tile]!;
      const cell=document.createElement(this.mode==='pins'?'button':'div');cell.style.backgroundColor=color;cell.className='editor-cell';
      cell.setAttribute('aria-label',`Плитка ${i+1}${this.field.pinnedPositions.includes(i)?', закреплена':''}`);
      if(this.mode==='pins') {(cell as HTMLButtonElement).type='button';(cell as HTMLButtonElement).disabled=this.disabled;cell.onclick=()=>{const pins=this.field.pinnedPositions.includes(i)?this.field.pinnedPositions.filter(p=>p!==i):[...this.field.pinnedPositions,i];this.change(makeField(this.field.width,this.field.height,this.field.cornerColorsTLTRBLBR,pins,this.seed));};}
      if(this.field.pinnedPositions.includes(i)){const marker=document.createElement('span');marker.className='editor-pin';marker.textContent='●';marker.setAttribute('aria-hidden','true');cell.append(marker);}
      grid.append(cell);
    });
    if(this.mode==='palette') {
      const sizes=document.createElement('div');sizes.className='editor-sizes';this.content.append(sizes);
      for(const [key,label,max]of [['width','Столбцы',6],['height','Строки',5]]as const) {
        const row=document.createElement('label');row.textContent=label;const select=document.createElement('select');select.setAttribute('aria-label',label);select.disabled=this.disabled;
        for(let n=1;n<=max;n++){const option=document.createElement('option');option.value=String(n);option.textContent=String(n);select.append(option);}select.value=String(this.field[key]);
        select.onchange=()=>{const width=key==='width'?Number(select.value):this.field.width,height=key==='height'?Number(select.value):this.field.height;this.change(makeField(width,height,this.field.cornerColorsTLTRBLBR,defaultPins(width,height),this.seed));};row.append(select);sizes.append(row);
      }
      const palette=document.createElement('div');palette.className='editor-palette';this.content.append(palette);
      ['Слева вверху','Справа вверху','Слева внизу','Справа внизу'].forEach((label,index)=>{
        const row=document.createElement('label');row.textContent=label;const input=document.createElement('input');input.type='color';input.value=this.field.cornerColorsTLTRBLBR[index]!;input.setAttribute('aria-label',label);
        const unused=(this.field.width===1&&(index===1||index===3))||(this.field.height===1&&index>=2);input.dataset.unused=String(unused);input.disabled=this.disabled||unused;
        input.oninput=()=>{const corners=[...this.field.cornerColorsTLTRBLBR];corners[index]=input.value.toUpperCase();this.field={...this.field,cornerColorsTLTRBLBR:normalizedCorners(this.field.width,this.field.height,corners),solvedTileColors:makeField(this.field.width,this.field.height,corners,this.field.pinnedPositions,this.seed).solvedTileColors};this.changed();this.refreshGrid();};
        row.append(input);palette.append(row);
      });
      this.note('Размер и цвета — предпросмотр. «Применить» создаст одну версию; «Отмена» вернёт прежнюю. При изменении размера закрепления сбрасываются к углам или концам линии.');
    } else if(this.mode==='pins') this.note('Нажимайте на плитки, чтобы закрепить или освободить их. Этот режим не меняет плитки местами.');
    else {this.note('Это фиксированное начало авторской проверки. Повторное прохождение начнётся с той же расстановки.');const unique=this.field.width*this.field.height-this.field.pinnedPositions.length<3;this.button('Другое начало',()=>{const next=anotherStart(this.field,this.seed);if(next){this.seed=next.seed;this.change({...this.field,startTileAtPosition:next.start});}},this.content,unique);if(unique)this.note('Для двух подвижных плиток существует только одно несобранное начало.');}
    this.validation();
  }
  private refreshGrid():void {
    this.content.querySelectorAll<HTMLElement>('.editor-cell').forEach((cell,i)=>{cell.style.backgroundColor=this.field.solvedTileColors[this.mode==='start'?this.field.startTileAtPosition[i]!:i]!;});
    this.content.querySelector('.editor-validation')?.remove();this.validation();this.drawControls();
  }
  private note(text:string):void {const p=document.createElement('p');p.className='meta-note';p.textContent=text;this.content.append(p);}
  private validation():void {
    const check=inspectField(this.field),box=document.createElement('div');box.className='editor-validation';box.dataset.valid=String(!check.errors.length);
    const lines=check.errors.length?check.errors:check.warnings;
    for(const key of lines){const p=document.createElement('p');p.textContent=FIELD_MESSAGES[key]??key;box.append(p);}
    if(!lines.length)box.textContent=this.dirty?'Поле пригодно для проверки после применения.':hasAuthorProof(this.work,this.baseNodeId)?'Эта игровая версия пройдена автором.':'Поле пригодно для авторской проверки.';
    if(!this.dirty && hasAuthorProof(this.work,this.baseNodeId)) {const best=authorBests(this.work,this.baseNodeId),p=document.createElement('p');p.textContent=`Без помощи: ${best.clean??'нет результата'} · с помощью: ${best.assisted??'нет результата'}`;box.append(p);this.button('Экспорт этой версии',()=>void(async()=>{if(await this.flush())this.props.exportWork(this.work.workId,this.baseNodeId);})(),box);}
    this.content.append(box);
  }
  private change(field:EditorField):void {this.field=field;this.changed();this.draw();}
  private changed():void {this.dirty=true;this.sequence++;this.message='Изменения ещё не сохранены';this.schedule();}
  private schedule():void {clearTimeout(this.timer);this.message='Изменения ещё не сохранены';this.status.textContent=this.message;this.timer=setTimeout(()=>void this.flush(),400);}
  private enqueue(action:CreativeAction):Promise<boolean> {
    const task=this.queue.then(async()=>{if(this.disposed)return false;let success=false;try{success=await this.props.commit(action);}catch{}this.failedAction=success?null:action;return success;});
    this.queue=task;return task;
  }
  async flush():Promise<boolean> {
    clearTimeout(this.timer);
    if(this.nameDirty) {
      let name:string;try{name=validName(this.name.value);}catch(e){this.message=(e as Error).message;this.drawControls();return false;}
      const original=this.name.value;
      if(!await this.enqueue({kind:'editor-rename',workId:this.work.workId,name})){this.message='Название не сохранено. Повторите действие.';this.drawControls();return false;}
      if(this.name.value===original){this.nameDirty=false;this.name.value=name;}
    }
    const seq=this.sequence;
    if(this.dirty&&seq>this.savedSequence) {
      const buffer={editId:this.editId,baseNodeId:this.baseNodeId,field:this.field,seed:this.seed};
      if(!await this.enqueue({kind:'editor-buffer',workId:this.work.workId,buffer})){this.message='Предпросмотр не сохранён. Ваш вариант остаётся здесь; повторите действие.';this.drawControls();return false;}
      this.savedSequence=seq;
    }
    this.message=this.dirty?'Предпросмотр сохранён на устройстве · ещё не применён':'Сохранено на устройстве';this.drawControls();return true;
  }
  private adopt(nodeId:string):void {const node=this.work.nodes[nodeId]!;this.baseNodeId=nodeId;this.field=node.field;this.seed=node.seed;this.editId=crypto.randomUUID();this.recoveredEditId=undefined;this.dirty=false;this.sequence=0;this.savedSequence=0;this.draw();}
  private async apply():Promise<void> {
    if(!await this.flush())return;
    const nodeId=crypto.randomUUID();
    if(!await this.enqueue({kind:'editor-apply',workId:this.work.workId,nodeId,baseNodeId:this.baseNodeId,editId:this.editId,...(this.recoveredEditId?{...(this.recoveredEditId?{recoveredEditId:this.recoveredEditId}:{})}:{}),field:this.field,seed:this.seed})){this.message='Версия не сохранена. Повторите: ваш вариант станет отдельной веткой, если работа изменилась.';this.drawControls();return;}
    const saved=this.work.nodes[nodeId];
    this.message=saved&&this.work.headNodeId!==nodeId?'Сохранена отдельная ветка. Откройте её в истории.':'Версия сохранена на устройстве';
    this.adopt(saved?.nodeId??this.baseNodeId);
  }
  private async cancel():Promise<void> {
    clearTimeout(this.timer);await this.queue;
    if(this.nameDirty&&!await this.flush())return;
    if((this.work.buffers[this.editId]||(this.recoveredEditId&&this.work.buffers[this.recoveredEditId]))&&!await this.enqueue({kind:'editor-discard',workId:this.work.workId,editId:this.editId,...(this.recoveredEditId?{recoveredEditId:this.recoveredEditId}:{})})){this.message='Отмена не сохранена. Повторите действие.';this.drawControls();return;}
    this.message='Изменения отменены';this.adopt(this.baseNodeId);
  }
  private async play():Promise<void> {if(await this.flush())this.props.play(this.work.workId,this.baseNodeId);}
  async leave():Promise<void> {if(this.pending)return;if(await this.flush())this.props.back();else if(!this.pending){this.exitPrompt=true;this.drawControls();}}
  private async retry():Promise<void> {
    const action=this.failedAction;if(!await this.props.recover())return;
    this.failedAction=null;
    if(action?.kind==='editor-apply'){this.message='Версия сохранена на устройстве';this.adopt(this.work.nodes[action.nodeId]?action.nodeId:this.work.headNodeId);}
    else if(action?.kind==='editor-discard'){this.message='Изменения отменены';this.adopt(this.baseNodeId);}
    else {this.message=this.dirty?'Предпросмотр сохранён на устройстве · ещё не применён':'Сохранено на устройстве';if(action?.kind==='editor-buffer')this.savedSequence=this.sequence;if(action?.kind==='editor-rename')this.nameDirty=false;this.drawControls();}
  }
  private history():void {
    this.note('Старые версии и ответвления сохраняются. Проверка относится к точному полю, закреплениям и старту; переименование её сохраняет.');
    const parents=new Set(Object.values(this.work.nodes).flatMap(n=>n.parentNodeIds));
    Object.values(this.work.nodes).forEach((node,index)=>{
      const p=document.createElement('p');p.className='meta-note';p.textContent=`Версия ${index+1} · ${node.field.width}×${node.field.height}${node.nodeId===this.work.headNodeId?' · текущая':!parents.has(node.nodeId)?' · ветка':''}${hasAuthorProof(this.work,node.nodeId)?' · пройдена автором':' · не проверена'}`;this.content.append(p);
      this.button(`Открыть версию ${index+1}`,()=>void(async()=>{if(!await this.flush())return;if(await this.enqueue({kind:'editor-select',workId:this.work.workId,nodeId:node.nodeId})){this.message='Открыта сохранённая версия';this.adopt(node.nodeId);}})(),this.content);
    });
    Object.values(this.work.buffers).forEach((buffer,index)=>this.button(`Продолжить предпросмотр ${index+1}`,()=>{this.baseNodeId=buffer.baseNodeId;this.field=buffer.field;this.seed=buffer.seed;this.editId=crypto.randomUUID();this.recoveredEditId=buffer.editId;this.dirty=true;this.sequence=0;this.savedSequence=0;this.message='Восстановлен сохранённый предпросмотр';this.mode='palette';this.draw();},this.content));
  }
}

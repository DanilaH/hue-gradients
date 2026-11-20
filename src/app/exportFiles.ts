import type { WallpaperSize } from '../domain/export';

export type ExportResult='saved'|'download-requested'|'shared'|'opened'|'cancelled'|'wallpaper-returned'|'wallpaper-unavailable';
export interface ExportFiles {
  screenSize(): Promise<WallpaperSize>;
  canShare(file: File): boolean;
  save(file: File): Promise<ExportResult>;
  share(file: File): Promise<ExportResult>;
  setWallpaper?(file: File): Promise<ExportResult>;
  destroy?(): void;
}
interface WritableFile { write(data:Blob):Promise<void>; close():Promise<void>; abort?():Promise<void> }
interface SaveWindow extends Window { showSaveFilePicker?: (options:unknown)=>Promise<{createWritable():Promise<WritableFile>}> }

export function browserExportFiles():ExportFiles {
  const urls=new Set<string>(),timers=new Set<ReturnType<typeof setTimeout>>();
  return {
    async screenSize() {
      return {
        width: Math.round(window.screen.width * window.devicePixelRatio),
        height: Math.round(window.screen.height * window.devicePixelRatio),
      };
    },
    canShare:file=>{try{return typeof navigator.share==='function' && typeof navigator.canShare==='function' && navigator.canShare({files:[file]});}catch{return false;}},
    async save(file) {
      const picker=(window as SaveWindow).showSaveFilePicker;
      try {
        if(picker && window.self===window.top) {
          // Invoke the picker while the explicit click's transient activation still exists.
          const handle=await picker.call(window,{suggestedName:file.name,types:[{description:'PNG',accept:{'image/png':['.png']}}]});
          const writer=await handle.createWritable();
          try{await writer.write(file);await writer.close();}catch(error){await writer.abort?.().catch(()=>{});throw error;}
          return 'saved';
        }
        const url=URL.createObjectURL(file);urls.add(url);const a=document.createElement('a');a.href=url;a.download=file.name;a.hidden=true;document.body.append(a);
        try{a.click();}finally{a.remove();}
        const timer=setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);timers.delete(timer);},60000);timers.add(timer);
        // The browser exposes no receipt for a download's eventual OS write.
        return 'download-requested';
      } catch(error) {if(error instanceof DOMException && error.name==='AbortError')return 'cancelled';throw error;}
    },
    async share(file) {
      if(typeof navigator.share!=='function'||!navigator.canShare?.({files:[file]}))throw new Error('FILE_SHARE_UNAVAILABLE');
      try {await navigator.share({files:[file],title:'Полусон'});return 'shared';}
      catch(error){if(error instanceof DOMException && error.name==='AbortError')return 'cancelled';throw error;}
    },
    destroy(){for(const url of urls)URL.revokeObjectURL(url);for(const timer of timers)clearTimeout(timer);urls.clear();timers.clear();},
  };
}
export function exportResultMessage(result:ExportResult):string {
  return {saved:'Изображение сохранено.', 'download-requested':'Загрузка PNG запрошена. Проверьте папку загрузок.',shared:'Изображение передано выбранному приложению.',opened:'Открыто окно отправки. Публикация зависит от выбранного приложения.',cancelled:'Действие отменено. Изображение осталось здесь.',
    'wallpaper-returned':'Вы вернулись из системного окна обоев.', 'wallpaper-unavailable':'Установка обоев через систему недоступна. Можно сохранить PNG.'}[result];
}

import { registerPlugin } from '@capacitor/core';
import type { ExportFiles, ExportResult } from './exportFiles';
interface ExportBridge { save(options:{base64:string;filename:string}):Promise<{status:ExportResult}>; share(options:{base64:string;filename:string}):Promise<{status:ExportResult}> }
const bridge=registerPlugin<ExportBridge>('HueExport');
const encoded=(file:File):Promise<string>=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]!);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
export const nativeExportFiles:ExportFiles={
  canShare:()=>true,
  async save(file){return(await bridge.save({base64:await encoded(file),filename:file.name})).status;},
  async share(file){return(await bridge.share({base64:await encoded(file),filename:file.name})).status;},
};

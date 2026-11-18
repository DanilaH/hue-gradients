import { JsonStorageRepository,type StorageAdapter } from '@danilah/mini-games-kit/platform';
export interface CounterState {version:1;taps:number}
export function decodeCounter(value:unknown):CounterState{
  if(!value||typeof value!=='object'||!('version'in value)||value.version!==1||!('taps'in value)||!Number.isSafeInteger(value.taps)||Number(value.taps)<0)throw Error('Invalid saved sample counter');
  return {version:1,taps:Number(value.taps)};
}
export const counterRepository=(storage:StorageAdapter)=>new JsonStorageRepository<CounterState>({storage,key:'bootstrap.counter.v1',createDefault:()=>({version:1,taps:0}),codec:{decode:decodeCounter}});

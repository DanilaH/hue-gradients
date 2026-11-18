import { Capacitor, registerPlugin } from '@capacitor/core';
import { WebStorageAdapter, type StorageAdapter } from '@danilah/mini-games-kit/platform';
interface NativeStorage {
  get(options:{key:string}):Promise<{value:string|null}>;
  set(options:{key:string;value:string}):Promise<void>;
  remove(options:{key:string}):Promise<void>;
  list(options:{prefix:string}):Promise<{keys:string[]}>;
}
const nativeStorage=registerPlugin<NativeStorage>('GameStorage');
export function createStorage():StorageAdapter {
  if(!Capacitor.isNativePlatform())return new WebStorageAdapter(localStorage);
  return {getItem:async key=>(await nativeStorage.get({key})).value,setItem:(key,value)=>nativeStorage.set({key,value}),removeItem:key=>nativeStorage.remove({key})};
}

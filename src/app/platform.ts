import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { GameplayActivityCoordinator,installDocumentVisibilityBlocker } from '@danilah/mini-games-kit/platform';
import { installNativeLifecycle } from './nativeLifecycle';
export function createPlatform(onBack:()=>boolean=()=>false){
  const activity=new GameplayActivityCoordinator(()=>{},()=>{});
  const visible=installDocumentVisibilityBlocker(activity),native=Capacitor.isNativePlatform();
  document.documentElement.dataset.host=native?'android':'browser';
  const removeNative=native?installNativeLifecycle(activity,App,()=>{if(!onBack())void App.minimizeApp().catch(console.warn);}):()=>{};
  const blur=()=>activity.setBlocked('window-blur',true),focus=()=>activity.setBlocked('window-blur',false);
  if(!native){window.addEventListener('blur',blur);window.addEventListener('focus',focus);}
  return {activity,destroy(){activity.setGameplayDesired(false);visible();removeNative();window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);}};
}

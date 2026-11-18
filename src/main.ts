import Phaser from 'phaser';
import { getRenderPixelRatio } from '@danilah/mini-games-kit/core';
import { destroyRenderer } from '@danilah/mini-games-kit/phaser';
import { StartupTimeline } from '@danilah/mini-games-kit/startup';
import { createPlatform } from './app/platform';
import { createStorage } from './app/storage';
import { counterRepository,type CounterState } from './app/counter';
import { BootstrapScene,PRESENTABLE } from './game/BootstrapScene';
import './style.css';
const startup=new StartupTimeline<'hostReady'|'storageReady'|'firstFrame'|'ready'>();
const cover=document.querySelector<HTMLElement>('#startup')!,counter=document.querySelector<HTMLElement>('#counter')!,status=document.querySelector<HTMLElement>('#status')!,button=document.querySelector<HTMLButtonElement>('#demo-action')!,root=document.querySelector<HTMLElement>('#game-root')!;
let alive=true,pending=false,ready=false,removeDebug=()=>{},destroyPlatform=()=>{};
try{
  const platform=createPlatform();destroyPlatform=()=>platform.destroy();startup.mark('hostReady');
  const repository=counterRepository(createStorage());
  let state:CounterState=await repository.load();startup.mark('storageReady');
  let resolveFrame!:()=>void;const frame=new Promise<void>(resolve=>{resolveFrame=resolve;});
  const size=()=>{const r=root.getBoundingClientRect(),dpr=getRenderPixelRatio();return {cssWidth:Math.max(1,r.width),cssHeight:Math.max(1,r.height),dpr};};
  const initial=size();
  const game=new Phaser.Game({type:Phaser.AUTO,parent:root,width:Math.round(initial.cssWidth*initial.dpr),height:Math.round(initial.cssHeight*initial.dpr),backgroundColor:'#f4f6fa',scale:{mode:Phaser.Scale.NONE},scene:[BootstrapScene],callbacks:{preBoot:g=>g.events.once(PRESENTABLE,resolveFrame),postBoot:g=>{const s=size();g.canvas.style.width=`${s.cssWidth}px`;g.canvas.style.height=`${s.cssHeight}px`;}}});
  let paintPending=false;
  const paint=()=>{if(!game.isBooted||paintPending||platform.activity.isBlocked())return;paintPending=true;game.events.once(Phaser.Core.Events.POST_RENDER,()=>{paintPending=false;game.loop.sleep();});game.loop.wake();};
  const resize=()=>{if(!game.isBooted)return;const s=size();game.canvas.style.width=`${s.cssWidth}px`;game.canvas.style.height=`${s.cssHeight}px`;const w=Math.round(s.cssWidth*s.dpr),h=Math.round(s.cssHeight*s.dpr);if(game.scale.width!==w||game.scale.height!==h)game.scale.resize(w,h);paint();};
  const sync=()=>{counter.textContent=`Saved taps: ${state.taps}`;button.disabled=!ready||pending||platform.activity.isBlocked();document.documentElement.dataset.blocked=String(platform.activity.isBlocked());};
  const blocked=platform.activity.onBlockedChange(value=>{game.sound.mute=value;game.input.enabled=!value;if(value&&game.isBooted)game.loop.sleep();else {resize();paint();}sync();});
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);observer?.observe(root);window.addEventListener('resize',resize);
  const click=async()=>{if(button.disabled)return;pending=true;sync();try{const next:CounterState={version:1,taps:state.taps+1};decodeSafe(next.taps);await repository.write(next);state=next;status.textContent='';}catch{status.textContent='Could not save. Your last saved value is preserved.';}finally{pending=false;if(alive){sync();paint();}}};
  button.addEventListener('click',click);
  await frame;startup.mark('firstFrame');game.loop.sleep();
  cover.hidden=true;for(let i=0;i<2;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  ready=true;startup.mark('ready');document.documentElement.dataset.state='ready';platform.activity.setGameplayDesired(true);sync();
  if(import.meta.env.DEV){const {installDebug}=await import('./app/debug');if(alive)removeDebug=installDebug(()=>startup.snapshot({toReady:['start','ready'],toFrame:['start','firstFrame']}));}
  const destroy=(event:PageTransitionEvent)=>{if(event.persisted)return;alive=false;window.removeEventListener('pagehide',destroy);button.removeEventListener('click',click);window.removeEventListener('resize',resize);observer?.disconnect();blocked();removeDebug();platform.destroy();destroyRenderer(game);};window.addEventListener('pagehide',destroy);
}catch(error){destroyPlatform();cover.hidden=false;cover.textContent='Startup failed. Existing saved data has been preserved.';console.error('Bootstrap startup failed',error);}
function decodeSafe(value:number):void{if(!Number.isSafeInteger(value))throw Error('Counter overflow');}

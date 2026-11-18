import { copyOrExposeText } from '@danilah/mini-games-kit/startup';
export function installDebug(get:()=>unknown):()=>void {
  const root=document.createElement('aside');root.dataset.debugPanel='true';const button=document.createElement('button');button.textContent='Copy startup JSON';root.append(button);document.body.append(root);
  const click=()=>{void copyOrExposeText(JSON.stringify(get()),{container:root,ariaLabel:'Startup diagnostics JSON'});};button.addEventListener('click',click);
  return ()=>{button.removeEventListener('click',click);root.remove();};
}

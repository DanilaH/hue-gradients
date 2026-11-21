import Phaser from 'phaser';
export const PRESENTABLE='bootstrap:presentable';
export class BootstrapScene extends Phaser.Scene {
  private art!:Phaser.GameObjects.Graphics;
  create():void{this.art=this.add.graphics();this.paint();this.scale.on('resize',this.paint,this);this.events.once('shutdown',()=>this.scale.off('resize',this.paint,this));this.game.events.once(Phaser.Core.Events.POST_RENDER,()=>this.game.events.emit(PRESENTABLE));}
  paint():void{const w=this.scale.width,h=this.scale.height,r=Math.min(w,h)*.22;this.art.clear().fillStyle(0x355dda).fillCircle(w/2,h/2,r).lineStyle(Math.max(2,r*.08),0xffffff).strokeCircle(w/2,h/2,r*.55);}
}

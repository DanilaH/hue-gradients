import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({
  base:'./',build:{target:'es2022',sourcemap:false},resolve:{dedupe:['phaser']},
  plugins:[{name:'android-build-channel',generateBundle(){this.emitFile({type:'asset',fileName:'native-build.json',source:JSON.stringify({schema:1,kitRef:'469928d03f4bae5053e23db26e82187bedbc252e',channel:mode==='release'?'release':'playtest'})});}}],
}));

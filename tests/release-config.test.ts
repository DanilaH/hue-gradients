import {expect,it} from 'vitest';
// @ts-expect-error Node-only build helper.
import {releaseConfigProblems} from '../tools/release-config.mjs';
it('fails closed using names-only diagnostics and a public signer pin',()=>{
 const config={certificateSha256:'a'.repeat(64),appId:'com.example.sample',versionCode:1,versionName:'0.1.0'},env={ANDROID_RELEASE_KEYSTORE:'/private/key',ANDROID_RELEASE_STORE_PASSWORD:'store-secret',ANDROID_RELEASE_KEY_ALIAS:'alias-secret',ANDROID_RELEASE_KEY_PASSWORD:'key-secret'};
 expect(releaseConfigProblems(config,env,()=>true)).toEqual({missing:[],invalid:[]});
 expect(releaseConfigProblems({...config,certificateSha256:null},env,()=>true).invalid).toContain('android-project.json.certificateSha256');
 const problems=releaseConfigProblems(config,{...env,ANDROID_RELEASE_STORE_PASSWORD:''},()=>false);
 expect(problems.missing).toEqual(['ANDROID_RELEASE_STORE_PASSWORD']);expect(problems.invalid).toContain('ANDROID_RELEASE_KEYSTORE');expect(JSON.stringify(problems)).not.toContain('secret');
});

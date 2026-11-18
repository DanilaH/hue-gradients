import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function releaseConfigProblems(config,env,hasFile=existsSync){
  const required=['ANDROID_RELEASE_KEYSTORE','ANDROID_RELEASE_STORE_PASSWORD','ANDROID_RELEASE_KEY_ALIAS','ANDROID_RELEASE_KEY_PASSWORD'];
  const missing=required.filter(name=>typeof env[name]!=='string'||!env[name].trim()),invalid=[];
  if(!/^[0-9a-f]{64}$/i.test(config.certificateSha256??''))invalid.push('android-project.json.certificateSha256');
  if(!Number.isSafeInteger(config.versionCode)||config.versionCode<1)invalid.push('android-project.json.versionCode');
  if(typeof config.versionName!=='string'||!config.versionName.trim())invalid.push('android-project.json.versionName');
  if(typeof config.appId!=='string'||!/^([a-z][a-z0-9_]*\.)+[a-z][a-z0-9_]*$/.test(config.appId))invalid.push('android-project.json.appId');
  if(env.ANDROID_RELEASE_KEYSTORE&&!hasFile(env.ANDROID_RELEASE_KEYSTORE))invalid.push('ANDROID_RELEASE_KEYSTORE');
  return {missing,invalid};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const result=releaseConfigProblems(JSON.parse(readFileSync('android-project.json','utf8')),process.env);if(result.missing.length||result.invalid.length){console.error(JSON.stringify({releaseConfiguration:'BLOCKED',...result}));process.exitCode=1;}else console.info('Signing configuration shape OK; actual APK certificate verification is mandatory.');}
  catch{console.error('Could not validate android-project.json');process.exitCode=1;}
}

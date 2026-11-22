import {readFile,readdir} from 'node:fs/promises';
const release=process.argv.includes('--release'),config=JSON.parse(await readFile('android-project.json','utf8'));
const stamp=JSON.parse(await readFile('dist/native-build.json','utf8'));
if(stamp.channel!==(release?'release':'playtest'))throw Error('Wrong web build channel');
async function walk(dir){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const files=await walk('dist');
for(const path of files){
 if(release&&config.releaseExcludedPaths.includes(path.slice(5)))throw Error('Excluded path in web payload');
 if(release&&/\.(html|js)$/.test(path))for(const marker of config.releaseExcludedMarkers)if((await readFile(path,'utf8')).includes(marker))throw Error('Debug/laboratory marker in production web');
}
console.info('Built web channel and debug/laboratory exclusions verified.');

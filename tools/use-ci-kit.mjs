// CI checks out the PRIVATE kit at the declared SHA, packs it, then uses those
// exact bytes without teaching npm a persistent GitHub credential.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const [archive,source]=process.argv.slice(2),pkg=JSON.parse(await readFile('package.json','utf8'));
const pin=pkg.dependencies['@danilah/mini-games-kit'].match(/#([a-f0-9]{40})$/)?.[1];
if(!pin||source!==pin)throw Error('CI kit checkout does not match the declared runtime pin');
if(!(await stat(archive)).isFile())throw Error('Packed CI kit is missing');
pkg.dependencies['@danilah/mini-games-kit']='file:'+resolve(archive);await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
console.info('Using the exact pinned kit archive for this CI working copy; committed dependency remains unchanged.');

import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const source=path.resolve(process.argv[2]??'C:/proj/trakt_sudeb_3d');
const base=(process.argv[3]??'https://andreyvoytov-trakt-sudeb-3d.pages.dev').replace(/\/$/,'');
const deploymentUrl=process.argv[4]??base;
const {perspectiveRoadAssets}=await import(pathToFileURL(path.join(source,'app/game/perspectiveRoadModel.ts')));
const {roadShellAssets,combatArtAssets}=await import(pathToFileURL(path.join(source,'app/game/assetLoader.ts')));
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[],paths=new Set([...roadShellAssets,...combatArtAssets,...['meadow','forest','marsh','ash','alpine'].flatMap(perspectiveRoadAssets)]);
const download=async route=>{
 const response=await fetch(base+route,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`${route}: HTTP ${response.status}`);
 return Buffer.from(await response.arrayBuffer());
};
for(const route of ['/','/editor/']){
 const html=(await download(route)).toString(),local=await fs.readFile(path.join(source,'out',route==='/'?'index.html':'editor/index.html'),'utf8');
 const references=text=>[...text.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^\"]+\.(?:js|css)(?:\?[^\"]*)?)"/g)].map(m=>m[1]).filter(url=>url.startsWith('/_next/'));
 const remoteRefs=references(html),localRefs=references(local);
 if(JSON.stringify(remoteRefs)!==JSON.stringify(localRefs))throw Error(`Production build references differ: ${route}`);
 for(const file of remoteRefs)paths.add(file);
 checks.push({path:route,status:200,matchingBuildReferences:true});
}
const all=[...paths];
for(let offset=0;offset<all.length;offset+=6){
 const batch=await Promise.allSettled(all.slice(offset,offset+6).map(async route=>{
  const [remote,local]=await Promise.all([download(route),fs.readFile(path.join(source,'out',route))]);
  if(!remote.equals(local))throw Error(`Production bytes differ: ${route}`);
  return{path:route,status:200,bytes:remote.length,sha256:sha(remote)};
 }));
 for(const result of batch){if(result.status==='rejected')throw result.reason;checks.push(result.value);}
}
const report={productionUrl:base+'/',deploymentUrl,checkedAt:new Date().toISOString(),checks};
await fs.writeFile(path.join(source,'reports/road-perspective/rider-cities/publication-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({productionUrl:report.productionUrl,exactFiles:checks.length-2,htmlPages:2},null,2));

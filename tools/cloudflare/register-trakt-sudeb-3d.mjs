// Sync only this fork's card. Preserve all existing per-project readiness values.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'../..'),context={window:{}};
for(const file of ['supabase-config.js','projects.js'])vm.runInNewContext(await fs.readFile(path.join(root,'site',file),'utf8'),context);
const config=context.window.TRACKER_SUPABASE_CONFIG;
const project=context.window.TRACKER_PROJECTS.find(p=>p.id==='trakt-sudeb-3d');
if(!project)throw Error('The 3D road card is missing from the static catalog');
const live=await fetch(project.url,{signal:AbortSignal.timeout(30000)});
if(!live.ok)throw Error(`Publish the game before registering its card: ${live.status}`);
const headers={apikey:config.publishableKey,'Content-Type':'application/json'},endpoint=config.url+'/rest/v1/project_tracker_projects';
const row={project_id:project.id,...Object.fromEntries(['title','folder','genre','description','platforms','stage','icon','url'].map(k=>[k,project[k]])),updated_at:new Date().toISOString()};
const saved=await fetch(endpoint+'?on_conflict=project_id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
if(!saved.ok)throw Error(`Catalog save failed: ${saved.status} ${await saved.text()}`);
const progress=await fetch(config.url+'/rest/v1/project_tracker_progress?on_conflict=project_id',{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({project_id:project.id,gameplay_readiness:project.readiness})});
if(!progress.ok)throw Error(`Readiness save failed: ${progress.status}`);
const readback=await fetch(endpoint+'?project_id=eq.'+project.id+'&select=project_id,title,folder,url,stage',{headers});
if(!readback.ok)throw Error(`Catalog readback failed: ${readback.status}`);
const rows=await readback.json();
if(rows.length!==1||rows[0].url!==project.url||rows[0].folder!==project.folder)throw Error('The saved 3D road card does not match the published game');
console.log(JSON.stringify(rows[0],null,2));

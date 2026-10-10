import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadState,saveState} from './core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.CANVAS_DATA_DIR||path.join(here,'data');
const launches=new Map();
export function openThread(id){
 if(!/^[a-zA-Z0-9-]+$/.test(id))throw Error('聊天 ID 无效');
 if(!launches.has(id))launches.set(id,prepare(id).finally(()=>launches.delete(id)));
 return launches.get(id);
}
async function prepare(id){
 const runtime=path.join(dataDir,'threads',id+'.runtime.json'),db=path.join(dataDir,'threads',id+'.json');
 async function healthy(info){if(info?.version!==3||info.canvasId!==id)return false;try{const u=new URL(info.url);if(u.hostname!=='127.0.0.1')return false;return (await fetch(u.origin+'/api/state',{headers:{'x-canvas-token':u.hash.slice(1)},signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}}
 let info=await loadState(runtime);
 if(!await healthy(info)){
  const child=spawn(process.execPath,[path.join(here,'server.mjs')],{cwd:here,windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,CANVAS_PORT:'0',CANVAS_ID:id,CANVAS_STATE_FILE:db,CANVAS_THREAD_ID:id.startsWith('local-')?'':id,CANVAS_RUNTIME_FILE:runtime}});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  let ready=false;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,150));info=await loadState(runtime);if(await healthy(info)){ready=true;break;}}if(!ready)throw Error('画布服务未能启动');
 }
 let result={added:0,total:0};
 if(!id.startsWith('local-')){const u=new URL(info.url),r=await fetch(u.origin+'/api/import-current-thread',{method:'POST',headers:{'Content-Type':'application/json','x-canvas-token':u.hash.slice(1)},body:'{}',signal:AbortSignal.timeout(45000)});result=await r.json();if(!r.ok)throw Error(result.error);}
 await saveState(path.join(dataDir,'last-chat.json'),{id});
 return {url:info.url,threadId:id,...result};
}
export async function openBrowser(url){
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command','Start-Process -FilePath $env:CANVAS_OPEN_URL'],{windowsHide:true,stdio:'ignore',env:{...process.env,CANVAS_OPEN_URL:url}});
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('默认浏览器未能打开')));});
}

import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('saved Codex course opens offline without invoking missing Codex',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'canvas-offline-')),id='saved-codex-course';
 const previous={...process.env};process.env.CANVAS_DATA_DIR=dir;process.env.CANVAS_CODEX_BIN='missing-codex-command';
 try{await mkdir(path.join(dir,'threads'));await writeFile(path.join(dir,'threads',id+'.json'),JSON.stringify({title:'Saved',sourceThreadId:id,nodes:[],rules:[],notes:[]}));
 const {openThread}=await import('./launcher.mjs?offline-test');const result=await openThread(id,{sync:false});const url=new URL(result.url);
 const state=await (await fetch(url.origin+'/api/state',{headers:{'x-canvas-token':url.hash.slice(1)}})).json();assert.equal(state.title,'Saved');assert.equal(state.codexSync,false);
 }finally{try{const info=JSON.parse(await readFile(path.join(dir,'threads',id+'.runtime.json'),'utf8'));process.kill(info.pid);}catch{}process.env=previous;await rm(dir,{recursive:true,force:true});}
});

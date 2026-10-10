import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createInterface} from 'node:readline';
test('standalone without Codex: configure API, two stages, final-only context and isolated new course',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'canvas-independent-'));const calls=[];
 const provider=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;calls.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:calls.length===1?'DRAFT_ONLY':'FINAL_ONLY'}}]}));});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,CANVAS_PORT:'0',CANVAS_THREAD_ID:'',CANVAS_ID:'local-test',CANVAS_RUNTIME_FILE:'',CANVAS_STATE_FILE:path.join(dir,'threads','local-test.json'),CANVAS_DATA_DIR:dir,CANVAS_CODEX_BIN:'missing-codex-command'},stdio:['ignore','pipe','pipe']});
 let extraPid;
 try{const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),5000);createInterface({input:child.stdout}).once('line',s=>{clearTimeout(timer);resolve(new URL(s));});child.once('error',reject);});
 const api=async(route,body)=>{const r=await fetch(url.origin+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'x-canvas-token':url.hash.slice(1),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 assert.deepEqual((await api('generation-settings')).models,[]);
 await api('connections',{name:'Mock API',model:'test',baseUrl:'http://127.0.0.1:'+provider.address().port+'/v1',apiKey:'secret',reasoning:'none'});
 assert.ok(!JSON.stringify(await api('connections')).includes('secret'));
 const catalog=await api('generation-settings');await api('generation-settings',catalog.defaults);
 const preview=await api('preview',{question:'test',mode:'main'});await api('generate',{id:preview.nodeId});
 let state;for(let i=0;i<100;i++){state=await api('state');if(state.nodes[0].status==='complete')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(state.nodes[0].answer,'FINAL_ONLY');assert.equal(calls.length,2);assert.equal(calls[0].tools,undefined);assert.equal(calls[1].tools,undefined);
 const next=await api('preview',{question:'next',mode:'main'});assert.equal(next.state.nodes[1].context.turns[0].answer,'FINAL_ONLY');assert.ok(!JSON.stringify(next.state.generation).includes('secret'));
 const course=await api('new-course',{title:'Independent'});assert.ok(course.threadId.startsWith('local-'));const fs=await import('node:fs/promises');extraPid=JSON.parse(await fs.readFile(path.join(dir,'threads',course.threadId+'.runtime.json'),'utf8')).pid;
 const other=new URL(course.url);const fresh=await (await fetch(other.origin+'/api/state',{headers:{'x-canvas-token':other.hash.slice(1)}})).json();assert.equal(fresh.title,'Independent');assert.equal(fresh.nodes.length,0);assert.equal(fresh.useCodex,false);
 }finally{if(extraPid)process.kill(extraPid);const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;await new Promise(r=>provider.close(r));await rm(dir,{recursive:true,force:true});}
});

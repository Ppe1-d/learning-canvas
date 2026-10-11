import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createInterface} from 'node:readline';
test('standalone without Codex: configure API, two stages, final-only context and isolated new course',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'canvas-independent-'));const calls=[];
 const provider=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;calls.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:calls.length===1?'DRAFT_ONLY':'FINAL_ONLY'}}]}));});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,CANVAS_PORT:'0',CANVAS_THREAD_ID:'',CANVAS_ID:'local-test',CANVAS_RUNTIME_FILE:'',CANVAS_STATE_FILE:path.join(dir,'threads','local-test.json'),CANVAS_DATA_DIR:dir,CANVAS_CODEX_BIN:'missing-codex-command'},stdio:['ignore','pipe','pipe']});
 let extraPid;
 try{const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),5000);createInterface({input:child.stdout}).once('line',s=>{clearTimeout(timer);resolve(new URL(s));});child.once('error',reject);});
 const api=async(route,body)=>{const r=await fetch(url.origin+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'x-canvas-token':url.hash.slice(1),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 const fontModule=await fetch(url.origin+'/typography.mjs');assert.equal(fontModule.status,200);assert.match(await fontModule.text(),/resolveTypography/);
 assert.deepEqual((await api('generation-settings')).models,[]);
 await api('connections',{name:'Mock API',model:'test',baseUrl:'http://127.0.0.1:'+provider.address().port+'/v1',apiKey:'secret',reasoning:'none'});
 assert.ok(!JSON.stringify(await api('connections')).includes('secret'));
 const catalog=await api('generation-settings');await api('generation-settings',catalog.defaults);
 const preview=await api('preview',{question:'test',mode:'main'});await api('generate',{id:preview.nodeId});
 let state;for(let i=0;i<100;i++){state=await api('state');if(state.nodes[0].status==='complete')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(state.nodes[0].answer,'FINAL_ONLY');assert.equal(calls.length,2);assert.equal(calls[0].tools,undefined);assert.equal(calls[1].tools,undefined);
 const next=await api('preview',{question:'next',mode:'main'});assert.equal(next.state.nodes[1].context.turns[0].answer,'FINAL_ONLY');assert.ok(!JSON.stringify(next.state.generation).includes('secret'));
 // Direct generation and summary requests must not silently invoke review.
 await api('generate',{id:next.nodeId,answerMode:'direct'});
 for(let i=0;i<100;i++){state=await api('state');if(state.nodes[1].status==='complete')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(calls.length,3);assert.equal(state.nodes[1].reviewed,false);assert.equal(state.nodes[1].draft,'');
 const third=await api('preview',{question:'third',mode:'main'});await api('generate',{id:third.nodeId,answerMode:'direct'});
 for(let i=0;i<100;i++){state=await api('state');if(state.nodes[2].status==='complete')break;await new Promise(r=>setTimeout(r,20));}
 await api('summary-settings',{enabled:true,keepRecent:1});
 const info=await api('summary-status',{mode:'main'});assert.equal(info.older,2);assert.equal(info.record,null);
 const summary=await api('summary-generate',{mode:'main'});assert.equal(calls.length,5);assert.equal(summary.coveredIds.length,2);
 assert.equal((await api('summary-status',{mode:'main'})).record,null,'preview must not apply itself');
 await api('summary-save',{id:summary.id,text:'Edited progress and conclusions'});
 const compact=await api('preview',{question:'after summary',mode:'main'}),node=compact.state.nodes.at(-1);
 assert.equal(node.context.turns.length,3);assert.equal(node.requestContext.turns.length,1);assert.equal(node.requestContext.summary.text,'Edited progress and conclusions');
 await api('generate',{id:compact.nodeId,answerMode:'direct'});
 for(let i=0;i<100;i++){state=await api('state');if(state.nodes.at(-1).status==='complete')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(calls.length,6);const sent=JSON.parse(calls.at(-1).messages[0].content.split('输入：')[1]);assert.equal(sent.context.turns.length,1);assert.equal(sent.context.summary.text,'Edited progress and conclusions');
 // A replacement is generated beside the current path, and only an explicit selection changes it.
 const previousHead=state.mainHead;
 const candidate=await api('preview',{question:'better answer',mode:'main',replaceId:previousHead});
 assert.equal(candidate.state.mainHead,previousHead);assert.ok(!candidate.state.nodes.at(-1).requestContext.turns.some(t=>t.id===previousHead));
 await api('generate',{id:candidate.nodeId,answerMode:'direct'});
 for(let i=0;i<100;i++){state=await api('state');if(state.nodes.at(-1).status==='complete')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(state.mainHead,previousHead);
 state=await api('mainline',{action:'select',id:candidate.nodeId});assert.equal(state.mainHead,candidate.nodeId);
 const after=await api('preview',{question:'continue selected answer',mode:'main'});
 assert.ok(after.state.nodes.at(-1).context.turns.some(t=>t.id===candidate.nodeId));assert.ok(!after.state.nodes.at(-1).context.turns.some(t=>t.id===previousHead));
 state=await api('mainline',{action:'exclude',id:candidate.nodeId});assert.equal(state.mainHead,candidate.state.nodes.at(-1).parents[0]);assert.ok(state.nodes.some(n=>n.id===previousHead));
 const course=await api('new-course',{title:'Independent'});assert.ok(course.threadId.startsWith('local-'));const fs=await import('node:fs/promises');extraPid=JSON.parse(await fs.readFile(path.join(dir,'threads',course.threadId+'.runtime.json'),'utf8')).pid;
 const other=new URL(course.url);const fresh=await (await fetch(other.origin+'/api/state',{headers:{'x-canvas-token':other.hash.slice(1)}})).json();assert.equal(fresh.title,'Independent');assert.equal(fresh.nodes.length,0);assert.equal(fresh.useCodex,false);
 }finally{if(extraPid)process.kill(extraPid);const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;await new Promise(r=>provider.close(r));await rm(dir,{recursive:true,force:true});}
});


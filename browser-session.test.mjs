import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';
import test from 'node:test';
import assert from 'node:assert/strict';
test('browser session exchanges token for cookie and rejects cross-site access',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'canvas-session-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,CANVAS_PORT:'0',CANVAS_STATE_FILE:path.join(dir,'state.json'),CANVAS_RUNTIME_FILE:'',CANVAS_THREAD_ID:''},stdio:['ignore','pipe','pipe']});
 try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),5000);createInterface({input:child.stdout}).once('line',line=>{clearTimeout(timer);resolve(new URL(line));});child.once('error',reject);});
 const origin=url.origin,headers={'x-canvas-token':url.hash.slice(1)};
 assert.equal((await fetch(origin+'/api/state')).status,403);
 const login=await fetch(origin+'/api/session',{method:'POST',headers});assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
 const cookie=setCookie.split(';')[0];assert.equal((await fetch(origin+'/api/state',{headers:{cookie}})).status,200);
 assert.equal((await fetch(origin+'/api/state',{headers:{cookie,Origin:'https://example.com'}})).status,403);
 assert.equal((await fetch(origin+'/api/state',{headers:{cookie,'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await fetch(origin+'/api/state',{headers:{cookie:'canvas_wrong=bad'}})).status,403);
 }finally{const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;await rm(dir,{recursive:true,force:true});}
});

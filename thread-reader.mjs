import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
export const readThread=threadId=>request('thread/read',{threadId,includeTurns:true}).then(r=>r.thread);
export const listThreads=(searchTerm='',cursor=null)=>request('thread/list',{limit:30,sortKey:'updated_at',sourceKinds:['cli','vscode','appServer'],searchTerm,cursor});
function request(method,params){return new Promise((resolve,reject)=>{
 const child=spawn(process.env.CANVAS_CODEX_BIN||'codex',['app-server','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const timer=setTimeout(()=>finish(Error('读取聊天超时')),30000);let done=false;
 function finish(err,data){if(done)return;done=true;clearTimeout(timer);child.kill();err?reject(err):resolve(data);}
 const send=value=>child.stdin.write(JSON.stringify(value)+'\n');child.stderr.resume();child.on('error',finish);child.stdin.on('error',finish);child.on('close',()=>{if(!done)finish(Error('聊天读取连接关闭'));});
 createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(m.error)return finish(Error(m.error.message));if(m.id===0){send({method:'initialized',params:{}});send({id:1,method,params});}if(m.id===1)finish(null,m.result);}catch(e){finish(e);}});
 send({id:0,method:'initialize',params:{clientInfo:{name:'learning_canvas_import',version:'1.0'}}});
});}

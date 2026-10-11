import {resolveCodex,codexStartError} from './codex-binary.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
let cached=null,inflight=null;
export function listModels(refresh=false){
 if(cached&&!refresh&&Date.now()-cached.at<300000)return Promise.resolve(cached.data);
 if(inflight)return inflight;
 inflight=new Promise((resolve,reject)=>{
  const child=spawn(resolveCodex(),['app-server','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let done=false,requestId=1;const models=[];
  const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);child.kill();if(err)reject(err);else{cached={at:Date.now(),data:models};resolve(models);}};
  const timer=setTimeout(()=>finish(Error('读取 Codex 模型列表超时，请重试')),30000);
  const send=obj=>child.stdin.write(JSON.stringify(obj)+'\n');
  child.on('error',e=>finish(Error('无法读取 Codex 模型列表：'+e.message)));child.on('close',()=>{if(!done)finish(Error('Codex 模型列表连接已中断'));});child.stdin.on('error',e=>finish(e));child.stderr.resume();
  createInterface({input:child.stdout}).on('line',line=>{try{const msg=JSON.parse(line);if(msg.id===undefined)return;if(msg.error)return finish(Error(msg.error.message));if(msg.id===0){send({method:'initialized',params:{}});send({method:'model/list',id:requestId,params:{limit:100,includeHidden:false}});}else if(msg.id===requestId){for(const m of msg.result.data)models.push({model:m.model,displayName:m.displayName,description:m.description,isDefault:m.isDefault,defaultReasoningEffort:m.defaultReasoningEffort,supportedReasoningEfforts:m.supportedReasoningEfforts});if(msg.result.nextCursor)send({method:'model/list',id:++requestId,params:{limit:100,cursor:msg.result.nextCursor,includeHidden:false}});else if(!models.length)finish(Error('当前没有可用模型'));else finish();}}catch(e){finish(e);}});
  send({method:'initialize',id:0,params:{clientInfo:{name:'learning_canvas',title:'Learning Canvas',version:'0.3.0'}}});
 }).finally(()=>{inflight=null;});return inflight;
}

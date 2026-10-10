import {catalog,connections,saveConnection,requestText} from './connections.mjs';
import {readdir} from 'node:fs/promises';
import {defaultGeneration,resolveGeneration} from './generation.mjs';
import {reviewAnswer} from './review.mjs';

import {parseDshExport} from './dsh-import.mjs';
import {importThread} from './thread-import.mjs';
import {readThread,listThreads} from './thread-reader.mjs';
import {openThread} from './launcher.mjs';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {contextFor,readRules,scopedRules,searchFiles,saveState,loadState} from './core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const token=randomBytes(24).toString('hex'), port=Number(process.env.CANVAS_PORT||43127);
const dataDir=process.env.CANVAS_DATA_DIR||path.join(here,'data');
const db=process.env.CANVAS_STATE_FILE||path.join(dataDir,'state.json');
const defaults={title:'我的学习画布',root:null,mode:'custom',custom:'用中文讲清一个小主题。交代必要术语、条件和语法。用具体例子解释机制，避免重复总结。',rules:[],nodes:[],mainHead:null,notes:[]};
let state=await loadState(db)??structuredClone(defaults);
state.canvasId=process.env.CANVAS_ID||state.canvasId;
if(process.env.CANVAS_ID?.startsWith('local-'))await saveState(db,state);
let origin=`http://127.0.0.1:${port}`;
let queue=Promise.resolve();
let generating=false;
const modelsFor=async(refresh=false)=>(await catalog(state.useCodex??!!process.env.CANVAS_THREAD_ID,refresh)).models;
for(const n of state.nodes)if(["drafting","reviewing"].includes(n.status)){n.status=n.draft?"review_failed":"generation_failed";n.reviewError="服务重启中断了请求，可重新尝试。";}
const persist=()=>saveState(db,state);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function api(route,p){
 if(route==='/api/import-dsh'){const thread=parseDshExport(String(p.text||'')),id='local-'+randomUUID(),course={...structuredClone(defaults),useCodex:false};thread.name=String(p.title||thread.name).slice(0,80);importThread(course,thread);course.importSource='dsh-export';delete course.sourceThreadId;course.dshSessionId=thread.id;await saveState(path.join(dataDir,'threads',id+'.json'),course);return openThread(id);}
 if(route==='/api/connections'){await saveConnection(p);return {ok:true};}
 if(route==='/api/codex-toggle'){state.useCodex=!!p.enabled;await persist();return {ok:true};}
 if(route==='/api/new-course'){const id='local-'+randomUUID();await saveState(path.join(dataDir,'threads',id+'.json'),{...structuredClone(defaults),title:String(p.title||'新课程').slice(0,80),useCodex:false});return openThread(id);}

 if(route==='/api/open-thread'){
  if(p.id===(process.env.CANVAS_ID||process.env.CANVAS_THREAD_ID))throw Error('已经在当前聊天画布中');
  return openThread(p.id);
 }
 if(route==='/api/import-current-thread'){
  if(!process.env.CANVAS_THREAD_ID)throw Error('此服务未绑定聊天');
  if(generating)throw Error('请等待当前回答完成后再同步');
  const result=importThread(state,await readThread(process.env.CANVAS_THREAD_ID));await persist();return {added:result.added,total:state.nodes.length};
 }
 if(route==='/api/generation-settings'){const models=await modelsFor();resolveGeneration(p,models);state.generation=structuredClone(p);await persist();return state;}
 if(route==='/api/settings'){
  if(!['off','full','custom'].includes(p.mode))throw new Error('未知规则模式');
  const rules=await readRules(state.root,p.mode,String(p.custom??''));
  state.mode=p.mode;state.custom=String(p.custom??'');state.title=String(p.title||state.title).slice(0,80);state.rules=rules;await persist();return state;
 }
 if(route==='/api/bind'){
  if(p.root){const root=await realpath(p.root);if(!(await stat(root)).isDirectory())throw new Error('请选择文件夹');
   const rules=await readRules(root,state.mode,state.custom);state.root=root;state.rules=rules;
  }else{state.root=null;if(state.mode==='full')state.rules=[];}
  await persist();return state;
 }
 if(route==='/api/preview'){
  const question=String(p.question??'').trim();if(!question)throw new Error('请输入问题');
  const mode=p.mode;if(!['main','branch','combine'].includes(mode))throw new Error('未知提问方式');
  const ids=mode==='main'?(state.mainHead?[state.mainHead]:[]):p.ids??[];
  if(ids.some(id=>['drafting','reviewing','review_failed','generation_failed'].includes(state.nodes.find(n=>n.id===id)?.status)))throw Error('所选路径尚无最终答案，请先完成生成和审校');
  if(mode!=='main'&&!ids.length)throw new Error('请先选择节点');
  const context=contextFor(state,ids,mode==='main'?'continue':mode);
  const baseRules=await readRules(state.root,state.mode,state.custom);
  const rulesChanged=state.mode==='full'&&JSON.stringify(baseRules)!==JSON.stringify(state.rules);
  if(mode!=='branch'){context.rules=structuredClone(state.rules.length||state.mode==='full'?state.rules:baseRules);context.ruleMode=state.mode;if(state.mode!=='full')context.scopedRules=[];}
  context.ruleMode??=state.mode;
  const retrieval=await searchFiles(state.root,question);
  const scope=[...(context.scopedRules??[])];if(state.root&&context.ruleMode==='full')for(const file of retrieval.files){
   const current=await scopedRules(state.root,file.path);for(const rule of current)if(!scope.some(r=>r.path===rule.path))scope.push(rule);
  }
  context.files=[...new Map([...context.files,...retrieval.files].map(f=>[`${f.path}:${f.version}:${f.start}`,f])).values()];
  context.scopedRules=[...new Map(scope.map(r=>[r.path,r])).values()];
  context.notes=mode==='main'?structuredClone(state.notes):mode==='combine'?[]:context.notes??[];
  const node={id:randomUUID(),question,answer:'这是请求预览，尚未调用模型。\n\n已经建立独立节点，并保存本轮规则、路径历史和资料片段。请打开“本次上下文”查看。\n\n接通模型后，教学回答将在这里显示。',kind:mode,parents:ids,context,directFiles:retrieval.files,createdAt:new Date().toISOString(),x:mode==='main'?120:480+(state.nodes.filter(n=>n.kind!=='main').length%3)*330,y:90+(mode==='main'?state.nodes.filter(n=>n.kind==='main').length:state.nodes.filter(n=>n.kind!=='main').length)*185,status:'preview',notice:[retrieval.notice,rulesChanged?'根目录规则有变化；目前保留旧版，请到设置点击“应用规则”。':''].filter(Boolean).join(' ')};
  const parents=ids.map(id=>state.nodes.find(n=>n.id===id)).filter(Boolean);
  if(p.direction==='vertical'){node.x=parents[0]?.x??60;node.y=parents.length?Math.max(...parents.map(n=>n.y))+340:60;if(mode!=='main')node.x+=420;}
  else{node.x=parents.length?Math.max(...parents.map(n=>n.x))+440:60;node.y=parents[0]?.y??60;if(mode!=='main')node.y+=340;}
  while(state.nodes.some(n=>Math.abs(n.x-node.x)<350&&Math.abs(n.y-node.y)<270)){if(p.direction==='vertical')node.x+=420;else node.y+=340;}
  state.nodes.push(node);if(mode==='main')state.mainHead=node.id;await persist();return {state,nodeId:node.id};
 }
 if(route==='/api/generate'){
  const n=state.nodes.find(n=>n.id===p.id);if(!n)throw Error('节点不存在');
  if(generating)throw Error('已有问题正在生成或审校，请等待完成');
  if(['complete','imported'].includes(n.status))throw Error('该节点已有最终稿，请创建新节点');
  if(state.nodes.some(child=>child.parents.includes(n.id)))throw Error('该预览已有后续节点，请新建提问，以免改变历史上下文');
  const catalog=await modelsFor();const effective=resolveGeneration(n.generation||state.generation||defaultGeneration(catalog),catalog);
  n.generation=effective;n.generationStartedAt??=new Date().toISOString();
  const savedDraft=n.status==='review_failed'?n.draft:'';generating=true;n.status=savedDraft?'reviewing':'drafting';n.answer='';n.reviewError='';
  n.context.turns=n.context.turns.filter(t=>['complete','imported'].includes(state.nodes.find(x=>x.id===t.id)?.status));
  await persist();
  void (async()=>{try{const result=await reviewAnswer({question:n.question,context:n.context},requestText,(stage,draft)=>{n.status=stage;if(draft)n.draft=draft;queue=queue.then(()=>persist());},savedDraft,n.generation);Object.assign(n,result);}catch(e){n.status='generation_failed';n.reviewError=e.message;}finally{generating=false;queue=queue.then(()=>persist());await queue;}})();
  return {ok:true};
 }
 if(route==='/api/layout-batch'){
  if(!Array.isArray(p.positions)||p.positions.some(v=>!state.nodes.some(n=>n.id===v.id)||!Number.isFinite(v.x)||!Number.isFinite(v.y)))throw Error('布局坐标无效');
  for(const pos of p.positions)Object.assign(state.nodes.find(n=>n.id===pos.id),{x:pos.x,y:pos.y});await persist();return {ok:true};
 }
 if(route==='/api/layout'){
  const n=state.nodes.find(n=>n.id===p.id);if(!n)throw new Error('节点不存在');if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('坐标无效');n.x=p.x;n.y=p.y;await persist();return {ok:true};
 }
 if(route==='/api/note'){
  if(!state.nodes.some(n=>n.id===p.id))throw new Error('来源节点不存在');const text=String(p.text??'').trim();if(!text)throw new Error('请填写带回的结论');state.notes.push({id:randomUUID(),source:p.id,text,createdAt:new Date().toISOString()});await persist();return state;
 }
 throw new Error('未知操作');
}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);return res.end('Invalid host');}
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'不允许跨站请求'});
   if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'不允许跨站请求'});
   const cookieName='canvas_'+new URL(origin).port;
   const authenticated=req.headers['x-canvas-token']===token||(req.headers.cookie||'').split(';').some(c=>c.trim()===`${cookieName}=${token}`);
   if(!authenticated)return json(res,403,{error:'请通过启动入口打开画布'});
   if(req.method==='POST'&&url.pathname==='/api/session'){
    res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);return json(res,200,{ok:true});
   }
   if(req.method==='GET'&&url.pathname==='/api/connections')return json(res,200,{profiles:await connections(),useCodex:state.useCodex??!!process.env.CANVAS_THREAD_ID});
   if(req.method==='GET'&&url.pathname==='/api/courses'){const files=await readdir(path.join(dataDir,'threads')).catch(()=>[]);const data=[];for(const name of files.filter(n=>n.endsWith('.json')&&!n.endsWith('.runtime.json'))){const saved=await loadState(path.join(dataDir,'threads',name));data.push({id:name.slice(0,-5),name:saved.title});}return json(res,200,{data,nextCursor:null});}
   if(req.method==='GET'&&url.pathname==='/api/threads')return json(res,200,await listThreads(url.searchParams.get('search')||'',url.searchParams.get('cursor')));
   if(req.method==='GET'&&url.pathname==='/api/generation-settings'){const models=await modelsFor(url.searchParams.has('refresh'));return json(res,200,{models,defaults:defaultGeneration(models),config:state.generation||defaultGeneration(models)});}
   if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,state);
   if(req.method!=='POST')return json(res,405,{error:'请求方法不支持'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>(url.pathname==='/api/import-dsh'?24000000:128000))throw new Error('请求过大');}
   const payload=JSON.parse(body||'{}');
   const result=queue.then(()=>api(url.pathname,payload));queue=result.catch(()=>{});
   return json(res,200,await result);
  }
  const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/layout.css':'layout.css','/geometry.mjs':'geometry.mjs','/markdown.mjs':'markdown.mjs','/tab-ui.css':'tab-ui.css'};const file=files[url.pathname];
  if(!file){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(await readFile(path.join(here,'public',file)));
 }catch(e){json(res,400,{error:e.message});}
});
server.listen(port,'127.0.0.1',async()=>{origin=`http://127.0.0.1:${server.address().port}`;const url=`${origin}/#${token}`;if(process.env.CANVAS_RUNTIME_FILE)await saveState(process.env.CANVAS_RUNTIME_FILE,{version:3,canvasId:process.env.CANVAS_ID,url,threadId:process.env.CANVAS_THREAD_ID,pid:process.pid});console.log(url);});

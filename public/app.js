import {markdown} from './markdown.mjs';
import {W,H,isVisible,buildRoutes,arrange} from './geometry.mjs';
const $=selector=>document.querySelector(selector);
const token=location.hash.slice(1)||sessionStorage.getItem('canvas-token');
history.replaceState(null,'',location.pathname);
if(token){const response=await fetch('/api/session',{method:'POST',headers:{'x-canvas-token':token}});if(response.ok)sessionStorage.removeItem('canvas-token');}
window.addEventListener('hashchange',()=>location.reload());
let state,selected=new Set(),active=null,tab='answer',mode='main',zoom=1,pan={x:0,y:0},busy=false;
let modelData=null,routeCache={key:'',routes:[]};
let direction=localStorage.getItem('canvas-direction')||'horizontal',undoLayout=null;
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
async function api(route,data){const r=await fetch('/api/'+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000);}
function transform(){$('#world').style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;$('#zoom-label').textContent=Math.round(zoom*100)+'%';if(state)renderNodes();}
function nodeTitle(n){const marker='## My request:';return n.status==='imported'&&n.question.includes(marker)?n.question.slice(n.question.lastIndexOf(marker)+marker.length).trim():n.question.trim();}
function labels(){
 $('#course-title').textContent=state.title;updateModelLabels();
 $('#source-status').textContent=state.root?'资料已绑定':'未绑定资料';$('#source-status').title=(state.root||'在课程与资料中绑定本地文件夹')+' · '+({off:'目录规则关闭',full:'完整目录规则',custom:'课程精简规则'}[state.mode]);
 $('#target-label').textContent=mode==='main'?'主线':mode==='combine'?`关联 ${selected.size} 个节点`:`分支 · 节点 ${String(state.nodes.findIndex(n=>n.id===active)+1).padStart(2,'0')}`;
 $('#selection-count').textContent=selected.size>1&&mode!=='combine'?`已选 ${selected.size} 个节点`:'';$('.target').hidden=false;$('#question').placeholder=mode==='main'?'在主线上提问，或继续当前主题…':mode==='combine'?`结合已选的 ${selected.size} 个节点提问…`:`从节点 ${state.nodes.findIndex(n=>n.id===active)+1} 开始分支提问…`;
 const pending=state.nodes.some(n=>['drafting','reviewing'].includes(n.status));const unfinished=state.nodes.some(n=>selected.has(n.id)&&['drafting','reviewing','review_failed','generation_failed'].includes(n.status));$('#branch').disabled=!active||unfinished;$('#combine').disabled=selected.size<2||unfinished;$('#bring-back').disabled=!active||unfinished;$('#send').disabled=busy||pending;
}
function drawEdges(){
 const svg=$('#edges');svg.replaceChildren();const key=direction+'|'+state.nodes.map(n=>`${n.id}:${n.x},${n.y}:${n.parents.join(',')}`).join('|');
 if(key!==routeCache.key)routeCache={key,routes:buildRoutes(state.nodes,direction)};
 const cards=new Map([...document.querySelectorAll('.node')].map(e=>[e.dataset.id,e]));for(const card of cards.values())card.querySelectorAll('.port').forEach(p=>p.remove());
 const nodes=new Map(state.nodes.map(n=>[n.id,n]));let blocked=0;
 for(const route of routeCache.routes){
  for(const end of [route.from,route.to]){const card=cards.get(end.node);if(!card)continue;const n=nodes.get(end.node),port=el('span','port'+(route.blocked?' obstructed':''));port.style.left=(end.point[0]-n.x)+'px';port.style.top=(end.point[1]-n.y)+'px';port.style.transform='translate(-50%,-50%)';port.setAttribute('aria-hidden','true');card.append(port);}
  if(route.blocked){blocked++;continue;}
  const xs=route.points.map(p=>p[0]),ys=route.points.map(p=>p[1]);if(Math.max(...xs)*zoom+pan.x<0||Math.min(...xs)*zoom+pan.x>$('#canvas').clientWidth||Math.max(...ys)*zoom+pan.y<0||Math.min(...ys)*zoom+pan.y>$('#canvas').clientHeight)continue;
  const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',route.path);if(route.kind!=='main')line.classList.add('branch-line');if(selected.has(route.source)||selected.has(route.target))line.classList.add('related');svg.append(line);
 }
 $('#route-status').textContent=blocked?`${blocked} 条连线受阻，请移开重叠或过近的卡片`:'';
}
function renderNodes(){
 const host=$('#nodes');host.replaceChildren();$('#empty').hidden=state.nodes.length>0;
 state.nodes.forEach((n,i)=>{
  if(!isVisible(n,pan,zoom,$('#canvas').clientWidth,$('#canvas').clientHeight))return;
  const card=el('article','node'+(n.kind!=='main'?' branch-node':'')+(selected.has(n.id)?' selected':''));card.classList.add(direction);if(zoom<.48)card.classList.add('compact');card.style.left=n.x+'px';card.style.top=n.y+'px';card.dataset.id=n.id;card.tabIndex=0;card.setAttribute('aria-label',nodeTitle(n));
  const head=el('div','node-head');head.append(el('span','',`${String(i+1).padStart(2,'0')}  /  ${n.kind==='main'?'学习主线':n.kind==='combine'?'关联提问':'追问分支'}`));const check=el('input');check.type='checkbox';check.checked=selected.has(n.id);check.setAttribute('aria-label','选择节点 '+nodeTitle(n));check.addEventListener('click',e=>{e.stopPropagation();select(n.id,true);});head.append(check);
  card.append(head,el('h3','',nodeTitle(n)),el('p','node-excerpt',(n.answer||statusText(n.status)).replace(/[*#`]/g,'')));const foot=el('div','node-foot');foot.title=statusText(n.status);foot.append(el('span','',n.directFiles.length?`${n.directFiles.length} 份资料`:''),el('span','',['drafting','reviewing','review_failed','generation_failed','preview'].includes(n.status)?statusText(n.status):''));card.append(foot);
  card.addEventListener('click',e=>{if(card.dataset.dragged==='yes'){card.dataset.dragged='no';return;}select(n.id,e.ctrlKey||e.metaKey||e.shiftKey);});card.addEventListener('keydown',e=>{if(e.key==='Enter')select(n.id,e.ctrlKey);});
  card.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('input,button,a,select,textarea'))return;e.stopPropagation();const start={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y};card.setPointerCapture(e.pointerId);let moved=false;
   const move=ev=>{if(Math.abs(ev.clientX-start.x)+Math.abs(ev.clientY-start.y)>5)moved=true;if(!moved)return;n.x=start.nx+(ev.clientX-start.x)/zoom;n.y=start.ny+(ev.clientY-start.y)/zoom;card.style.left=n.x+'px';card.style.top=n.y+'px';drawEdges();};
   const up=()=>{card.removeEventListener('pointermove',move);card.removeEventListener('pointerup',up);card.removeEventListener('pointercancel',up);if(card.hasPointerCapture(e.pointerId))card.releasePointerCapture(e.pointerId);if(moved){card.dataset.dragged='yes';api('layout',{id:n.id,x:n.x,y:n.y}).catch(e=>toast(e.message));}};card.addEventListener('pointermove',move);card.addEventListener('pointerup',up);card.addEventListener('pointercancel',up);
  });host.append(card);
 });drawEdges();labels();
}
function select(id,multi=false){if(!multi)setReaderOpen(true);if(multi){selected.has(id)?selected.delete(id):selected.add(id);}else selected=new Set([id]);active=id;renderNodes();renderReader();}
function addText(host,text){const body=el('div','markdown');body.innerHTML=markdown(text);host.append(body);}
function fileView(host,f){const block=el('div','file-block');block.append(el('strong','',f.path),el('small','',`第 ${f.start}–${f.end} 行 · 版本 ${f.version.slice(0,10)}`));const details=el('details');details.append(el('summary','','查看读取片段'),el('pre','',f.text));block.append(details);host.append(block);}
function renderReader(){
 const n=state.nodes.find(n=>n.id===active);if(!n)return;
 $('#reader-title').textContent=nodeTitle(n);$('#node-type').textContent=n.kind==='main'?'主线节点':'独立分支';$('#file-count').textContent=n.context.files.length;
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));const content=$('#reader-content');content.replaceChildren();
 if(tab==='answer'){content.append(el('span','preview-label',n.status==='complete'&&n.reviewed===false?'最终稿 · 未启用审校':statusText(n.status)));addText(content,n.answer||'尚无最终答案。草稿不进入后续上下文。');if(n.notice)content.append(el('div','info-box',n.notice));}
 if(tab==='review'){if(n.generation){for(const [stage,title] of [['draft','生成配置'],['review','审校配置']]){if(stage==='review'&&n.generation.reviewEnabled===false)continue;const g=n.generation[stage],d=el('details','stage-record');d.append(el('summary','',`${title} · ${g.model} / ${effortLabel(g.effort)}`),el('pre','',g.prompt));content.append(d);}}else content.append(el('div','info-box',n.status==='imported'?'此回答导入自原聊天，未经过画布的两阶段审校。':'此节点尚无模型配置记录；旧版历史节点未记录的配置不会补写。')); content.append(el('div','info-box',n.status==='complete'?(n.reviewed===false?'直接回答，未启用审校。后续引用此回答。':'已完成生成和独立审校。后续只引用最终稿；审校不能保证没有错误。'):statusText(n.status)));if(n.draft){const d=el('details');d.append(el('summary','','查看第一阶段草稿'),el('pre','',n.draft));content.append(d);}if(n.reviewError)content.append(el('p','',n.reviewError));if(['preview','review_failed','generation_failed'].includes(n.status)){const retry=el('button','',n.status==='review_failed'?'重试审校':n.status==='preview'?'生成并审校':'重试生成');retry.onclick=()=>runReview(n.id);content.append(retry);}}
 if(tab==='context'){
  const input=n.requestContext||n.context;if(input.summary){content.append(el('h3','','本次使用的历史摘要'),el('div','info-box',`覆盖 ${input.summary.coveredIds.length} 轮；其余 ${input.turns.length} 轮完整发送`));addText(content,input.summary.text);}

  content.append(el('div','info-box',`历史问答 ${input.turns.length} 轮 · 资料 ${n.context.files.length} 份 · 课程规则 ${n.context.rules.length} 项\n这里展示本节点实际使用的输入快照。`));
  content.append(el('h3','','生效教学规则'));if(!n.context.rules.length)content.append(el('p','','未附加课程规则。'));n.context.rules.forEach(r=>{const d=el('details');d.append(el('summary','',r.path),el('pre','',r.text));content.append(d);});
  content.append(el('h3','','引用的历史问答'));if(!input.turns.length)content.append(el('p','','这是一个新的起点。'));input.turns.forEach(t=>{const d=el('details','context-item');d.append(el('summary','',t.question),el('pre','',t.answer));content.append(d);});
  if(n.context.notes?.length){content.append(el('h3','','带回主线的笔记'));n.context.notes.forEach(note=>content.append(el('div','info-box',note.text)));}
  if(n.context.scopedRules?.length){content.append(el('h3','','资料目录规则'));n.context.scopedRules.forEach(r=>{const d=el('details');d.append(el('summary','',r.path+' · 仅适用于 '+r.scope),el('pre','',r.text));content.append(d);});}
  if(input.summary){const raw=el('details');raw.append(el('summary','',`查看保留的 ${n.context.turns.length} 轮原始问答`));for(const t of n.context.turns)raw.append(el('h4','',t.question),el('pre','',t.answer));content.append(raw);}
  content.append(el('h3','','本次问题'),el('p','',n.question));
 }
 if(tab==='files'){content.append(el('div','info-box',`本轮新读 ${n.directFiles.length} 份；含继承资料共 ${n.context.files.length} 份。文件内容已保存快照。`));if(!n.context.files.length)content.append(el('p','','本节点没有附加资料。绑定目录后，按问题自动检索相关文本。'));n.context.files.forEach(f=>fileView(content,f));}
}
function showSettings(){$('#title-input').value=state.title;$('#root-input').value=state.root??'';$('#bound-root').textContent=state.root??'尚未绑定';$('#custom-input').value=state.custom;document.querySelector(`[name=rules][value=${state.mode}]`).checked=true;$('#settings-error').textContent='';toggleCustom();$('#settings').showModal();}
function toggleCustom(){$('#custom-label').hidden=document.querySelector('[name=rules]:checked').value!=='custom';}
$('#settings-open').onclick=showSettings;$('#settings-close').onclick=()=>$('#settings').close();document.querySelectorAll('[name=rules]').forEach(r=>r.onchange=toggleCustom);
$('#settings-form').onsubmit=async e=>{e.preventDefault();try{state=await api('settings',{title:$('#title-input').value,mode:document.querySelector('[name=rules]:checked').value,custom:$('#custom-input').value});labels();$('#settings').close();toast('已应用到后续主线与关联请求；历史节点保持原版本。');}catch(e){$('#settings-error').textContent=e.message;}};
$('#bind').onclick=async()=>{try{state=await api('bind',{root:$('#root-input').value});$('#bound-root').textContent=state.root;labels();toast('已绑定，可在此范围内自动按需读取。');}catch(e){$('#settings-error').textContent=e.message;}};
$('#unbind').onclick=async()=>{try{state=await api('bind',{root:null});$('#root-input').value='';$('#bound-root').textContent='已解除绑定；已有节点的快照仍保留。';labels();}catch(e){$('#settings-error').textContent=e.message;}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderReader();});
$('#branch').onclick=()=>{mode='branch';selected=new Set([active]);renderNodes();$('#question').focus();toast('下一次提问将从此节点分叉，继承当时的规则与资料。');};
$('#combine').onclick=()=>{mode='combine';labels();$('#question').focus();};
$('#main-focus').onclick=()=>{mode='main';if(state.mainHead){const n=state.nodes.find(n=>n.id===state.mainHead);pan={x:40-n.x*zoom,y:20-n.y*zoom};select(n.id);}transform();labels();};
$('#ask-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#send').disabled=true;try{const r=await api('preview',{direction,question:$('#question').value,mode,ids:mode==='branch'?[active]:[...selected]});state=r.state;active=r.nodeId;selected=new Set([active]);if(mode==='combine')mode='branch';$('#question').value='';tab='answer';renderNodes();renderReader();const n=state.nodes.find(n=>n.id===active);pan={x:Math.min(0,40-n.x*zoom),y:20-n.y*zoom};transform();if($('#generation-mode').value!=='preview')await runReview(active);else toast('已保存上下文预览，未调用模型。');}catch(e){toast(e.message);}finally{busy=false;$('#send').disabled=state.nodes.some(n=>['drafting','reviewing'].includes(n.status));}};
$('#question').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))$('#ask-form').requestSubmit();};
document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{$('#question').value=b.dataset.question;$('#question').focus();});
$('#bring-back').onclick=()=>{$('#note-text').value='';$('#note-dialog').showModal();};$('#note-close').onclick=()=>$('#note-dialog').close();
$('#note-form').onsubmit=async e=>{e.preventDefault();try{state=await api('note',{id:active,text:$('#note-text').value});$('#note-dialog').close();toast('结论已加入后续主线输入。');}catch(e){toast(e.message);}};
$('#export').onclick=()=>{const a=el('a');const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.href=url;a.download='learning-canvas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#fullscreen').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen();}catch{toast('当前预览宿主未允许网页全屏，可使用画布区域继续预览。');}};
function fitAll(){if(!state.nodes.length){zoom=1;pan={x:0,y:0};}else{const minX=Math.min(...state.nodes.map(n=>n.x)),minY=Math.min(...state.nodes.map(n=>n.y));const width=Math.max(...state.nodes.map(n=>n.x))+W-minX,height=Math.max(...state.nodes.map(n=>n.y))+H-minY;zoom=Math.min(1,Math.max(.08,Math.min(($('#canvas').clientWidth-60)/width,($('#canvas').clientHeight-40)/height)));pan={x:30-minX*zoom,y:20-minY*zoom};}transform();}
function changeZoom(delta){zoom=Math.max(.08,Math.min(2,zoom+delta));transform();}$('#zoom-in').onclick=()=>changeZoom(.1);$('#zoom-out').onclick=()=>changeZoom(-.1);$('#reset-view').onclick=fitAll;
$('#canvas').addEventListener('wheel',e=>{e.preventDefault();const rect=$('#canvas').getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,old=zoom;zoom=Math.max(.08,Math.min(2,zoom*(e.deltaY>0?.9:1.1)));pan={x:x-(x-pan.x)*zoom/old,y:y-(y-pan.y)*zoom/old};transform();},{passive:false});
$('#canvas').addEventListener('pointerdown',e=>{if(e.target.closest('.node')||e.target.closest('button'))return;const canvas=$('#canvas'),start={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};canvas.setPointerCapture(e.pointerId);const move=ev=>{pan={x:start.px+ev.clientX-start.x,y:start.py+ev.clientY-start.y};transform();};const up=()=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);};canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);});
$('#direction').value=direction;
try{state=await api('state');renderNodes();if(state.nodes.length){active=state.mainHead??state.nodes[0].id;selected.add(active);renderNodes();renderReader();}fitAll();if(state.nodes.length>3){zoom=.85;const n=state.nodes.find(n=>n.id===active);pan={x:$('#canvas').clientWidth-40-(n.x+W)*zoom,y:60-n.y*zoom};transform();}}catch(e){toast(e.message);$('#send').disabled=true;}

function statusText(status){return ({imported:'导入回答 · 未经画布审校',preview:'请求预览 · 未调用模型',drafting:'正在生成草稿',reviewing:'正在审校并重写',complete:'最终稿 · 已审校',review_failed:'审校失败 · 未进入上下文',generation_failed:'生成失败',example:'示例内容'})[status]||status;}
async function runReview(id){
 $('#send').disabled=true;
 try{await api('generate',{id,answerMode:$('#generation-mode').value});state=await api('state');renderNodes();renderReader();$('#send').textContent='生成 / 审校中…';}
 catch(e){toast(e.message);$('#send').disabled=false;}
}
$('#generation-mode').onchange=()=>{$('#send').textContent=answerButtonText();};
async function saveLayout(){await api('layout-batch',{positions:state.nodes.map(({id,x,y})=>({id,x,y}))});}
$('#arrange').onclick=async()=>{undoLayout=state.nodes.map(({id,x,y})=>({id,x,y}));state.nodes=arrange(state.nodes,direction);try{await saveLayout();$('#undo-layout').disabled=false;fitAll();}catch(e){toast(e.message);}};
$('#undo-layout').onclick=async()=>{if(!undoLayout)return;for(const p of undoLayout){const n=state.nodes.find(n=>n.id===p.id);if(n)Object.assign(n,p);}await saveLayout();undoLayout=null;$('#undo-layout').disabled=true;fitAll();};
$('#direction').onchange=()=>{direction=$('#direction').value;localStorage.setItem('canvas-direction',direction);renderNodes();toast('已切换连接方向；点击一键整理可重新排列节点。');};
document.addEventListener('fullscreenchange',()=>{const full=!!document.fullscreenElement;$('#fullscreen').textContent=full?'⤡':'⤢';$('#fullscreen').setAttribute('aria-label',full?'退出全屏':'进入全屏');$('#fullscreen').title=full?'退出全屏':'进入全屏';});
let readerWidth=Number(localStorage.getItem('canvas-reader-width'))||380;
function setReaderWidth(width){readerWidth=Math.max(260,Math.min(window.innerWidth-260,width));document.documentElement.style.setProperty('--reader-width',readerWidth+'px');localStorage.setItem('canvas-reader-width',readerWidth);if(state)transform();}
setReaderWidth(readerWidth);
$('#splitter').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const start=e.clientX,width=readerWidth,separator=$('#splitter');separator.classList.add('dragging');separator.setPointerCapture(e.pointerId);separator.onpointermove=ev=>setReaderWidth(width+start-ev.clientX);const stop=()=>{separator.onpointermove=null;separator.classList.remove('dragging');if(separator.hasPointerCapture(e.pointerId))separator.releasePointerCapture(e.pointerId);separator.blur();};separator.onpointerup=stop;separator.onpointercancel=stop;separator.onlostpointercapture=stop;};
$('#splitter').ondblclick=()=>setReaderWidth(380);
$('#splitter').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setReaderWidth(readerWidth+(e.key==='ArrowLeft'?20:-20));}};
function setReaderOpen(open){document.body.classList.toggle('reader-hidden',!open);$('#reader-toggle').textContent=open?'收起阅读栏':'展开阅读栏';$('#reader-toggle').setAttribute('aria-expanded',open);if(state)transform();}
$('#reader-toggle').onclick=()=>setReaderOpen(document.body.classList.contains('reader-hidden'));$('#reader-close').onclick=()=>setReaderOpen(false);
document.querySelectorAll('#canvas-menu button').forEach(button=>button.addEventListener('click',()=>{$('#canvas-menu').open=false;}));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#canvas-menu'))$('#canvas-menu').open=false;});
new ResizeObserver(()=>{if(state)transform();}).observe($('#canvas'));

let refreshing=false;
setInterval(async()=>{if(refreshing||!state?.nodes.some(n=>['drafting','reviewing'].includes(n.status)))return;refreshing=true;try{state=await api('state');renderNodes();renderReader();const pending=state.nodes.some(n=>['drafting','reviewing'].includes(n.status));$('#send').disabled=pending;$('#send').textContent=pending?'生成 / 审校中…':answerButtonText();if(!pending)toast('请求已结束，请查看最终稿或审校记录。');}catch(e){toast(e.message);}finally{refreshing=false;}},2000);

function effortLabel(value){return ({default:'服务默认',none:'无',minimal:'极低',low:'低',medium:'中等',high:'高',xhigh:'很高',max:'最高',ultra:'Ultra'})[value]||value;}
function updateModelLabels(){const c=state?.generation||modelData?.config;if(!c)return;for(const stage of ['draft','review']){$('#'+stage+'-settings').textContent=(stage==='draft'?'生成：':'审校：')+(c[stage].model==='same'?'同生成':(modelData?.models.find(m=>m.model===c[stage].model)?.displayName||c[stage].apiModel||c[stage].model||'未配置'))+(c[stage].effort?' / '+effortLabel(c[stage].effort):'');}}
function readStageForm(){return {reviewEnabled:$('#review-enabled').checked,...Object.fromEntries(['draft','review'].map(stage=>[stage,{model:$('#'+stage+'-model').value,effort:$('#'+stage+'-effort').value,prompt:$('#'+stage+'-prompt').value}]))};}
function effortOptions(stage,selectedValue,adapt=false){const id=$('#'+stage+'-model').value;const actual=id==='same'?$('#draft-model').value:id;const model=modelData.models.find(m=>m.model===actual),select=$('#'+stage+'-effort');select.replaceChildren();for(const e of model?.supportedReasoningEfforts||[]){const option=el('option','',effortLabel(e.reasoningEffort));option.value=e.reasoningEffort;option.title=e.description;select.append(option);}
 if([...select.options].some(o=>o.value===selectedValue))select.value=selectedValue;else if(adapt&&model)select.value=model.defaultReasoningEffort;else{const missing=el('option','',selectedValue?'不支持：'+selectedValue:'请选择');missing.value=selectedValue||'';missing.disabled=true;missing.selected=true;select.append(missing);}}
function fillModelForm(config){$('#review-enabled').checked=config.reviewEnabled!==false;toggleReviewFields();for(const stage of ['draft','review']){const select=$('#'+stage+'-model');select.replaceChildren();if(stage==='review'){const same=el('option','','跟随生成模型');same.value='same';select.append(same);}for(const m of modelData.models){const option=el('option','',m.displayName||m.model);option.value=m.model;select.append(option);}if(![...select.options].some(o=>o.value===config[stage].model)){const missing=el('option','',config[stage].model+'（不可用）');missing.value=config[stage].model;missing.disabled=true;select.append(missing);}select.value=config[stage].model;$('#'+stage+'-prompt').value=config[stage].prompt;}
 for(const stage of ['draft','review'])effortOptions(stage,config[stage].effort);}
async function openModelSettings(stage){$('#model-dialog').showModal();$('#model-save').disabled=true;$('#model-error').textContent='正在读取模型列表…';try{modelData=await api('generation-settings');fillModelForm(modelData.config);updateModelLabels();$('#model-error').textContent=modelData.models.length?'':'尚未配置模型，请先在“模型服务”添加 API 或启用 Codex';$('#model-save').disabled=false;$('#'+stage+'-model').focus();}catch(e){$('#model-error').textContent=e.message;}}
$('#draft-settings').onclick=()=>openModelSettings('draft');$('#review-settings').onclick=()=>openModelSettings('review');$('#model-close').onclick=()=>$('#model-dialog').close();
$('#draft-model').onchange=()=>{effortOptions('draft',$('#draft-effort').value,true);if($('#review-model').value==='same')effortOptions('review',$('#review-effort').value,true);};
$('#review-model').onchange=()=>effortOptions('review',$('#review-effort').value,true);
$('#model-form').onsubmit=async e=>{e.preventDefault();$('#model-save').disabled=true;try{state=await api('generation-settings',readStageForm());if(state.generation.reviewEnabled===false)setAnswerMode('direct');else if($('#generation-mode').value==='direct')setAnswerMode('review');modelData.config=structuredClone(state.generation);labels();$('#model-dialog').close();toast('已保存两阶段设置；历史节点保持原配置。');}catch(e){$('#model-error').textContent=e.message;}finally{$('#model-save').disabled=false;}};
document.querySelectorAll('[data-reset-stage]').forEach(button=>button.onclick=()=>{if(!modelData)return;const stage=button.dataset.resetStage,config=readStageForm();config[stage]=structuredClone(modelData.defaults[stage]);fillModelForm(config);});
$('#refresh-models').onclick=async()=>{const unsaved=modelData?readStageForm():null;$('#model-error').textContent='正在刷新…';$('#model-save').disabled=true;try{modelData=await api('generation-settings?refresh=1');fillModelForm(unsaved||modelData.config);$('#model-error').textContent='模型列表已刷新，未覆盖正在编辑的提示词。';$('#model-save').disabled=false;}catch(e){$('#model-error').textContent=e.message;}};
api('generation-settings').then(data=>{modelData=data;updateModelLabels();}).catch(()=>{});

function resizeComposer(){const h=$('.composer-wrap').offsetHeight;$('.workspace').style.setProperty('--composer-space',(h+30)+'px');}
new ResizeObserver(resizeComposer).observe($('.composer-wrap'));resizeComposer();
document.querySelectorAll('.help-trigger').forEach(button=>{const host=button.parentElement;button.onclick=()=>host.classList.toggle('pinned');button.addEventListener('keydown',e=>{if(e.key==='Escape'){host.classList.remove('pinned');button.blur();}});});
document.addEventListener('pointerdown',e=>{document.querySelectorAll('.help.pinned').forEach(host=>{if(!host.contains(e.target))host.classList.remove('pinned');});});

const viewKey=()=> 'canvas-view-'+(state?.canvasId||state?.sourceThreadId||'local');
function saveView(){if(state)localStorage.setItem(viewKey(),JSON.stringify({zoom,pan}));}
window.addEventListener('pagehide',saveView);
try{const saved=JSON.parse(localStorage.getItem(viewKey())||'null');if(saved){zoom=saved.zoom;pan=saved.pan;transform();}}catch{}
let threadCursor=null,threadRequest=0;
async function showThreads(more=false){
 const request=++threadRequest;$('#thread-message').textContent='正在读取聊天…';
 try{const result=await api($('#library-source').value+'?search='+encodeURIComponent($('#thread-search').value)+(more&&threadCursor?'&cursor='+encodeURIComponent(threadCursor):''));if(request!==threadRequest)return;
 if(!more)$('#thread-list').replaceChildren();threadCursor=result.nextCursor;$('#thread-more').hidden=!threadCursor;
 for(const thread of result.data.filter(t=>$('#library-source').value!=='courses'||t.name.includes($('#thread-search').value))){const button=el('button','thread-choice',thread.name||(thread.preview||'未命名聊天').slice(0,80));button.title=thread.cwd||'';button.disabled=thread.id===(state.canvasId||state.sourceThreadId);
 button.onclick=async()=>{button.disabled=true;$('#thread-message').textContent='正在打开聊天画布…';try{saveView();const result=await api('open-thread',{id:thread.id,source:$('#library-source').value});location.assign(result.url);}catch(e){button.disabled=false;$('#thread-message').textContent=e.message;}};$('#thread-list').append(button);}
 $('#thread-message').textContent=result.data.length?'':'没有找到聊天';
 }catch(e){$('#thread-message').textContent=e.message;}
}
$('#thread-switch').onclick=()=>{$('#thread-dialog').showModal();showThreads();};
$('#thread-close').onclick=()=>$('#thread-dialog').close();
$('#thread-search-form').onsubmit=e=>{e.preventDefault();showThreads();};
$('#thread-more').onclick=()=>showThreads(true);
let syncing=false;
setInterval(async()=>{
 if(syncing||document.hidden||!state?.sourceThreadId||!state.codexSync||busy||state.nodes.some(n=>['drafting','reviewing'].includes(n.status)))return;
 syncing=true;try{const result=await api('import-current-thread',{});if(result.added){state=await api('state');renderNodes();renderReader();}}catch(e){$('#thread-switch').title='同步暂未完成：'+e.message;}finally{syncing=false;}
},15000);

// Provider credentials stay on the server. The UI receives only hasKey.
let connectionProfiles=[];
function fillConnection(profile={}){
 $('#connection-name').value=profile.name||'';$('#connection-url').value=profile.baseUrl||'';$('#connection-model').value=profile.model||'';$('#connection-reasoning').value=profile.reasoning||'none';$('#connection-key').value='';$('#connection-clear').checked=false;
 $('#connection-status').textContent=profile.hasKey?'已保存密钥；留空保留。':'';
}
async function refreshConnections(){const data=await api('connections');connectionProfiles=data.profiles;$('#use-codex').checked=data.useCodex;const select=$('#connection-id');select.replaceChildren();const add=el('option','','添加服务');add.value='';select.append(add);for(const p of data.profiles){const option=el('option','',p.name+' / '+p.model);option.value=p.id;select.append(option);}}
$('#connections-open').onclick=async()=>{try{await refreshConnections();fillConnection();$('#connections-dialog').showModal();}catch(e){toast(e.message);}};
$('#connections-close').onclick=()=>{$('#connection-key').value='';$('#connections-dialog').close();};
$('#connection-id').onchange=()=>fillConnection(connectionProfiles.find(p=>p.id===$('#connection-id').value));
$('#use-codex').onchange=async()=>{try{await api('codex-toggle',{enabled:$('#use-codex').checked});modelData=await api('generation-settings');updateModelLabels();}catch(e){toast(e.message);}};
$('#connection-form').onsubmit=async e=>{e.preventDefault();try{await api('connections',{id:$('#connection-id').value||undefined,name:$('#connection-name').value,baseUrl:$('#connection-url').value,model:$('#connection-model').value,apiKey:$('#connection-key').value,clearKey:$('#connection-clear').checked,reasoning:$('#connection-reasoning').value});$('#connection-key').value='';await refreshConnections();modelData=await api('generation-settings');updateModelLabels();$('#connection-status').textContent='已保存。点击输入框下的生成或审校按钮选择模型。';}catch(e){$('#connection-status').textContent=e.message;}};
$('#library-source').onchange=()=>{threadRequest++;$('#thread-list').replaceChildren();showThreads();};
$('#new-course').onclick=()=>{$('#new-course-dialog').showModal();$('#new-course-title').focus();};
$('#new-course-close').onclick=()=>$('#new-course-dialog').close();
$('#new-course-form').onsubmit=async e=>{e.preventDefault();try{saveView();const result=await api('new-course',{title:$('#new-course-title').value});location.assign(result.url);}catch(e){toast(e.message);}};
$('#dsh-import-open').onclick=()=>$('#dsh-file').click();
$('#dsh-import-open').title='在 DSH 下载会话日志，解压 ZIP 后选择 session.v4.jsonl；只导入完成问答，不导入工具和思考';
$('#dsh-file').onchange=async()=>{const file=$('#dsh-file').files[0];if(!file)return;try{if(file.size>16000000)throw Error('请选择小于 16 MB 的解压后 JSONL 日志');$('#thread-message').textContent='正在导入 DSH 问答…';saveView();const result=await api('import-dsh',{text:await file.text(),title:'DSH 导入课程'});location.assign(result.url);}catch(e){$('#thread-message').textContent=e.message;}finally{$('#dsh-file').value='';}};
// Answer mode is explicit; selecting direct mode never invokes the review provider.
function answerButtonText(){return ({preview:'生成请求预览 ↗',direct:'直接回答 ↗',review:'生成并审校 ↗'})[$('#generation-mode').value];}
function setAnswerMode(value){$('#generation-mode').value=value;localStorage.setItem('canvas-answer-mode',value);$('#answer-picker').textContent=({preview:'仅预览上下文',direct:'直接回答',review:'生成并审校'})[value]+' ▾';$('#send').textContent=answerButtonText();document.querySelectorAll('[data-answer]').forEach(b=>b.setAttribute('aria-checked',b.dataset.answer===value));$('#review-settings').classList.toggle('review-off',value==='direct');$('#review-settings').title=value==='direct'?'当前不启用审校；点击可编辑保留的审校设置':'编辑审校模型和提示词';}
function closeAnswerMenu(focus=false){$('#answer-menu').hidden=true;$('#answer-picker').setAttribute('aria-expanded','false');if(focus)$('#answer-picker').focus();}
$('#answer-picker').onclick=()=>{const open=$('#answer-menu').hidden;$('#answer-menu').hidden=!open;$('#answer-picker').setAttribute('aria-expanded',String(open));if(open)$('#answer-menu [aria-checked=true]').focus();};
document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{setAnswerMode(b.dataset.answer);closeAnswerMenu(true);});
$('#answer-menu').onkeydown=e=>{const items=[...document.querySelectorAll('[data-answer]')],i=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closeAnswerMenu(true);}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(e.key==='Tab')closeAnswerMenu();};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.answer-picker'))closeAnswerMenu();});
setAnswerMode(['preview','direct','review'].includes(localStorage.getItem('canvas-answer-mode'))?localStorage.getItem('canvas-answer-mode'):'preview');
$('#target-label').onclick=()=>{mode='main';labels();$('#question').focus();};
function toggleReviewFields(){for(const id of ['review-model','review-effort','review-prompt'])$('#'+id).disabled=!$('#review-enabled').checked;}
$('#review-enabled').onchange=toggleReviewFields;

const readingDefaults={font:'system',size:16,line:1.8,card:14};
let reading={...readingDefaults};try{reading={...reading,...JSON.parse(localStorage.getItem('canvas-reading')||'{}')};}catch{}
function applyReading(){const fonts={system:'system-ui, sans-serif',sans:'"Microsoft YaHei", sans-serif',serif:'"SimSun", serif'},root=document.documentElement.style;root.setProperty('--reading-font',fonts[reading.font]||fonts.system);root.setProperty('--reading-size',reading.size+'px');root.setProperty('--reading-line',reading.line);root.setProperty('--card-size',reading.card+'px');for(const k of ['size','line','card']){$('#reading-'+k).value=reading[k];$('#reading-'+k+'-value').textContent=reading[k]+(k==='line'?'':' px');}$('#reading-font').value=reading.font;localStorage.setItem('canvas-reading',JSON.stringify(reading));}
for(const k of ['font','size','line','card'])$('#reading-'+k).oninput=e=>{reading[k]=k==='font'?e.target.value:Number(e.target.value);applyReading();};
$('#reading-open').onclick=()=>$('#reading-dialog').showModal();$('#reading-close').onclick=()=>$('#reading-dialog').close();$('#reading-reset').onclick=()=>{reading={...readingDefaults};applyReading();};applyReading();

let summaryPath=null,summaryRecord=null,summaryWorking=false;
function summaryMessage(message){$('#summary-status').textContent=message;}
async function loadSummary(){const info=await api('summary-status',summaryPath);$('#summary-enabled').checked=info.settings.enabled;$('#summary-keep').value=info.settings.keepRecent;summaryRecord=info.record;$('#summary-text').value=info.record?.text||'';$('#summary-apply').disabled=!summaryRecord;summaryMessage(`当前路径 ${info.total} 轮，较早历史 ${info.older} 轮。`+(info.record?`已保存摘要覆盖 ${info.record.coveredIds.length} 轮。`:'尚无适用摘要，仍发送完整历史。'));}
$('#summary-open').onclick=async()=>{summaryPath={mode,ids:mode==='branch'?[active]:[...selected]};$('#summary-path').textContent=mode==='main'?'当前路径：主线':mode==='branch'?'当前路径：所选节点分支':'当前路径：关联节点';$('#summary-dialog').showModal();try{await loadSummary();}catch(e){summaryMessage(e.message);}};
$('#summary-close').onclick=()=>$('#summary-dialog').close();
$('#summary-settings-save').onclick=async()=>{if(summaryWorking)return;try{state=await api('summary-settings',{enabled:$('#summary-enabled').checked,keepRecent:Number($('#summary-keep').value)});await loadSummary();}catch(e){summaryMessage(e.message);}};
$('#summary-generate').onclick=async()=>{if(summaryWorking)return;summaryWorking=true;$('#summary-generate').disabled=true;$('#summary-apply').disabled=true;$('#summary-settings-save').disabled=true;summaryMessage('正在生成摘要预览，原摘要仍保留…');try{const record=await api('summary-generate',summaryPath);summaryRecord=record;$('#summary-text').value=record.text;summaryMessage(`预览覆盖较早 ${record.coveredIds.length} 轮。可编辑，点击“确认应用摘要”后生效。`);}catch(e){summaryMessage('生成失败，继续使用原有上下文：'+e.message);}finally{summaryWorking=false;$('#summary-generate').disabled=false;$('#summary-settings-save').disabled=false;$('#summary-apply').disabled=!summaryRecord;}};
$('#summary-apply').onclick=async()=>{if(!summaryRecord||summaryWorking)return;try{state=await api('summary-save',{id:summaryRecord.id,text:$('#summary-text').value});summaryMessage('摘要已保存；仅影响后续请求，原始问答与历史节点保持不变。');}catch(e){summaryMessage(e.message);}};

import {contextFor} from './core.mjs';
export function importThread(state,thread){
 if(state.sourceThreadId&&state.sourceThreadId!==thread.id)throw Error('聊天 ID 不匹配');
 if(!state.sourceThreadId&&state.nodes.length)throw Error('请使用独立聊天画布');
 state.sourceThreadId=thread.id;state.title=thread.name||'聊天学习画布';
 let previous=null,added=0;
 for(const turn of thread.turns){
  if(turn.status!=='completed')continue;
  const question=turn.items.filter(i=>i.type==='userMessage').flatMap(i=>i.content.map(c=>c.type==='text'?c.text:c.type==='image'||c.type==='localImage'?'[图片附件]':'')).filter(Boolean).join('\n\n');
  const answer=turn.items.filter(i=>i.type==='agentMessage'&&i.phase==='final_answer').map(i=>i.text).join('\n\n');
  if(!question||!answer)continue;
  const id=`import:${turn.id}`,existing=state.nodes.find(n=>n.id===id);
  if(existing){previous=id;continue;}
  const parents=previous?[previous]:[],context=contextFor(state,parents,'continue');
  const parent=state.nodes.find(n=>n.id===previous);let x=parent?parent.x+440:60,y=parent?.y??60;
  while(state.nodes.some(n=>Math.abs(n.x-x)<350&&Math.abs(n.y-y)<270))y+=340;
  state.nodes.push({id,question,answer,kind:'main',parents,context,directFiles:[],status:'imported',sourceTurnId:turn.id,x,y});
  previous=id;added++;
 }
 if(previous&&!state.mainSelection&&(!state.mainHead||state.mainHead===state.importHead))state.mainHead=previous;
 state.importHead=previous;return {state,added};
}


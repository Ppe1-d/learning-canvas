// 读取 DSH 导出 ZIP 中的逻辑 v4 JSONL，不解析原始压缩日志或恢复工具状态。
// 仅收录已完成轮次的用户提问和最后文本回答，过滤注入消息与工具调用。
export function parseDshExport(text){
 const [header,...events]=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()).map(JSON.parse);
 if(header?.type!=='session'||header.version!==4||typeof header.id!=='string')throw Error('请选择 DSH 导出 ZIP 解压后的 session.v4.jsonl；不支持原始压缩日志或旧版日志');
 const turns=[];let current=null;
 const texts=message=>(message?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
 for(const e of events){const d=e.data||{};
  if(e.type==='turn/start')current={id:String(d.turn),question:[],answer:''};
  if(!current)continue;
  if(e.type==='user/message'&&d.source?.kind==='user'&&(!e.surfaceOp||e.surfaceOp==='append'))current.question.push(texts(d));
  if(e.type==='assistant/message'&&String(d.turn)===current.id&&!d.interrupted&&(!e.surfaceOp||e.surfaceOp==='append')&&!d.message?.content?.some(b=>b.type==='tool-call'))current.answer=texts(d.message);
  if(e.type==='turn/end'&&String(d.turn)===current.id){if(d.reason?.kind==='completed'&&current.question.join('').trim()&&current.answer.trim())turns.push({id:current.id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:current.question.join('\n\n')}]},{type:'agentMessage',phase:'final_answer',text:current.answer}]});current=null;}
 }
 if(!turns.length)throw Error('文件中没有可导入的完整问答');
 return {id:'dsh:'+header.id,name:'DSH 导入课程',turns};
}

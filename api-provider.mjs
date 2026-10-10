import {randomUUID} from 'node:crypto';
// OpenAI 兼容的文本接口适配层：只发送问答，不提供或执行工具。
export function normalizeProfile(input,previous){
 const baseUrl=String(input.baseUrl||'').trim().replace(/\/+$/,'');const url=new URL(baseUrl);
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('接口地址请使用 HTTPS，本机接口可使用 HTTP；不要在地址里填写密钥');
 const name=String(input.name||'').trim(),model=String(input.model||'').trim();if(!name||!model)throw Error('请填写服务名称和模型 ID');
 const reasoning=input.reasoning||'none';if(!['none','effort','deepseek'].includes(reasoning))throw Error('未知思考参数类型');
 // 修改地址时不能自动沿用旧密钥，避免把凭据发送给另一个服务。
 if(previous?.apiKey&&previous.baseUrl!==baseUrl&&!input.apiKey&&!input.clearKey)throw Error('更换接口地址时请重新填写密钥，或明确清除密钥');
 return {id:previous?.id||randomUUID(),name,baseUrl,model,reasoning,apiKey:input.clearKey?'':String(input.apiKey||previous?.apiKey||'')};
}
// 浏览器仅获知是否已配置密钥；明文密钥保留在服务端的本地配置文件。
export function publicProfile({apiKey,...profile}){return {...profile,hasKey:!!apiKey};}
export function buildBody(prompt,profile,effort){
 const body={model:profile.model,messages:[{role:'user',content:prompt}],stream:false};
 if(profile.reasoning==='effort'&&effort!=='default')body.reasoning_effort=effort;
 if(profile.reasoning==='deepseek'&&effort!=='default'){body.thinking={type:effort==='none'?'disabled':'enabled'};if(effort!=='none')body.reasoning_effort=effort;}
 return body;
}
export async function apiRequest(prompt,profile,effort,fetcher=fetch){
 const endpoint=profile.baseUrl.endsWith('/chat/completions')?profile.baseUrl:profile.baseUrl+'/chat/completions';
 let response;try{response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(profile.apiKey?{Authorization:'Bearer '+profile.apiKey}:{})},body:JSON.stringify(buildBody(prompt,profile,effort)),signal:AbortSignal.timeout(300000),redirect:'error'});}catch{throw Error('API 连接失败或超时，请检查接口地址、网络和服务状态');}
 if(!response.ok)throw Error(`API 返回 HTTP ${response.status}，请检查密钥、模型与请求限制`);
 let result;try{result=await response.json();}catch{throw Error('API 未返回有效 JSON');}
 // 工具请求、截断回答和 reasoning 内容都不能作为可继续学习的最终答案。
 const choice=result.choices?.[0];if(choice?.message?.tool_calls?.length||choice?.message?.function_call)throw Error('API 返回了工具请求；画布不执行工具');
 if(choice?.finish_reason!=='stop')throw Error('回答未正常完成（可能达到长度限制），未作为最终答案保存');
 const answer=choice.message?.content;if(typeof answer!=='string'||!answer.trim())throw Error('API 未返回文本答案');return answer;
}

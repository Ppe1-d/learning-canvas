import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadState,saveState} from './core.mjs';import {listModels} from './model-catalog.mjs';import {codexRequest} from './codex-provider.mjs';import {normalizeProfile,publicProfile,apiRequest} from './api-provider.mjs';
const file=process.env.CANVAS_CONNECTIONS_FILE||path.join(process.env.CANVAS_DATA_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'data'),'connections.json');
export const profiles=async()=>await loadState(file)||[];
export const connections=async()=> (await profiles()).map(publicProfile);
export async function saveConnection(input){const all=await profiles();const previous=all.find(p=>p.id===input.id);if(input.id&&!previous)throw Error('服务不存在');const profile=normalizeProfile(input,previous);await saveState(file,[...all.filter(p=>p.id!==profile.id),profile]);return publicProfile(profile);}
// 独立模式不探测 Codex；只有用户启用后才加载它的模型目录。
export async function catalog(includeCodex=false,refresh=false){
 const all=await profiles();let models=[],codexError='';if(includeCodex)try{models=await listModels(refresh);}catch{codexError='Codex 模型暂不可用；仍可使用已配置的 API';}
 for(const p of all){const efforts=p.reasoning==='none'?['default']:p.reasoning==='deepseek'?['default','none','low','high','max']:['default','none','minimal','low','medium','high','xhigh'];models.push({model:'api:'+p.id,displayName:p.name+' / '+p.model,providerId:p.id,apiModel:p.model,baseUrl:p.baseUrl,reasoning:p.reasoning,defaultReasoningEffort:'default',supportedReasoningEfforts:efforts.map(reasoningEffort=>({reasoningEffort}))});}
 return {models,codexError};
}
// 节点保存服务身份和参数快照，不保存密钥。重试时核对快照，避免静默换服务。
export async function requestText(prompt,settings){if(!settings.providerId)return codexRequest(prompt,settings);const p=(await profiles()).find(p=>p.id===settings.providerId);if(!p)throw Error('该节点使用的 API 服务已不存在');if(p.baseUrl!==settings.baseUrl||p.model!==settings.apiModel||p.reasoning!==settings.reasoning)throw Error('该节点的 API 配置已改变，请恢复原配置后重试，或创建新节点');return apiRequest(prompt,p,settings.effort);}

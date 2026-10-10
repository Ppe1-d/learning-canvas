export const prompts={
 draft:'用中文回答学习者的问题。依据课程规则、历史和资料，连贯讲清当前小主题。交代必要术语、前提和新语法，以具体例子解释机制；避免重复总结和无关扩展。遵循学习者的篇幅与文风要求。',
 review:'独立审校草稿，检查知识错误、推理漏洞、遗漏前提、代码语义和边界条件，并检查是否符合原问题及课程文风。保留正确内容，修正问题，输出完整最终回答。不要输出审校过程，不把草稿作为事实证据，不声称执行过实际未执行的验证。'
};
export function defaultGeneration(models=[]){const m=models.find(m=>m.isDefault)||models[0];const efforts=m?.supportedReasoningEfforts.map(e=>e.reasoningEffort)||[];return {draft:{model:m?.model||'',effort:efforts.includes('medium')?'medium':m?.defaultReasoningEffort||efforts[0]||'',prompt:prompts.draft},review:{model:'same',effort:efforts.includes('low')?'low':efforts[0]||'',prompt:prompts.review}};}
// 将“同生成模型”解析为具体模型，并冻结两阶段各自的提示词及服务参数。
// 密钥不进入这份快照；执行请求时由服务端读取当前密钥。
export function resolveGeneration(config,models){
 const result=structuredClone(config);
 for(const stage of ['draft','review']){
  const value=result?.[stage];if(!value)throw Error('缺少阶段设置');
  const id=stage==='review'&&value.model==='same'?result.draft.model:value.model;
  const model=models.find(m=>m.model===id);if(!model)throw Error('模型当前不可用，请刷新模型列表并重新选择');
  if(!model.supportedReasoningEfforts.some(e=>e.reasoningEffort===value.effort))throw Error(`${model.displayName||id} 不支持 ${value.effort} 思考强度`);
  if(typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>20000)throw Error('每阶段提示词需为 1–20000 个字符');
  result[stage]={model:id,effort:value.effort,prompt:value.prompt,...(model.providerId?{providerId:model.providerId,apiModel:model.apiModel,baseUrl:model.baseUrl,reasoning:model.reasoning}:{})};
 }
 return result;
}

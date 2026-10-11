import {resolveCodex,codexStartError} from './codex-binary.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Let the official CLI manage authentication; never read or copy its credentials.
export function modelArgs(settings={}){return [...(settings.model?['--model',settings.model]:[]),...(settings.effort?['-c',`model_reasoning_effort=${JSON.stringify(settings.effort)}`]:[])];}
export async function codexRequest(prompt,settings={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'learning-canvas-'));
 const output=path.join(dir,'answer.txt');
 const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--color','never','-C',dir,'-o',output,
  '-c','project_doc_max_bytes=0','-c','web_search="disabled"','-c','approval_policy="never"',
  '--disable','shell_tool','--disable','apps','--disable','browser_use','--disable','computer_use','--disable','multi_agent',
  '--enable','skip_host_skill_discovery',...modelArgs(settings),'-'];
 const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
 try{
  await new Promise((resolve,reject)=>{
   const child=spawn(resolveCodex(),args,{env,windowsHide:true,stdio:['pipe','ignore','pipe']});
   let error='';const timer=setTimeout(()=>{child.kill();reject(Error('模型请求超过 5 分钟，请稍后重试。'));},300000);
   child.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-3000);});
   child.on('error',e=>{clearTimeout(timer);reject(Error('无法启动 Codex CLI：'+e.message));});
   child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Codex 调用失败：'+error.slice(-900)));});
   child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
  const answer=await readFile(output,'utf8');if(!answer.trim())throw Error('模型未返回文本');return answer;
 }finally{await unlink(output).catch(()=>{});await rmdir(dir).catch(()=>{});}
}

import {openThread,openBrowser} from './launcher.mjs';
const id=process.env.CODEX_THREAD_ID;
if(!id)throw Error('请从目标 Codex 聊天启动画布');
const result=await openThread(id);
if(!process.argv.includes('--no-browser'))await openBrowser(result.url);
console.log(JSON.stringify(result));

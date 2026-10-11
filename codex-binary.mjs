import {existsSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
// 双击启动不一定继承桌面端的 PATH。仅检查程序安装目录，不读取登录凭据。
export function resolveCodex(env=process.env,platform=process.platform){
 if(env.CANVAS_CODEX_BIN)return env.CANVAS_CODEX_BIN;
 const name=platform==='win32'?'codex.exe':'codex';
 for(const dir of (env.PATH||env.Path||'').split(platform==='win32'?';':':').filter(Boolean)){
  const candidate=path.join(dir,name);if(existsSync(candidate))return candidate;
 }
 if(platform==='win32'&&env.LOCALAPPDATA){
  const root=path.join(env.LOCALAPPDATA,'OpenAI','Codex','bin');
  if(existsSync(root)){
   const candidates=readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(root,e.name,name)).filter(existsSync);
   candidates.sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);if(candidates.length)return candidates[0];
  }
 }
 return 'codex';
}
export function codexStartError(error){return error.code==='ENOENT'?Error('未找到 Codex CLI。请安装并登录 Codex，或设置 CANVAS_CODEX_BIN 为 codex.exe 的完整路径；本地画布仍可使用。'):error;}

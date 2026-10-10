import { readFile, writeFile, rename, mkdir, realpath, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const excluded=new Set(['.git','.codex','.agents','node_modules','dist','build','__pycache__','.venv','learning-canvas']);
const textExtensions=new Set(['.md','.txt','.c','.cpp','.cc','.h','.hpp','.py','.js','.ts','.json','.html','.css']);
const ruleName=/^AGENTS(?:\.override)?\.md$/i;
const sensitiveName=/^(?:credentials|auth|secrets?)(?:\.[^.]+)?$|^id_(?:rsa|ed25519|ecdsa)(?:\.pub)?$/i;
const fingerprint=text=>createHash('sha256').update(text).digest('hex');

export function contextFor(state,ids,mode){
 const nodes=[...new Set(ids)].map(id=>state.nodes.find(n=>n.id===id));
 if(nodes.some(n=>!n)) throw new Error('引用节点不存在');
 if(nodes.some(n=>['drafting','reviewing','review_failed','generation_failed'].includes(n.status)))throw new Error('引用节点尚无最终答案');
 const unique=list=>[...new Map(list.map(item=>[item.id??`${item.path}:${item.version}:${item.start}`,item])).values()];
 if(mode==='combine') {
  if(nodes.length<2)throw new Error('关联提问至少两个不同节点');
  nodes.sort((a,b)=>state.nodes.indexOf(a)-state.nodes.indexOf(b));
  const files=unique(nodes.flatMap(n=>n.directFiles??[]));
  return {turns:nodes.map(n=>({id:n.id,question:n.question,answer:n.answer})),files,rules:[],notes:[],scopedRules:unique(nodes.flatMap(n=>(n.context.scopedRules??[]).filter(r=>(n.directFiles??[]).some(f=>f.path.startsWith(r.scope+'/')))))};
 }
 const parent=nodes[0];
 if(!parent) return {turns:[],files:[],rules:[],scopedRules:[],notes:[]};
 return structuredClone({...parent.context,turns:[...parent.context.turns,{id:parent.id,question:parent.question,answer:parent.answer}]});
}
export async function safePath(root,relative){
 const base=await realpath(root), candidate=path.resolve(base,relative);
 const inRoot=target=>{const rel=path.relative(base,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
 if(!inRoot(candidate)) throw new Error('文件路径超出绑定目录');
 const resolved=await realpath(candidate);
 if(!inRoot(resolved)) throw new Error('链接指向绑定目录之外');
 return resolved;
}
export async function readRules(root,mode,custom){
 if(mode==='off') return [];
 if(mode==='custom') return custom.trim()?[{path:'课程专用规则',text:custom,version:fingerprint(custom),scope:'.'}]:[];
 if(!root) return [];
 for(const name of ['AGENTS.override.md','AGENTS.md']){
  try {const text=await readFile(await safePath(root,name),'utf8');if(text.trim()) return [{path:name,text,version:fingerprint(text),scope:'.'}];}
  catch(e){if(e.code!=='ENOENT') throw e;}
 }
 return [];
}
export async function scopedRules(root,file){
 const parts=path.dirname(file).split(/[\\/]/).filter(p=>p!=='.');const result=[];
 for(let i=1;i<=parts.length;i++){
  const dir=parts.slice(0,i).join('/');
  for(const name of ['AGENTS.override.md','AGENTS.md']){
   const rel=`${dir}/${name}`;
   try {const text=await readFile(await safePath(root,rel),'utf8');if(text.trim()){result.push({path:rel,text,version:fingerprint(text),scope:dir});break;}}
   catch(e){if(e.code!=='ENOENT')throw e;}
  }
 }
 return result;
}
export async function searchFiles(root,query){
 if(!root)return {files:[],scanned:0,notice:'尚未绑定资料目录'};
 const tokens=[...new Set((query.toLowerCase().match(/[a-z0-9_+#]{2,}|[\u4e00-\u9fff]{2,}/g)??[]).flatMap(t=>/^[\u4e00-\u9fff]+$/.test(t)?[t,...Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2))]:[t]))];
 const candidates=[];let scanned=0,notice='',skipped=0;
 async function walk(relative=''){
  for(const entry of await readdir(await safePath(root,relative),{withFileTypes:true})){
   if(scanned>=600){notice='本次检索达到 600 个文本文件上限；请绑定更具体的目录。';return;}
   if(entry.isSymbolicLink()||excluded.has(entry.name.toLowerCase())||entry.name.startsWith('.')||ruleName.test(entry.name)||sensitiveName.test(entry.name))continue;
   const rel=path.join(relative,entry.name);
   if(entry.isDirectory()){await walk(rel);continue;}
   if(!entry.isFile()||!textExtensions.has(path.extname(entry.name).toLowerCase())){skipped++;continue;}
   let absolute;
   try{absolute=await safePath(root,rel);}catch{skipped++;continue;}
   if((await stat(absolute)).size>256_000){skipped++;continue;}
   scanned++;const text=await readFile(absolute,'utf8');const lower=text.toLowerCase(), name=rel.toLowerCase();
   const score=tokens.reduce((sum,t)=>sum+(name.includes(t)?8:0)+(lower.includes(t)?1:0),0);
   if(!score)continue;
   const lines=text.split(/\r?\n/);let match=lines.findIndex(l=>tokens.some(t=>l.toLowerCase().includes(t)));
   const start=Math.max(0,match-3),end=Math.min(lines.length,start+35);
   candidates.push({path:rel.replaceAll('\\','/'),text:lines.slice(start,end).join('\n'),start:start+1,end,version:fingerprint(text),readAt:new Date().toISOString(),score});
  }
 }
 await walk();
 return {files:candidates.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,4),scanned,notice:[notice,skipped?`${skipped} 项非文本、过大或不可访问资料未读取。`:''].filter(Boolean).join(' ')};
}
export async function saveState(file,state){await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(state,null,2),'utf8');await rename(file+'.tmp',file);}
export async function loadState(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

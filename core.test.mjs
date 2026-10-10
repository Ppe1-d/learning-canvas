import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contextFor, readRules, searchFiles, safePath, saveState, loadState } from './core.mjs';

test('branch context never leaks into main; historical branches freeze', () => {
  const a={id:'a',question:'指针',answer:'主线第一节',context:{turns:[],files:[],rules:[]}};
  const b={id:'b',question:'旁支秘密',answer:'只用英文',context:{turns:[{id:'a',question:a.question,answer:a.answer}],files:[],rules:[]}};
  const c={id:'c',question:'下一节',answer:'主线第二节',context:{turns:[{id:'a',question:a.question,answer:a.answer}],files:[],rules:[]}};
  const state={nodes:[a,b,c]};
  assert.deepEqual(contextFor(state,['c'],'continue').turns.map(t=>t.id),['a','c']);
  assert.deepEqual(contextFor(state,['a'],'branch').turns.map(t=>t.id),['a']);
  assert.deepEqual(contextFor(state,['b','c','b'],'combine').turns.map(t=>t.id),['b','c']);
});
test('disabled rules are neither loaded nor retrieved as lesson material', async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'canvas-test-'));
  try {
    await writeFile(path.join(root,'AGENTS.md'),'指针 教学规则');
    await writeFile(path.join(root,'lesson.md'),'指针保存对象地址。');
    await writeFile(path.join(root,'credentials.json'),'{"secret":"指针 test-only"}');
    assert.deepEqual(await readRules(root,'off',''),[]);
    const result=await searchFiles(root,'指针');
    assert.deepEqual(result.files.map(f=>f.path),['lesson.md']);
    assert.equal((await readRules(root,'full',''))[0].text,'指针 教学规则');
    await writeFile(path.join(root,'AGENTS.override.md'),'新的教学规则');
    assert.equal((await readRules(root,'full',''))[0].text,'新的教学规则');
  } finally {await rm(root,{recursive:true,force:true});}
});
test('path traversal is rejected and state survives reload',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'canvas-test-'));
 try {
  await assert.rejects(safePath(root,'../outside.txt'));
  await mkdir(path.join(root,'notes'));
  await writeFile(path.join(root,'notes','a.md'),'old');
  assert.equal(await safePath(root,'notes/a.md'),path.join(root,'notes','a.md'));
  const db=path.join(root,'state.json');
  await saveState(db,{nodes:[{id:'a',answer:'saved'}]});
  assert.equal((await loadState(db)).nodes[0].answer,'saved');
 } finally {await rm(root,{recursive:true,force:true});}
});
test('branch preserves rule snapshots; combine is explicit and stable',()=>{
 const scoped={path:'sub/AGENTS.md',text:'old rules',version:'v1',scope:'sub'};
 const file={path:'sub/a.md',version:'v1',start:1,text:'lesson'};
 const a={id:'a',question:'a',answer:'a',directFiles:[file],context:{turns:[],files:[file],rules:[],scopedRules:[scoped],ruleMode:'full',notes:[{text:'unselected historical note'}]}};
 const b={id:'b',question:'b',answer:'b',directFiles:[],context:{turns:[],files:[],rules:[],notes:[]}};
 const state={nodes:[a,b]};
 const branch=contextFor(state,['a'],'branch');
 assert.deepEqual(branch.scopedRules,[scoped]);assert.equal(branch.ruleMode,'full');
 const mixed=contextFor(state,['b','a'],'combine');
 assert.deepEqual(mixed.turns.map(t=>t.id),['a','b']);assert.deepEqual(mixed.notes,[]);
 assert.throws(()=>contextFor(state,['a'],'combine'),/至少两个/);
});

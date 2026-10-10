import test from 'node:test';import assert from 'node:assert/strict';import {importThread} from './thread-import.mjs';
const turn=id=>({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'问题'+id}]},{type:'agentMessage',phase:'commentary',text:'不导入'},{type:'agentMessage',phase:'final_answer',text:'回答'+id}]});
test('thread imports only completed final answers, incrementally preserving branches and layout',()=>{
 const s={nodes:[],mainHead:null},t={id:'t',turns:[turn('1'),{...turn('2'),status:'inProgress'}]};
 assert.equal(importThread(s,t).added,1);assert.equal(s.nodes[0].answer,'回答1');s.nodes[0].x=123;
 s.nodes.push({id:'branch',parents:['import:1'],x:400,y:500,kind:'branch'});
 assert.equal(importThread(s,t).added,0);t.turns[1].status='completed';assert.equal(importThread(s,t).added,1);
 assert.equal(s.nodes[0].x,123);assert.equal(s.nodes.length,3);assert.deepEqual(s.nodes[2].parents,['import:1']);assert.equal(s.nodes[2].context.turns[0].answer,'回答1');
 assert.throws(()=>importThread(s,{id:'other',turns:[]}));
});

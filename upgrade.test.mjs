import test from 'node:test';
import assert from 'node:assert/strict';
import {arrange,ports,isVisible} from './public/geometry.mjs';
import {reviewAnswer} from './review.mjs';
import {contextFor} from './core.mjs';
test('layout keeps parent before child and all rectangles separate in both orientations',()=>{
 const nodes=[{id:'a',parents:[],kind:'main'},{id:'b',parents:['a'],kind:'main'},{id:'c',parents:['a'],kind:'branch'},{id:'d',parents:['b','c'],kind:'combine'}];
 for(const dir of ['horizontal','vertical']){const out=arrange(nodes,dir);for(const n of out)for(const id of n.parents){const p=out.find(x=>x.id===id);assert.ok(dir==='horizontal'?n.x>p.x:n.y>p.y);}for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++)assert.ok(Math.abs(out[i].x-out[j].x)>=320||Math.abs(out[i].y-out[j].y)>=240);}
});
test('ports sit on card boundary and visibility handles negative world coordinates',()=>{const a={x:-500,y:0},b={x:100,y:0};assert.deepEqual(ports(a,b,'horizontal').from,[-180,120]);assert.equal(isVisible(a,{x:500,y:0},1,400,400),true);assert.equal(isVisible({x:5000,y:0},{x:0,y:0},1,400,400),false);});
test('two independent calls preserve only revised answer as next context',async()=>{const calls=[];const result=await reviewAnswer({question:'问题',context:{turns:[],rules:[],files:[],notes:[]}},async p=>{calls.push(p);return calls.length===1?'错误草稿':'修订答案';});assert.equal(calls.length,2);assert.match(calls[1],/错误草稿/);assert.equal(result.answer,'修订答案');const next=contextFor({nodes:[{id:'a',question:'问题',...result,context:{turns:[],files:[],rules:[],notes:[]}}]},['a'],'branch');assert.equal(next.turns[0].answer,'修订答案');assert.ok(!JSON.stringify(next).includes('错误草稿'));});
test('review failure retains draft but has no final answer',async()=>{let n=0;const r=await reviewAnswer({question:'问题',context:{}},async()=>{if(n++)throw Error('offline');return '草稿';});assert.equal(r.status,'review_failed');assert.equal(r.answer,'');assert.equal(r.draft,'草稿');});
test('unreviewed nodes cannot become context and retry does not regenerate draft',async()=>{assert.throws(()=>contextFor({nodes:[{id:'a',status:'review_failed'}]},['a'],'branch'));let calls=0;const r=await reviewAnswer({question:'q',context:{}},async()=>{calls++;return 'final';},()=>{},'saved draft');assert.equal(calls,1);assert.equal(r.draft,'saved draft');});

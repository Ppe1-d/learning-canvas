import test from 'node:test';import assert from 'node:assert/strict';
import {makeSummary,compactContext} from './summary.mjs';
const turns=Array.from({length:12},(_,i)=>({id:String(i),question:'q'+i,answer:'a'+i}));
test('summary keeps recent full turns and original context; disabled uses all history',()=>{
 const context={turns,files:[{text:'source'}],rules:[],notes:[]};const record=makeSummary(turns.slice(0,4),'进度与结论');
 const result=compactContext(context,{enabled:true,keepRecent:8,records:[record]});
 assert.equal(result.turns.length,8);assert.equal(result.summary.text,'进度与结论');assert.equal(context.turns.length,12);assert.deepEqual(result.files,context.files);
 assert.equal(compactContext(context,{enabled:false,keepRecent:8,records:[record]}).turns.length,12);
});
test('summary cannot cross branches, changed answers, or the recent-turn boundary',()=>{
 const record=makeSummary(turns.slice(0,4),'summary');const settings={enabled:true,keepRecent:8,records:[record]};
 const changed=structuredClone(turns);changed[0].answer='changed';assert.equal(compactContext({turns:changed},settings).turns.length,12);
 const branch=structuredClone(turns);branch[0].id='other';assert.equal(compactContext({turns:branch},settings).turns.length,12);
 assert.equal(compactContext({turns}, {...settings,keepRecent:10}).turns.length,12);
});

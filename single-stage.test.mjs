import test from 'node:test';import assert from 'node:assert/strict';
import {reviewAnswer} from './review.mjs';import {resolveGeneration} from './generation.mjs';
test('direct answer performs one request and needs no review model',async()=>{
 const model={model:'only',supportedReasoningEfforts:[{reasoningEffort:'low'}]};
 const config=resolveGeneration({reviewEnabled:false,draft:{model:'only',effort:'low',prompt:'answer'},review:{model:'unavailable',effort:'bad',prompt:''}},[model]);
 let calls=0;const result=await reviewAnswer({question:'q'},async()=>{calls++;return 'FINAL';},()=>{},'',config);
 assert.equal(calls,1);assert.equal(result.answer,'FINAL');assert.equal(result.reviewed,false);assert.equal(result.draft,'');assert.equal(result.status,'complete');
});

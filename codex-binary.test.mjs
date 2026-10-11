import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveCodex} from './codex-binary.mjs';
test('Windows standalone locates desktop Codex without PATH; explicit override wins',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'canvas-bin-'));
 try{const bin=path.join(dir,'OpenAI','Codex','bin','test-build','codex.exe');await mkdir(path.dirname(bin),{recursive:true});await writeFile(bin,'');
 assert.equal(resolveCodex({LOCALAPPDATA:dir,PATH:''},'win32'),bin);
 assert.equal(resolveCodex({LOCALAPPDATA:dir,PATH:'',CANVAS_CODEX_BIN:'chosen-cli'},'win32'),'chosen-cli');
 }finally{await rm(dir,{recursive:true,force:true});}
});

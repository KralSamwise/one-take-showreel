import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {create} from '../scripts/create.mjs';
test('all six formats scaffold from a clean target',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'showreel-test-'));
 try{for(const d of [6,15,30])for(const a of ['16:9','9:16']){
  const dest=path.join(tmp,`${d}-${a.replace(':','-')}`);const r=create(dest,{brand:'Quoted "brand"',format:`${d}x${a}`});
  const html=fs.readFileSync(path.join(dest,'index.html'),'utf8');assert.ok(html.includes(`data-duration="${d}"`));assert.ok(html.includes(`data-width="${r.width}"`));
  assert.ok(fs.statSync(path.join(dest,'assets/vendor/gsap.min.js')).size>1000);
  assert.throws(()=>create(dest));
 }assert.throws(()=>create(path.join(tmp,'bad'),{format:'invalid'}));assert.ok(!fs.existsSync(path.join(tmp,'bad')));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

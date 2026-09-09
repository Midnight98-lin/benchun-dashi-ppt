import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
import {html,sceneFromHTML} from './editor-html.mjs';
import {validateScene} from './scene-schema.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'benchun-editor-api-'));
const scene={title:'保存验证',canvas:{width:1280,height:720},font:'Microsoft YaHei',slides:[{background:'#FFFDF8',layout:'test',elements:[{type:'text',text:'原始标题',x:64,y:100,w:900,h:120,size:40,color:'#174B3A',bold:true,align:'left'}]}]};
await fs.writeFile(path.join(dir,'scene.json'),JSON.stringify(scene));
let service=await startServer(dir,{port:0});
const checks=[];
try{
 const initial=await(await fetch(service.url+'/api/state')).json();
 const doc=await(await fetch(service.url)).text();const token=doc.match(/window\.__BENCHUN_SESSION__=(.*?);<\/script>/)[1];const session=JSON.parse(token);
 const post=(url,body,headers={})=>fetch(service.url+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:service.url,'X-Benchun-Token':session.token,...headers},body:JSON.stringify(body)});
 let res=await post('/api/save',{scene,revision:initial.revision},{Origin:'https://evil.example'});assert.equal(res.status,403);checks.push('cross-origin save rejected');
 res=await post('/api/save',{scene,revision:initial.revision},{'X-Benchun-Token':'wrong'});assert.equal(res.status,403);checks.push('invalid token rejected');
 const changed=structuredClone(scene);changed.slides[0].elements[0].text='修改后标题 </script><img src=x onerror=alert(1)>';
 changed.slides[0].elements[0].size=42;
 const sameBase=[await post('/api/save',{scene:changed,revision:initial.revision}),await post('/api/save',{scene,revision:initial.revision})];assert.equal(sameBase[0].status,200);assert.equal(sameBase[1].status,409);checks.push('saved revision and stale-tab conflict');
 const saved=JSON.parse(await fs.readFile(path.join(dir,'scene.json'),'utf8'));assert.deepEqual(saved,changed);
 assert.deepEqual(sceneFromHTML(await fs.readFile(path.join(dir,'index.html'),'utf8')),changed);checks.push('scene and self-contained HTML preserve exact edited text');
 const invalid=structuredClone(changed);invalid.slides[0].elements[0].x=-100;assert.throws(()=>validateScene(invalid));
 assert(!html(changed).includes('</script><img src=x'));checks.push('unsafe markup remains literal text');
 assert.equal((await fetch(service.url+'/download/../../scene.json')).status,404);checks.push('no arbitrary filesystem route');
 await service.close();service=await startServer(dir,{port:0});assert.deepEqual((await(await fetch(service.url+'/api/state')).json()).scene,changed);checks.push('restart persistence');
 console.log(JSON.stringify({pass:true,checks,testDirectory:dir},null,2));
}finally{await service.close();}

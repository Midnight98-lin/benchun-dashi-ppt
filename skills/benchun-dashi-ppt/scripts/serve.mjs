import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {html,sceneFromHTML} from './editor-html.mjs';
import {validateScene,revision} from './scene-schema.mjs';
import {auditScene} from './export-pdf.mjs';
const SCRIPTS=path.dirname(fileURLToPath(import.meta.url));
const MAX=64*1024*1024;
async function exists(p){try{await fs.access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function atomic(p,content){const tmp=p+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(tmp,content,{flag:'wx'});try{await fs.rename(tmp,p);}catch(e){await fs.unlink(tmp).catch(()=>{});throw e;}}
function run(script,args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(SCRIPTS,script),...args],{windowsHide:true,env:process.env});let logs='';child.stdout.on('data',b=>logs=(logs+b).slice(-24000));child.stderr.on('data',b=>logs=(logs+b).slice(-24000));const timer=setTimeout(()=>child.kill(),300000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(logs):reject(Error(`${script}: ${logs.slice(-2500)||'导出进程终止'}`));});});}
export async function startServer(directory,{port=5368}={}){
 const dir=await fs.realpath(directory),scenePath=path.join(dir,'scene.json');
 let scene=validateScene(JSON.parse(await fs.readFile(scenePath,'utf8'))),rev=revision(scene);
 const token=crypto.randomBytes(32).toString('hex'),jobs=new Map();let saveQueue=Promise.resolve(),exportActive=false;
 // A second server for the same document would have separate save queues.
 const lock=path.join(dir,'.editor.lock');
 if(await exists(lock)){
  const prior=JSON.parse(await fs.readFile(lock,'utf8'));let alive=true;try{process.kill(prior.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
  if(alive)throw Error('该演示已有编辑服务运行：'+(prior.url||prior.pid));
  await fs.unlink(lock);
 }
 const lockHandle=await fs.open(lock,'wx');await lockHandle.writeFile(JSON.stringify({pid:process.pid}));await lockHandle.close();
 let origin;
 const response=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
 async function body(req){let n=0,parts=[];for await(const chunk of req){n+=chunk.length;if(n>MAX)throw Error('文件超过 64 MB，请压缩图片后重试');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  if(req.headers.host!==new URL(origin).host)return response(res,403,{error:'仅允许本地编辑器地址'});
  const pathname=new URL(req.url,origin).pathname;
  try{
   if(req.method==='POST'){
    if(req.headers.origin!==origin||req.headers['x-benchun-token']!==token||!String(req.headers['content-type']).startsWith('application/json'))return response(res,403,{error:'编辑会话无效，请重新打开本地地址'});
    if(pathname==='/api/save'){
     const payload=await body(req);validateScene(payload.scene);
     const op=saveQueue.then(async()=>{
      const disk=validateScene(JSON.parse(await fs.readFile(scenePath,'utf8')));const diskRev=revision(disk);
      if(payload.revision!==diskRev){scene=disk;rev=diskRev;return response(res,409,{error:'其他窗口或程序已修改此文稿。请先下载 HTML 保留本窗口改动，再重新载入。',revision:diskRev});}
      const next=payload.scene,document=html(next),nextRev=revision(next);
      // One bounded previous-state backup, not an unbounded image history.
      await atomic(path.join(dir,'scene.previous.json'),JSON.stringify(disk));
      await atomic(scenePath,JSON.stringify(next));scene=next;rev=nextRev;
      // scene.json is the transaction authority; HTML is regenerated on startup and GET.
      let warning;try{await atomic(path.join(dir,'index.html'),document);}catch(e){warning='场景已保存，但 HTML 文件更新失败；请下载 HTML 或重启服务。';}
      response(res,200,{revision:rev,...(warning?{warning}:{})});
     });saveQueue=op.catch(()=>{});return await op;
    }
    if(pathname==='/api/export'){
     const p=await body(req);if(!['pptx','pdf'].includes(p.format))return response(res,400,{error:'不支持的导出格式'});
     await saveQueue;scene=validateScene(JSON.parse(await fs.readFile(scenePath,'utf8')));rev=revision(scene);
     if(p.revision!==rev)return response(res,409,{error:'请先保存最新修改，再导出'});
     if(exportActive)return response(res,429,{error:'已有导出正在进行，请完成后重试'});
     exportActive=true;const snapshot=JSON.parse(JSON.stringify(scene));const id=crypto.randomUUID();const job={status:'running',revision:rev,format:p.format};jobs.set(id,job);response(res,202,{id,revision:rev});
     (async()=>{
      const task=path.join(dir,'exports',id),input=path.join(task,'scene.json'),base=snapshot.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,90)||'本纯演示';
      try{
       await fs.mkdir(task,{recursive:true});await fs.writeFile(input,JSON.stringify(snapshot));
       await auditScene(snapshot);
       const output=path.join(task,'delivery',base+'.'+p.format);
       if(p.format==='pdf'){await auditScene(snapshot,{output});}
       else{
        const candidate=path.join(task,'candidate.pptx');
        await run('export-pptx.mjs',[input,candidate]);
        await run('finalize.mjs',[candidate,output,'--literal-workbooks','--scene',input]);
       }
       job.file=output;job.name=base+'.'+p.format;job.status='done';job.url='/download/'+id;
       await fs.writeFile(path.join(task,'export-receipt.json'),JSON.stringify({revision:job.revision,format:p.format,output,pages:snapshot.slides.length},null,2));
      }catch(e){job.status='error';job.error=e.message;}finally{exportActive=false;}
     })();return;
    }
    return response(res,404,{error:'未知操作'});
   }
   if(req.method!=='GET')return response(res,405,{error:'不支持的请求'});
   if(pathname==='/'||pathname==='/index.html'){
    const disk=validateScene(JSON.parse(await fs.readFile(scenePath,'utf8')));rev=revision(disk);scene=disk;
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});return res.end(html(scene,{session:{token,revision:rev}}));
   }
   if(pathname==='/api/state')return response(res,200,{scene:JSON.parse(await fs.readFile(scenePath,'utf8')),revision:revision(JSON.parse(await fs.readFile(scenePath,'utf8')))});
   if(pathname.startsWith('/api/jobs/')){const job=jobs.get(pathname.slice(10));if(!job)return response(res,404,{error:'未找到导出记录'});const {file,name,...publicJob}=job;return response(res,200,publicJob);}
   if(pathname.startsWith('/download/')){const j=jobs.get(pathname.slice(10));if(!j||j.status!=='done')return response(res,404,{error:'文件尚未就绪'});res.writeHead(200,{'Content-Type':j.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(j.name)}`});return res.end(await fs.readFile(j.file));}
   return response(res,404,{error:'未找到页面'});
  }catch(e){if(!res.headersSent)response(res,400,{error:e.message});else res.end();}
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(e){await fs.unlink(lock);throw e;}
 origin='http://127.0.0.1:'+server.address().port;
 await atomic(lock,JSON.stringify({pid:process.pid,url:origin}));await atomic(path.join(dir,'index.html'),html(scene));
 const close=()=>new Promise(resolve=>server.close(async()=>{await fs.unlink(lock).catch(()=>{});resolve();}));
 return {url:origin,server,close};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),directory=args[0],portIndex=args.indexOf('--port'),importIndex=args.indexOf('--import-html');
 if(!directory)throw Error('Usage: serve.mjs <presentation-dir> [--port 5368] [--import-html edited.html]');
 if(importIndex>=0){if(await exists(directory))throw Error('HTML 导入必须使用新的目录，不能覆盖现有文稿。');const imported=sceneFromHTML(await fs.readFile(args[importIndex+1],'utf8'));await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'scene.json'),JSON.stringify(imported));}
 const service=await startServer(directory,{port:portIndex>=0?Number(args[portIndex+1]):5368});console.log(JSON.stringify({url:service.url,directory:path.resolve(directory),pid:process.pid}));
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>service.close().then(()=>process.exit(0)));
}

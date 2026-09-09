import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {html} from './editor-html.mjs';
import {dependency,browserOptions} from './runtime-deps.mjs';
export async function auditScene(scene,{output}={}){
 const {chromium}=await dependency('playwright');const browser=await chromium.launch(browserOptions());
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  // No network access is necessary: every bitmap is embedded in the scene.
  await page.route('**/*',route=>route.abort());
  await page.setContent(html(scene,{editable:false}),{waitUntil:'load'});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  const issues=await page.evaluate(()=>[...document.querySelectorAll('.text,th,td')].filter(e=>e.scrollHeight>e.clientHeight+3||e.scrollWidth>e.clientWidth+3).map(e=>({page:e.closest('.slide').dataset.slide,text:e.textContent.slice(0,70),message:'文本超出容器，请增大空间或分页'})));
  if(issues.length)throw Error('导出前检查未通过：'+JSON.stringify(issues.slice(0,12)));
  if(output){await fs.mkdir(path.dirname(output),{recursive:true});await page.pdf({path:output,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});}
  return {pages:scene.slides.length,issues};
 }finally{await browser.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: export-pdf.mjs scene.json new.pdf');
 try{await fs.access(output);throw Error('Output exists. Use a new filename.');}catch(e){if(e.code!=='ENOENT')throw e;}
 console.log(JSON.stringify(await auditScene(JSON.parse(await fs.readFile(input,'utf8')),{output:path.resolve(output)})));
}

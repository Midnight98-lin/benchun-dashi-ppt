import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {html} from './editor-html.mjs';
export {html} from './editor-html.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const T=JSON.parse(await fs.readFile(path.join(ROOT,'assets/tokens.json'),'utf8'));
const C=T.colors;
export const layouts={
 'benchun-hero':'title, subtitle?, body?, image (full scene, text on left safe area)',
 'benchun-editorial':'title, subtitle?, image, items[1..3]{title,body}, side? left|right',
 'benchun-chapter':'title, subtitle?, body?, image, side? left|right',
 'benchun-statement':'title, subtitle?, statement, body?, dark? boolean',
 'benchun-rows':'title, subtitle?, items[2..4]{title,body}',
 'benchun-mechanism':'title, subtitle?, center{title,body}, items[3..4]{title,body}',
 'benchun-flow':'title, subtitle?, items[3..5]{title,body}',
 'benchun-data':'title, subtitle?, metric{value,label,body}, chart{categories,values,seriesName,unit}, source',
 'benchun-compare':'title, subtitle?, headers[2..4], rows[1..4] (same column count), highlightColumn?',
 'benchun-evidence':'title, subtitle?, items[2..4]{title,body,image (real evidence)}',
 'benchun-montage':'title, subtitle?, images[2..3], body?',
 'benchun-references':'title, subtitle?, items[2..6]{title,body}'
};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function need(condition,message){if(!condition)throw Error(message);}
function textLines(s,w,size){return String(s).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((a,c)=>a+(/[\u0000-\u00ff]/.test(c)?0.55:1),0)*size/w)),0);}

export async function buildScene(goal,base){
 need(goal.slides?.length,'goal.slides must not be empty');
 const scene={title:goal.title||'本纯魔法演示',canvas:T.canvas,font:T.font.primary,slides:[]};
 const mediaCache=new Map();
 async function media(value){
   need(value&&typeof value==='object'&&value.path,'image must be an object with path/kind/source');
   need(['scene','product-scene','evidence','reference'].includes(value.kind),'invalid image kind');
   need(value.source,'image.source is required');
   if(value.kind==='product-scene')need(value.packagingVerified===true&&value.sku&&value.sourceAssets?.length,'Product scene requires checked SKU and sourceAssets; never self-certify without visual review');
   const full=path.resolve(base,value.path);need(/\.(png|jpe?g|webp)$/i.test(full),'Only local PNG/JPEG/WebP supported');
   if(!mediaCache.has(full)){const bytes=await fs.readFile(full);mediaCache.set(full,'data:image/'+(/\.png$/i.test(full)?'png':/\.webp$/i.test(full)?'webp':'jpeg')+';base64,'+bytes.toString('base64'));}
   return {dataUrl:mediaCache.get(full),source:value.source,sourcePath:full,kind:value.kind,sku:value.sku,alt:value.alt||value.source};
 }
 for(let i=0;i<goal.slides.length;i++){
  const def=goal.slides[i],p=def.props||{},family=def.layout;
  need(layouts[family],`Unknown layout ${family}; use --list`);need(p.title,`Page ${i+1} missing title`);
  if(i>1)need(!(goal.slides[i-1].layout===family&&goal.slides[i-2].layout===family),'Three consecutive identical layouts: vary the visual rhythm');
  const extraKeys={hero:['body','image','side'],editorial:['image','items','side'],chapter:['body','image','side'],statement:['statement','body','dark'],rows:['items'],mechanism:['center','items'],flow:['items'],data:['metric','chart'],compare:['headers','rows','highlightColumn'],evidence:['items'],montage:['images','body'],references:['items']}[family.replace('benchun-','')];
  const allowed=new Set(['title','subtitle','source',...extraKeys]);
  for(const key of Object.keys(p))need(allowed.has(key),`Page ${i+1}: unknown props.${key}; refusing to silently drop content`);
  const checkKeys=(obj,keys,label)=>{if(!obj)return;for(const key of Object.keys(obj))need(keys.includes(key),`Page ${i+1}: unknown ${label}.${key}; refusing to silently drop content`);};
  (p.items||[]).forEach((it,j)=>{checkKeys(it,family==='benchun-evidence'?['title','body','image']:['title','body'],'items['+j+']');need(typeof it.title==='string'&&typeof it.body==='string','Each item needs explicit title/body strings');});
  checkKeys(p.center,['title','body'],'center');checkKeys(p.metric,['value','label','body'],'metric');checkKeys(p.chart,['categories','values','seriesName','unit'],'chart');
  const s={layout:family,background:p.dark?C.deep:C.ivory,sourceSlides:def.sourceSlides||[],elements:[]};scene.slides.push(s);
  const fg=p.dark?C.ivory:C.ink,muted=p.dark?C.sage:C.muted;
  const rect=(x,y,w,h,fill,r=0)=>s.elements.push({type:'rect',x,y,w,h,fill,r});
  const line=(x,y,w,fill=C.sage)=>rect(x,y,w,1,fill);
  const text=(value,x,y,w,h,size=25,color=fg,bold=false,role='body',align='left')=>{
   if(value===undefined||value===null||value==='')return;
   value=String(value); const expected=textLines(value,w,size)*size*1.3;
   need(expected<=h+size*.25,`Page ${i+1} '${value.slice(0,28)}' needs about ${Math.ceil(expected)}px, only ${h}px. Re-layout or paginate; do not shorten copy.`);
   s.elements.push({type:'text',text:value,x,y,w,h,size,color,bold,role,align});
  };
  const image=async(v,x,y,w,h,fit='cover')=>s.elements.push({type:'image',...await media(v),x,y,w,h,fit:v.kind==='product-scene'?'contain':fit});
  const header=()=>{
   text(goal.brand||'本纯魔法',64,26,850,24,16,fg,true,'header');
   if(family==='benchun-hero'||family==='benchun-chapter')rect(1088,20,136,35,C.ivory,4);
   text(`${String(i+1).padStart(2,'0')} / ${String(goal.slides.length).padStart(2,'0')}`,1100,26,116,24,16,fg,false,'page','right');
   line(64,62,1152,p.dark?C.secondary:C.sage);
  };
  const heading=()=>{header();text(p.title,64,92,1152,62,42,fg,true,'title');text(p.subtitle,64,165,1152,34,23,muted,false,'subtitle');};
  const listItems=(min,max)=>{need(Array.isArray(p.items)&&p.items.length>=min&&p.items.length<=max,`${family} requires ${min}..${max} items; never drop extras`);};
  if(family==='benchun-hero'||family==='benchun-chapter'){
   await image(p.image,0,0,1280,720);
   const x=p.side==='right'?686:64,w=p.side==='right'?530:548;
   header();text(p.title,x,158,w,190,family==='benchun-hero'?60:54,C.forest,true,'title');
   if(p.subtitle)text(p.subtitle,x,376,w,84,29,C.forest,true,'subtitle');
   line(x,474,Math.min(340,w),C.gold);text(p.body,x,503,Math.min(family==='benchun-hero'?330:412,w),150,25,C.ink);
  }else if(family==='benchun-editorial'){
   heading();listItems(1,3);const imgLeft=p.side==='left';
   await image(p.image,imgLeft?64:804,218,412,430);
   let x=imgLeft?524:64,w=644,h=420/p.items.length;
   p.items.forEach((it,k)=>{const y=222+k*h;text(String(k+1).padStart(2,'0'),x,y,46,37,24,C.gold,true,'label');text(it.title,x+60,y,w-60,45,29,C.forest,true,'subtitle');text(it.body,x+60,y+48,w-60,h-60,25);if(k<p.items.length-1)line(x,y+h-3,w);});
  }else if(family==='benchun-statement'){
   heading();rect(64,244,5,298,C.gold);text(p.statement,104,244,1090,196,64,fg,true,'statement');text(p.body,108,490,920,112,27,muted);
  }else if(family==='benchun-rows'){
   heading();listItems(2,4);const h=436/p.items.length;
   p.items.forEach((it,k)=>{const y=221+k*h;text(String(k+1).padStart(2,'0'),64,y,65,51,32,C.gold,true,'label');text(it.title,152,y,270,79,29,C.forest,true,'subtitle');text(it.body,464,y,752,h-24,25);line(152,y+h-17,1064);});
  }else if(family==='benchun-mechanism'){
   heading();listItems(3,4);need(p.center?.title,'center.title required');
   rect(469,312,342,188,C.forest,8);text(p.center.title,491,337,298,48,31,C.ivory,true,'subtitle','center');text(p.center.body,491,402,298,75,24,C.ivory,false,'body','center');
   const pos=[[64,220],[866,220],[64,477],[866,477]];
   p.items.forEach((it,k)=>{const [x,y]=pos[k];line(x,y+4,55,C.gold);text(it.title,x,y+22,350,77,28,C.forest,true,'subtitle');text(it.body,x,y+105,350,68,24);});
   line(415,351,54,C.gold);line(811,351,54,C.gold);line(415,470,54,C.gold);line(811,470,54,C.gold);
  }else if(family==='benchun-flow'){
   heading();listItems(3,5);const w=1152/p.items.length;line(64,331,1152,C.gold);
   p.items.forEach((it,k)=>{const x=64+k*w;rect(x,282,68,68,k===p.items.length-1?C.gold:C.forest,8);text(String(k+1).padStart(2,'0'),x+9,295,50,42,29,C.ivory,true,'label','center');text(it.title,x,384,w-28,92,29,C.forest,true,'subtitle');text(it.body,x,498,w-28,139,25);});
  }else if(family==='benchun-data'){
   heading();need(p.metric&&p.chart&&p.source,'data page requires metric/chart/source');
   const ch=p.chart;need(ch.categories?.length===ch.values?.length&&ch.values.length>=2&&ch.values.length<=6,'chart: 2..6 aligned categories/values');need(ch.values.every(v=>Number.isFinite(v)&&v>=0),'This bar layout supports finite non-negative values; select a different chart for negative/missing values');need(ch.unit!==undefined&&ch.seriesName,'chart unit and seriesName required');
   text(p.metric.value,64,248,420,136,94,C.gold,true,'metric');text(p.metric.label,68,405,410,50,31,C.forest,true,'subtitle');text(p.metric.body,68,483,410,142,25,muted);
   s.elements.push({type:'chart',x:526,y:242,w:684,h:382,chart:ch});
  }else if(family==='benchun-compare'){
   heading();need(p.headers?.length>=2&&p.headers.length<=4,'compare requires 2..4 headers');need(p.rows?.length>=1&&p.rows.length<=4&&p.rows.every(r=>r.length===p.headers.length),'compare requires 1..4 complete rows');
   const rows=[p.headers,...p.rows];rows.flat().forEach(v=>need(String(v).length<=40,'Long table cells: use fewer columns or paginate, do not truncate'));
   s.elements.push({type:'table',x:64,y:234,w:1152,h:402,rows,highlight:p.highlightColumn??-1});
  }else if(family==='benchun-evidence'){
   heading();listItems(2,4);const w=1152/p.items.length;
   for(let k=0;k<p.items.length;k++){const it=p.items[k],x=64+k*w;need(it.image.kind==='evidence','Evidence pages require real evidence images');await image(it.image,x,224,w-28,280,'contain');text(it.title,x,529,w-28,69,24,C.forest,true,'subtitle');text(it.body,x,607,w-28,47,18,muted,false,'caption');}
  }else if(family==='benchun-montage'){
   heading();need(p.images?.length>=2&&p.images.length<=3,'montage requires 2..3 images');await image(p.images[0],64,221,648,425);await image(p.images[1],740,221,476,p.images.length===3?200:425);if(p.images[2])await image(p.images[2],740,446,476,200);if(p.body)text(p.body,68,660,1140,22,16,muted,false,'caption');
  }else if(family==='benchun-references'){
   heading();listItems(2,6);const perCol=Math.ceil(p.items.length/2),h=438/perCol;
   p.items.forEach((it,k)=>{const x=64+Math.floor(k/perCol)*594,y=218+(k%perCol)*h;text(String(k+1).padStart(2,'0'),x,y,42,32,19,C.gold,true,'label');text(it.title,x+49,y,498,56,22,C.forest,true,'subtitle');text(it.body,x+49,y+63,498,h-68,20,muted,false,'caption');});
  }
  if(family==='benchun-hero'||family==='benchun-chapter')rect(0,672,1280,48,C.ivory);
  text(p.source||goal.footer,64,682,1152,23,14,muted,false,'footnote');
  for(const e of s.elements)need(e.x>=0&&e.y>=0&&e.x+e.w<=1280.1&&e.y+e.h<=720.1,`Page ${i+1}: element outside slide`);
 }
 return scene;
}

function chartHTML(e){const {categories,values,seriesName,unit}=e.chart,max=Math.max(...values)*1.15||1;const cw=(e.w-80)/values.length,bottom=e.h-52;return `<div class="chart" style="position:absolute;left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px"><div style="font-size:20px;color:${C.muted}">${esc(seriesName)} · ${esc(unit)}</div>${[0,1,2,3].map(k=>`<div style="position:absolute;left:48px;right:0;top:${bottom-k*(bottom-55)/3}px;border-top:1px solid ${C.sage}"><span style="position:absolute;right:calc(100% + 9px);top:-12px;font-size:16px">${Math.round(max*k/3)}</span></div>`).join('')}${values.map((v,i)=>{const h=v/max*(bottom-55),x=60+i*cw;return `<div style="position:absolute;left:${x}px;top:${bottom-h}px;width:${cw*.64}px;height:${h}px;background:${i===values.length-1?C.gold:C.forest}"></div><div style="position:absolute;left:${x-8}px;top:${bottom-h-29}px;width:${cw*.8}px;text-align:center;font-size:21px;font-weight:700">${esc(v)}</div><div style="position:absolute;left:${x-13}px;top:${bottom+15}px;width:${cw*.9}px;text-align:center;font-size:18px">${esc(categories[i])}</div>`;}).join('')}</div>`;}
function legacyPreviewHTML(scene){return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(scene.title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#e3e7e0;font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;color:${C.ink}}.slide{width:1280px;height:720px;position:relative;margin:24px auto;overflow:hidden;box-shadow:0 8px 28px #173c2420}.text{position:absolute;white-space:pre-wrap;overflow:visible;line-height:1.3;margin:0;padding:0}.toolbar{position:fixed;z-index:999;bottom:18px;right:18px;background:#fff;border:1px solid #cad6ca;border-radius:12px;padding:8px;display:flex;gap:8px}button{font:16px "Microsoft YaHei";background:#174B3A;color:#fff;border:0;padding:10px 16px;border-radius:6px;cursor:pointer}button:focus-visible{outline:3px solid #B59A64;outline-offset:3px}table{position:absolute;table-layout:fixed;border-collapse:collapse;font-size:23px;line-height:1.3}th,td{text-align:left;padding:15px 20px;border-bottom:1px solid #D1DDCF;overflow-wrap:anywhere}th{background:#174B3A;color:#FFFDF8;font-weight:700}tr:nth-child(even){background:#E8EFE6}.emph{background:#eee7d7!important;color:#174B3A;font-weight:700}@media print{@page{size:1280px 720px;margin:0}body{background:white}.slide{margin:0;box-shadow:none;break-after:page;page-break-after:always}.toolbar{display:none}}
</style><main id="deck">${scene.slides.map((s,i)=>`<section class="slide" data-slide="${i+1}" style="background:${s.background}" aria-label="第${i+1}页">${s.elements.map(e=>{const pos=`position:absolute;left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;`;if(e.type==='text')return `<div class="text" data-role="${e.role}" style="${pos}font-size:${e.size}px;color:${e.color};font-weight:${e.bold?700:400};text-align:${e.align}">${esc(e.text)}</div>`;if(e.type==='rect')return `<div style="${pos}background:${e.fill};border-radius:${e.r}px"></div>`;if(e.type==='image')return `<img alt="${esc(e.alt)}" style="${pos}object-fit:${e.fit}" src="${e.dataUrl}">`;if(e.type==='chart')return chartHTML(e);if(e.type==='table')return `<table style="left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px">${e.rows.map((row,r)=>`<tr>${row.map((v,c)=>`<${r?'td':'th'} class="${c===e.highlight?'emph':''}">${esc(v)}</${r?'td':'th'}>`).join('')}</tr>`).join('')}</table>`;return '';}).join('')}</section>`).join('')}</main><nav class="toolbar" aria-label="演示控制"><button id="prev">上一页</button><button id="next">下一页</button><button id="print">打印 / PDF</button></nav><script>let n=0;const slides=[...document.querySelectorAll('.slide')];function go(d){n=Math.max(0,Math.min(slides.length-1,n+d));slides[n].scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}document.getElementById('prev').onclick=()=>go(-1);document.getElementById('next').onclick=()=>go(1);document.getElementById('print').onclick=()=>print();document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1)});window.benchunCheck=()=>[...document.querySelectorAll('.text')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({slide:e.closest('.slide').dataset.slide,text:e.textContent,role:e.dataset.role}));</script></html>`;}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [requestedInput,requestedOutput]=process.argv.slice(2);
 if(requestedOutput&&!requestedInput.startsWith('--')){
  for(const name of ['scene.json','index.html']){
   try{await fs.access(path.join(requestedOutput,name));throw Error('Presentation already exists. Preserve browser edits: use a NEW output directory, or serve the saved scene.');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
 }
 try{const [input,out]=process.argv.slice(2);if(input==='--list'){console.log(JSON.stringify(layouts,null,2));}else if(input==='--inspect'){need(layouts[out],'Unknown layout');console.log(out+': '+layouts[out]);}else{need(input&&out,'Usage: node render.mjs <goal.json> <output-dir>');const full=path.resolve(input),g=JSON.parse(await fs.readFile(full,'utf8')),s=await buildScene(g,path.dirname(full));await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'scene.json'),JSON.stringify(s));await fs.writeFile(path.join(out,'index.html'),html(s));console.log(`Rendered ${s.slides.length} pages: ${path.resolve(out,'index.html')}`);}}
 catch(e){console.error(e.message);process.exitCode=1;}
}

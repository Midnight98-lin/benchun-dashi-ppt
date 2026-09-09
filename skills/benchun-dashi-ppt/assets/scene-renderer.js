(function(global){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors={green:'#174B3A',gold:'#B59A64',ink:'#1F2B25',muted:'#66736C',sage:'#D1DDCF'};
 function chart(e){
  const c=e.chart,n=c.values.length,max=Math.max(1,...c.values)*1.15,title=`<div class="chart-title">${esc(c.seriesName)}${c.unit?' · '+esc(c.unit):''}</div>`;
  if(c.direction==='bar'){
   const label=Math.min(e.w*.34,250),right=50,plot=e.w-label-right,step=(e.h-50)/n;
   // Native PowerPoint horizontal axes place the first category at the bottom.
   return title+c.values.map((v,i)=>`<div class="bar-category" style="left:0;top:${50+(n-1-i)*step}px;width:${label-12}px;height:${step}px">${esc(c.categories[i])}</div><div style="position:absolute;left:${label}px;top:${50+(n-1-i)*step+step*.2}px;width:${v/max*plot}px;height:${step*.6}px;background:${i===n-1?colors.gold:colors.green}"></div><div class="bar-value" style="left:${label+v/max*plot+8}px;top:${50+(n-1-i)*step}px;height:${step}px">${esc(v)}</div>`).join('');
  }
  const bottom=e.h-70,top=60,cw=(e.w-60)/n;
  return title+[0,1,2,3].map(k=>`<div style="position:absolute;left:35px;right:0;top:${bottom-k*(bottom-top)/3}px;border-top:1px solid ${colors.sage}"></div>`).join('')+c.values.map((v,i)=>{const h=v/max*(bottom-top),x=45+i*cw;return `<div style="position:absolute;left:${x}px;top:${bottom-h}px;width:${cw*.65}px;height:${h}px;background:${i===n-1?colors.gold:colors.green}"></div><div class="column-value" style="left:${x}px;top:${bottom-h-30}px;width:${cw*.65}px">${esc(v)}</div><div class="column-category" style="left:${x-8}px;top:${bottom+10}px;width:${cw*.8}px">${esc(c.categories[i])}</div>`;}).join('');
 }
 function element(e,index,scene){
  const pos=`left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;`,attr=`data-element="${index}"`;
  const transformable=['text','image','rect','shape'].includes(e.type);
  const transform=transformable?`transform-origin:center center;transform:rotate(${Number(e.rotation)||0}deg) scaleX(${e.flipHorizontal?-1:1}) scaleY(${e.flipVertical?-1:1});`:'';
  if(e.type==='text')return `<div class="element text" ${attr} data-role="${esc(e.role)}" style="${pos}${transform}font-family:'${esc(e.font||scene.font)}',sans-serif;font-size:${e.size}px;color:${e.color};font-weight:${e.bold?700:400};font-style:${e.italic?'italic':'normal'};text-decoration:${e.underline?'underline':'none'};text-align:${e.align||'left'}">${esc(e.text)}</div>`;
  if(e.type==='rect')return `<div class="element" ${attr} style="${pos}${transform}background:${e.fill};border-radius:${e.r||0}px"></div>`;
  if(e.type==='shape'){
   const {w,h}=e,head=Math.min(w,h)/2,r=Math.min(e.r??16,w/2,h/2);
   const geometry={
    rect:`<rect width="${w}" height="${h}"/>`,
    roundRect:`<rect width="${w}" height="${h}" rx="${r}"/>`,
    ellipse:`<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}"/>`,
    triangle:`<polygon points="${w/2},0 ${w},${h} 0,${h}"/>`,
    rightArrow:`<polygon points="0,${h/4} ${w-head},${h/4} ${w-head},0 ${w},${h/2} ${w-head},${h} ${w-head},${h*3/4} 0,${h*3/4}"/>`,
    line:`<line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}"/>`
   }[e.geometry];
   return `<div class="element" ${attr} style="${pos}${transform}"><svg aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible" fill="${e.geometry==='line'?'none':e.fill}" stroke="${e.stroke||'none'}" stroke-width="${e.strokeWidth??0}" stroke-linejoin="round">${geometry}</svg></div>`;
  }
  if(e.type==='image')return `<img class="element" ${attr} alt="${esc(e.alt)}" draggable="false" src="${esc(e.dataUrl)}" style="${pos}${transform}object-fit:${e.fit||'cover'}">`;
  if(e.type==='chart')return `<div class="element chart" ${attr} style="${pos}">${chart(e)}</div>`;
  if(e.type==='table')return `<div class="element table-wrap" ${attr} style="${pos}"><table style="font-size:${e.size||23}px"><colgroup>${e.rows[0].map((_,j)=>`<col style="width:${(e.widths?.[j]??1/e.rows[0].length)*100}%">`).join('')}</colgroup><tbody>${e.rows.map((row,r)=>`<tr style="height:${e.h/e.rows.length}px">${row.map((v,c)=>`<${r?'td':'th'} style="padding:${e.paddingY??8}px ${e.paddingX??14}px;${c===e.highlight&&r?'background:#EEE7D7;font-weight:700;':''}">${esc(v)}</${r?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return '';
 }
 const css=`.slide{position:relative;width:1280px;height:720px;overflow:hidden;flex:none;color:#1F2B25}.slide *{box-sizing:border-box}.element{position:absolute}.text{white-space:pre-wrap;overflow:visible;line-height:1.3;margin:0;padding:0;overflow-wrap:normal}.slide table{width:100%;height:100%;table-layout:fixed;border-collapse:collapse;line-height:1.3}.slide th,.slide td{text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #D1DDCF;vertical-align:middle}.slide th{background:#174B3A;color:#FFFDF8;font-weight:700}.slide tr:nth-child(even){background:#E8EFE6}.chart-title{font-size:21px;color:#66736C}.bar-category,.bar-value{position:absolute;display:flex;align-items:center;font-size:21px}.bar-category{justify-content:flex-end;text-align:right;white-space:pre-wrap}.bar-value,.column-value{font-size:24px;font-weight:700;color:#174B3A}.column-value,.column-category{position:absolute;text-align:center}.column-category{font-size:18px;white-space:pre-wrap}@media print{@page{size:1280px 720px;margin:0}html,body{margin:0!important;padding:0!important;background:white!important}#print-deck .slide{margin:0!important;box-shadow:none!important;break-after:page;page-break-after:always}#print-deck .slide:last-child{break-after:auto;page-break-after:auto}}`;
 global.BenchunRenderer={esc,css,renderSlide:(s,i,scene)=>`<section class="slide" data-slide="${i+1}" aria-label="第 ${i+1} 页" style="background:${s.background};font-family:'${esc(scene.font)}',sans-serif">${s.elements.map((e,j)=>element(e,j,scene)).join('')}</section>`};
})(typeof window!=='undefined'?window:globalThis);

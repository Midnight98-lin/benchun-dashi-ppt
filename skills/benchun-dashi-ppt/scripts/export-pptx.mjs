import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {validateScene} from './scene-schema.mjs';

const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node export-pptx.mjs <scene.json> <new-output.pptx>');
try{await fs.access(output);throw Error('Output already exists; choose a new filename to preserve drafts.');}catch(e){if(e.code!=='ENOENT')throw e;}
let pkg;
for(const dir of [process.env.BENCHUN_NODE_MODULES,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean)){
 try{pkg=createRequire(path.join(path.dirname(dir),'package.json')).resolve('@oai/artifact-tool');break;}catch{}
}
if(!pkg)throw Error('Missing @oai/artifact-tool. Call load_workspace_dependencies and set BENCHUN_NODE_MODULES to bundled modules.');
const {Presentation,PresentationFile}=await import(pathToFileURL(pkg).href);
const data=validateScene(JSON.parse(await fs.readFile(input,'utf8')));
const p=Presentation.create({slideSize:{width:data.canvas.width,height:data.canvas.height}});
for(let i=0;i<data.slides.length;i++){
 const spec=data.slides[i],s=p.slides.add();s.background.fill=spec.background;
 for(const e of spec.elements){
  const position={left:e.x,top:e.y,width:e.w,height:e.h};
  const transformedPosition={...position,rotation:Number(e.rotation)||0,horizontalFlip:!!e.flipHorizontal,verticalFlip:!!e.flipVertical};
  if(e.type==='text'){
   const sh=s.shapes.add({name:e.role,geometry:'textbox',position:transformedPosition,fill:'none',line:{fill:'none',width:0}});
   sh.text=e.text;sh.text.style={typeface:e.font||data.font,fontSize:e.size,color:e.color,bold:e.bold,italic:!!e.italic,underline:e.underline?'sng':'none',alignment:e.align,verticalAlignment:'top',autoFit:'none',wrap:'square',insets:{top:0,bottom:0,left:0,right:0},lineSpacing:1.1};
  }else if(e.type==='rect'){s.shapes.add({geometry:'rect',position:transformedPosition,fill:e.fill,line:{fill:'none',width:0},...(e.r?{borderRadius:e.r}:{})});
  }else if(e.type==='shape'){
   s.shapes.add({geometry:e.geometry,position:e.geometry==='line'?{...transformedPosition,top:e.y+e.h/2,height:0}:transformedPosition,
    fill:e.geometry==='line'?'none':e.fill,line:{fill:e.stroke||'none',width:e.strokeWidth??0,style:'solid'},
    ...(e.geometry==='roundRect'?{borderRadius:Math.min(e.r??16,e.w/2,e.h/2)}:{})});
  }else if(e.type==='image'){
   const image=s.images.add({dataUrl:e.dataUrl,position,fit:e.fit,alt:e.alt});
   image.rotation=Number(e.rotation)||0;image.flipHorizontal=!!e.flipHorizontal;image.flipVertical=!!e.flipVertical;
  }else if(e.type==='chart'){
   s.charts.add('bar',{
    position,title:e.chart.seriesName+' · '+e.chart.unit,titleTextStyle:{typeface:data.font,fontSize:21,fill:'#66736C'},
    categories:e.chart.categories,series:[{name:e.chart.seriesName,values:e.chart.values,fill:'#174B3A',points:[{idx:e.chart.values.length-1,fill:'#B59A64'}]}],
    barOptions:{direction:e.chart.direction||'column',grouping:'clustered',gapWidth:90},hasLegend:false,
    xAxis:e.chart.direction==='bar'?{visible:true,min:0,textStyle:{typeface:data.font,fontSize:18,fill:'#66736C'},majorGridlines:{fill:'#D1DDCF',width:.6}}:{visible:true,textStyle:{typeface:data.font,fontSize:21,fill:'#1F2B25'},line:{fill:'#D1DDCF',width:1},majorGridlines:null},
    yAxis:e.chart.direction==='bar'?{visible:true,textStyle:{typeface:data.font,fontSize:21,fill:'#1F2B25'},line:{fill:'#D1DDCF',width:1},majorGridlines:null}:{visible:true,min:0,textStyle:{typeface:data.font,fontSize:18,fill:'#66736C'},majorGridlines:{fill:'#D1DDCF',width:0.6}},
    dataLabels:{showValue:true,position:'outEnd',textStyle:{typeface:data.font,fontSize:24,bold:true,fill:'#174B3A'}}
   });
  }else if(e.type==='table'){
   const tbl=s.tables.add({rows:e.rows.length,columns:e.rows[0].length,left:e.x,top:e.y,width:e.w,height:e.h,values:e.rows.map(r=>r.map(String)),columnWidths:e.widths?.map(v=>v*e.w)});
   tbl.borders.assign({fill:'#D1DDCF',width:0.6,style:'solid'});
   for(let r=0;r<e.rows.length;r++)for(let c=0;c<e.rows[r].length;c++){
    const cell=tbl.getCell(r,c);cell.fill=r===0?'#174B3A':c===e.highlight?'#EEE7D7':r%2?'#E8EFE6':'#FFFDF8';
    cell.text.style={typeface:e.font||data.font,fontSize:e.size||23,color:r===0?'#FFFDF8':'#1F2B25',bold:r===0||c===e.highlight,autoFit:'none',verticalAlignment:'middle',insets:{left:e.paddingX??14,right:e.paddingX??14,top:e.paddingY??8,bottom:e.paddingY??8}};
   }
  }
 }
 s.speakerNotes.textFrame.setText(JSON.stringify({layout:spec.layout,sourceSlides:spec.sourceSlides,sourceRange:spec.sourceRange,sources:spec.elements.filter(e=>e.source).map(e=>({source:e.source,path:e.sourcePath,sku:e.sku}))},null,2));
}
await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
await(await PresentationFile.exportPptx(p)).save(path.resolve(output));
console.log(`Native PPTX: ${path.resolve(output)} (${data.slides.length} slides). Still requires final package and visual QA.`);
if(process.env.BENCHUN_RENDER_PNG==='1'){
 const dir=output.replace(/\.pptx$/i,'')+'-render';await fs.mkdir(dir,{recursive:true});
 for(let i=0;i<p.slides.items.length;i++){const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(dir,`page-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));}
 console.log('Preview PNG: '+dir);
}

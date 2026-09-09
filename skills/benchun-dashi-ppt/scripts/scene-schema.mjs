import crypto from 'node:crypto';
export const revision=scene=>crypto.createHash('sha256').update(JSON.stringify(scene)).digest('hex');
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const color=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
const string=(s,n=20000)=>typeof s==='string'&&s.length<=n;
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function validateScene(scene){
 ensure(scene&&typeof scene==='object'&&!Array.isArray(scene),'演示数据须为对象');
 ensure(string(scene.title,300),'标题无效');ensure(scene.canvas?.width===1280&&scene.canvas?.height===720,'仅支持 1280 × 720 的品牌画布');
 ensure(string(scene.font,80)&&/^[\p{L}\p{N} _-]+$/u.test(scene.font),'字体名称无效');
 ensure(Array.isArray(scene.slides)&&scene.slides.length>0&&scene.slides.length<=200,'页数须为 1–200');
 scene.slides.forEach((s,i)=>{
  ensure(color(s.background),`第 ${i+1} 页背景色无效`);ensure(Array.isArray(s.elements)&&s.elements.length<=250,'元素过多');
  s.elements.forEach((e,j)=>{
   const label=`第 ${i+1} 页元素 ${j+1}`;
   ensure(['text','rect','shape','image','table','chart'].includes(e.type),label+'：不支持的元素类型');
   ensure(finite(e.x,0,1280)&&finite(e.y,0,720)&&finite(e.w,.1,1280)&&finite(e.h,.1,720)&&e.x+e.w<=1280.1&&e.y+e.h<=720.1,label+'：超出画布');
   const transformable=['text','rect','shape','image'].includes(e.type);
   if(e.rotation!==undefined||e.flipHorizontal!==undefined||e.flipVertical!==undefined)ensure(transformable,label+'：该元素不支持自由变形');
   ensure(e.rotation===undefined||finite(e.rotation,-180,180),label+'：旋转角度须为 -180 至 180');
   for(const k of ['flipHorizontal','flipVertical'])ensure(e[k]===undefined||typeof e[k]==='boolean',label+'：翻转状态无效');
   if(e.font!==undefined)ensure(string(e.font,80)&&/^[\p{L}\p{N} _-]+$/u.test(e.font),'字体名称无效');
   if(e.type==='text'){ensure(string(e.text),'文本过长');ensure(finite(e.size,8,160)&&color(e.color),'字号或颜色无效');ensure(['left','center','right'].includes(e.align||'left'),'文本对齐无效');for(const k of ['bold','italic','underline'])ensure(e[k]===undefined||typeof e[k]==='boolean','文字样式无效');}
   if(e.type==='rect')ensure(color(e.fill)&&finite(e.r||0,0,360),'形状颜色或圆角无效');
   if(e.type==='shape'){
    ensure(['rect','roundRect','ellipse','triangle','rightArrow','line'].includes(e.geometry),'形状类型无效');
    ensure(color(e.fill)||e.fill==='none','形状填充无效');
    ensure(e.stroke===undefined||color(e.stroke)||e.stroke==='none','形状描边无效');
    ensure(e.strokeWidth===undefined||finite(e.strokeWidth,0,20),'描边粗细无效');
    ensure(e.r===undefined||finite(e.r,0,360),'圆角无效');
   }
   if(e.type==='image'){
    ensure(string(e.dataUrl,30*1024*1024)&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(e.dataUrl),'仅支持嵌入的 PNG/JPEG/WebP 图片');
    const b=Buffer.from(e.dataUrl.split(',')[1],'base64');ensure((b[0]===137&&b.toString('ascii',1,4)==='PNG')||(b[0]===255&&b[1]===216)||(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'),'图片内容和格式不符');
    ensure(['cover','contain'].includes(e.fit||'cover'),'图片适应方式无效');ensure(e.alt===undefined||string(e.alt,2000),'图片说明无效');
   }
   if(e.type==='table'){
    ensure(Array.isArray(e.rows)&&e.rows.length>0&&e.rows.length<=40&&e.rows[0].length>0&&e.rows[0].length<=12,'表格大小无效');
    ensure(e.rows.every(r=>Array.isArray(r)&&r.length===e.rows[0].length&&r.every(v=>string(v,4000)||Number.isFinite(v))),'表格须为完整矩阵');
    if(e.widths)ensure(e.widths.length===e.rows[0].length&&e.widths.every(v=>finite(v,.01,1))&&Math.abs(e.widths.reduce((a,b)=>a+b,0)-1)<.001,'表格列宽比例须合计为 1');
    ensure(e.size===undefined||finite(e.size,8,80),'表格字号无效');
    for(const k of ['paddingX','paddingY'])ensure(e[k]===undefined||finite(e[k],0,40),'表格边距无效');
   }
   if(e.type==='chart'){
    const c=e.chart;ensure(c&&Array.isArray(c.categories)&&c.categories.length>0&&c.categories.length<=30&&c.categories.every(x=>string(x,300)),'图表分类无效');
    ensure(Array.isArray(c.values)&&c.values.length===c.categories.length&&c.values.every(v=>finite(v,0,1e12)),'柱状图须为对应分类的非负数值');
    ensure(string(c.seriesName,300)&&string(c.unit,100),'图表名称或单位无效');ensure(c.direction===undefined||['bar','column'].includes(c.direction),'图表方向无效');
   }
  });
 });
 return scene;
}

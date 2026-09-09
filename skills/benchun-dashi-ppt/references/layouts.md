# 版式字段与容量

顶层：title、brand、footer、slides；每页 {layout, sourceSlides: [原页码], props}。sourceSlides记录来源，不限制新版页码。

所有页需props.title，可带subtitle和source（当页页脚）。字符串按原样显示，换行用JSON换行。不接受富HTML，不把多余数组项隐藏起来。

| layout | 构图与字段 |
| --- | --- |
| benchun-hero | 全幅场景左字。title/subtitle/body/image。标题约3行以内。 |
| benchun-editorial | 分栏。items 1–3个，每个title/body；image；side可left。 |
| benchun-chapter | 场景章节，title/subtitle/body/image，side可right但须换匹配留白场景，不能镜像包装。 |
| benchun-statement | 无图大陈述，statement/body，dark可true。 |
| benchun-rows | 连续条目，items 2–4个title/body。 |
| benchun-mechanism | 中心锚点，center{title,body}，items 3–4项。只表示原有关系，化学结构另做准确矢量。 |
| benchun-flow | 主线，items 3–5个title/body。超出请分段/扩展，不删内容。 |
| benchun-data | metric{value,label,body}，chart{categories,values,seriesName,unit}和source。非负柱图2–6项；其它分布换图。 |
| benchun-compare | headers 2–4列，rows 1–4行，highlightColumn从0起。长表完整拆页。 |
| benchun-evidence | items 2–4个{title,body,image}，image.kind必须evidence。真实扫描整幅显示。 |
| benchun-montage | images 2–3张，一主一/二次；body可选。 |
| benchun-references | items 2–6个{title,body}双栏附录；长文献继续分页。 |

图片对象：{path,kind,source,alt?}。path相对goal.json，本地PNG/JPEG/WebP，不是网页或远程URL。kind为scene/product-scene/evidence/reference。product-scene另需sourceAssets、sku和经实际检查的packagingVerified=true。

容量报错表示需要换结构或原文分页，不表示可以删字。长标题要统一联动调整正文起点，不能只拉长文本框覆盖下一层。

HTML和PPTX共用scene.json几何；图表/表格同值但不同引擎绘制，须检查PPTX最终渲染。页码低调，目录范围按实际页序核对。

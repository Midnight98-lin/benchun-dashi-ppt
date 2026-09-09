import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './scene-renderer-loader.mjs';
import {validateScene} from './scene-schema.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=name=>fs.readFileSync(path.join(root,'assets',name),'utf8');
export function html(scene,{editable=true,session=null}={}){
 validateScene(scene);
 const R=globalThis.BenchunRenderer;
 const safe=JSON.stringify(scene).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${R.esc(scene.title)}</title><style id="scene-style">${R.css}</style>${editable?`<style>${assets('editor.css')}</style>`:'<style>body{margin:0;background:#e3e7e0;font-family:"Microsoft YaHei",sans-serif}.slide{margin:24px auto}</style>'}</head><body><!-- THESIS: Edit the actual Benchun slide, save once, export the same revision. OWN-WORLD: user-approved Apple-style silver workspace, quiet white inspector and restrained forest accent around unchanged brand slides. STORY: select, edit, save, present, export. FIRST VIEWPORT: page rail, large 16:9 canvas, property inspector, explicit save status. FORM: user-pinned utility extension; no identity exploration. FINISH: unreviewed and undocumented is unfinished; this build requires functional and independent review. -->${editable?'<main id="app"></main>':`<main id="print-deck">${scene.slides.map((s,i)=>R.renderSlide(s,i,scene)).join('')}</main>`}<script id="benchun-scene" type="application/json">${safe}</script><script>${assets('scene-renderer.js')}</script>${session?`<script id="benchun-session">window.__BENCHUN_SESSION__=${JSON.stringify(session)};</script>`:''}${editable?`<script>${assets('editor-icons.js')}</script><script>${assets('editor.js')}</script>`:''}</body></html>`;
}
export function sceneFromHTML(content){
 const match=content.match(/<script\b[^>]*\bid=["']benchun-scene["'][^>]*>([\s\S]*?)<\/script>/i);
 if(!match)throw Error('未找到本纯编辑器的场景数据。仅可导入本技能下载的 HTML。');
 return validateScene(JSON.parse(match[1]));
}

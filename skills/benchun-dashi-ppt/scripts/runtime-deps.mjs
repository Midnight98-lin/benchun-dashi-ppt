import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
export async function dependency(name){
 for(const dir of [process.env.BENCHUN_NODE_MODULES,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean)){
  try{const mod=await import(pathToFileURL(createRequire(path.join(path.dirname(dir),'package.json')).resolve(name)).href);return mod.default||mod;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
 }
 throw Error(`找不到 ${name}，请调用 load_workspace_dependencies 并设置 BENCHUN_NODE_MODULES。`);
}
export function browserOptions(){
 const candidates=[process.env.BENCHUN_BROWSER,process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'),process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft/Edge/Application/msedge.exe')];
 const executablePath=candidates.find(p=>p&&fs.existsSync(p));
 return {headless:true,...(executablePath?{executablePath}:{})};
}

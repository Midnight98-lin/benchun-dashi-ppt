import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateScene} from './scene-schema.mjs';
const [candidate,final,...flags]=process.argv.slice(2);
if(!candidate||!final)throw Error('Usage: node finalize.mjs <candidate.pptx> <new-final.pptx> [--literal-workbooks] [--scene scene.json]');
let families=['Microsoft YaHei'];
if(flags.includes('--scene')){
 const scenePath=flags[flags.indexOf('--scene')+1];
 if(!scenePath||scenePath.startsWith('--'))throw Error('--scene requires the saved scene path');
 const source=validateScene(JSON.parse(await fs.readFile(scenePath,'utf8')));
 families=[...new Set(source.slides.flatMap(s=>s.elements.filter(e=>['text','table','chart'].includes(e.type)).map(e=>e.type==='chart'?source.font:e.font||source.font)))];
}
let skill=process.env.PRESENTATIONS_SKILL_DIR;
if(!skill){
 const installedRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
 const plugins=path.join(installedRoot,'plugins/cache/openai-primary-runtime/presentations');
 try{const versions=(await fs.readdir(plugins)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 for(const v of versions){const candidate=path.join(plugins,v,'skills/presentations');try{await fs.access(candidate+'/container_tools/artifact_tool_utils.mjs');skill=candidate;break;}catch{}}}catch{}
}
if(!skill)throw Error('Set PRESENTATIONS_SKILL_DIR from available skills; do not bypass final checks.');
const python=process.env.RUNTIME_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
process.env.RUNTIME_NODE_MODULES ||= process.env.BENCHUN_NODE_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const taskDir=path.dirname(path.resolve(candidate));
const qaDir=path.join(taskDir,'.benchun-qa');
if(path.dirname(path.resolve(final))===taskDir)throw Error('Put final PPTX in a separate delivery/ directory below the task; private QA cannot be beside final output.');
await fs.mkdir(qaDir,{recursive:true});await fs.mkdir(path.dirname(path.resolve(final)),{recursive:true});
const result=await finalizePresentation({
 workspaceDir:taskDir,candidatePath:path.resolve(candidate),finalPath:path.resolve(final),
 pythonExecutable:python,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
 fontPolicy:{basis:'design',families},verifyArtifactToolImport:true,
 materializeLiteralChartWorkbooks:flags.includes('--literal-workbooks'),
 receiptPath:path.join(qaDir,path.basename(final)+'.validation.json')
});
console.log(JSON.stringify(result));

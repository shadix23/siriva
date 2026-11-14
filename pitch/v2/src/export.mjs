import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build, OUT} from './build.mjs';

const runtime=process.env.CODEX_RUNTIME || '~/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const skill=process.env.PRESENTATIONS_SKILL || '~/.codex/plugins/cache/openai-primary-runtime/presentations/26.1112.11217/skills/presentations';
const {Presentation,PresentationFile,registerPdfFontFace}=await import(pathToFileURL(path.join(runtime,'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')).href);
for(const [weight,file] of [[400,'Arial.ttf'],[700,'Arial Bold.ttf']]){
  registerPdfFontFace({family:'Arial',style:'normal',weight,source:new Uint8Array(await fs.readFile('/System/Library/Fonts/Supplemental/'+file))});
}
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
console.log(await build(presentation));
for(const d of ['.build','output','preview']) await fs.mkdir(path.join(OUT,d),{recursive:true});
for(let i=0;i<presentation.slides.items.length;i++){
  const png=await presentation.export({slide:presentation.slides.items[i],format:'png',scale:1});
  await fs.writeFile(path.join(OUT,'preview',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
const pdf=await presentation.export({format:'pdf'});
await fs.writeFile(path.join(OUT,'output/Siriva-pitch-v2.pdf'),new Uint8Array(await pdf.arrayBuffer()));
const candidatePath=path.join(OUT,'.build/candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const finalPath=path.join(OUT,'output/Siriva-pitch-v2.pptx');
const receipt=await finalizePresentation({
  workspaceDir:OUT,candidatePath,finalPath,
  pythonExecutable:path.join(runtime,'python/bin/python3'),
  integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','2','--require-native-table-slide','4','--require-native-table-slide','6'],
  explicitTotalSlideCount:12,
  requiredNativeTableOwnerSlides:[2,4,6],
  requiredNativeChartOwnerSlides:[8],
  fontPolicy:{basis:'design',families:['Arial']},
  verifyArtifactToolImport:true,
  receiptPath:path.join(OUT,'.build/validation.json'),
});
console.log(JSON.stringify(receipt));

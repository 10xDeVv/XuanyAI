import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
await build({entryPoints:['src/solver/worker.ts'],bundle:true,platform:'browser',format:'iife',target:'es2020',outfile:'public/solver.worker.js',minify:true,legalComments:'inline'});
const runtime=await build({entryPoints:['src/solver/runtime.ts'],bundle:true,platform:'browser',format:'iife',target:'es2020',write:false,minify:true,legalComments:'inline'});
await writeFile('src/solver/generated.ts',`// Generated from the vendored MIT-licensed cubejs runtime. Run npm run build:workers.\nexport const SOLVER_RUNTIME = ${JSON.stringify(runtime.outputFiles[0].text)};\n`);
console.log('Built browser worker and native background solver bundle.');

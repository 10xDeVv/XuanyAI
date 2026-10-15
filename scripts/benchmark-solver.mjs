import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('.cache',{recursive:true});
await mkdir('artifacts',{recursive:true});
await build({entryPoints:['scripts/benchmark-solver.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.cache/benchmark-solver.cjs'});
execFileSync(process.execPath,['.cache/benchmark-solver.cjs'],{stdio:'inherit'});

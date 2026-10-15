import Cube from '../vendor/cubejs';
import {ALL_MOVES,quarterMoves,SOLVED} from '../src/core/cube';
import {Move} from '../src/core/types';
import {initializeSolver} from '../src/solver/solve';
import {shortenSolution} from '../src/solver/shortSolution';
import {improveSolution} from '../src/solver/improveSolution';
import {writeFileSync} from 'node:fs';
import {cpus,platform,release} from 'node:os';

const start=performance.now();initializeSolver();const initializationMs=performance.now()-start;
let seed=121;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const cases=[];
for(let trial=0;trial<40;trial++){
  const scramble:Move[]=[];let last='';
  while(scramble.length<25){const m=ALL_MOVES[random()%18]!;if(m[0]!==last){scramble.push(m);last=m[0]!;}}
  const input=Cube.fromString(SOLVED).move(scramble.join(' ')).asString();
  let t=performance.now();
  const before=shortenSolution(quarterMoves(Cube.fromString(input).solve().split(' ') as Move[])),baselineMs=performance.now()-t;
  t=performance.now();const after=improveSolution(input,before),extraMs=performance.now()-t;
  if(Cube.fromString(input).move(after.join(' ')).asString()!==SOLVED||after.length>before.length)throw new Error('Invalid result');
  cases.push({scramble:scramble.join(' '),before:before.length,after:after.length,moves:after.join(' '),baselineMs,extraMs});
}
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const p95=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
const summary={
  cases:cases.length,improved:cases.filter(c=>c.after<c.before).length,
  meanBefore:mean(cases.map(c=>c.before)),meanAfter:mean(cases.map(c=>c.after)),maxAfter:Math.max(...cases.map(c=>c.after)),
  meanBaselineMs:mean(cases.map(c=>c.baselineMs)),p95BaselineMs:p95(cases.map(c=>c.baselineMs)),maxBaselineMs:Math.max(...cases.map(c=>c.baselineMs)),
  meanExtraMs:mean(cases.map(c=>c.extraMs)),p95ExtraMs:p95(cases.map(c=>c.extraMs)),maxExtraMs:Math.max(...cases.map(c=>c.extraMs)),
};
const report={at:new Date().toISOString(),environment:{node:process.version,os:`${platform()} ${release()}`,cpu:cpus()[0]?.model},
  metric:'90-degree turns (half turns cost two)',seed:121,initializationMs,
  scope:'Deterministic 25-face-turn scrambles; desktop warm solver, not physical-phone latency or proof of optimality. Before is cubejs plus existing shortcut removal. Extra timing excludes baseline, table initialization, and the short-state check.',
  summary,cases};
writeFileSync('artifacts/full-solution-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({initializationMs,...summary},null,2));

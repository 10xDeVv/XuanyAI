import Cube from '../../vendor/cubejs';
import {applyMoves,quarterMoves,SOLVED} from '../core/cube';
import {FACES,Move} from '../core/types';
import {shortenSolution} from './shortSolution';

const names=FACES.flatMap(f=>[f,`${f}2`,`${f}'`] as Move[]);
const phase1Moves=names.map((_,i)=>i);
const phase2Moves=[0,1,2,4,7,9,10,11,13,16];
const successors=(moves:number[])=>Array.from({length:7},(_,last)=>moves.filter(m=>{
  const face=Math.floor(m/3);return last===6||(face!==last&&face!==last-3);
}));
const next1=successors(phase1Moves),next2=successors(phase2Moves);
const distance=(table:number[],index:number)=>(table[index>>3]!>>>((index%8)*4))&15;
const now=()=>globalThis.performance?.now?.()??Date.now();
const optimizationBudgetMs=200;
const nodeLimit=2_000_000;
const leafNodeLimit=6000;

export interface ImprovementOptions {
  budgetMs?:number;
  /** A second bound for runtimes with a coarse clock, also useful in tests. */
  maxNodes?:number;
  now?:()=>number;
}

/** Best-so-far two-phase search, bounded independently of scramble difficulty.
 * Reuses cubejs's initialized coordinate/pruning tables. The heuristic counts
 * face turns; it is also an admissible lower bound on quarter-turn cost.
 * Search caps deliberately trade completeness for a predictable extra wait.
 * The caller supplies an already verified plan; expiration always retains it.
 */
export function improveSolution(facelets:string,incumbent:readonly Move[],options:ImprovementOptions={}):Move[] {
  const clock=options.now??now,budget=Math.max(0,Math.min(options.budgetMs??optimizationBudgetMs,1000));
  let best=[...incumbent];
  if(!budget||!best.length)return best;
  const deadline=clock()+budget;
  // Kociemba's restricted second phase depends on which axis is vertical.
  // Rotate and relabel the coordinates to explore all three axis choices.
  // Map every resulting turn back; the physical cube never needs rotating.
  const rotations=['','x','z'];
  for(let axis=0;axis<rotations.length;axis++){
    const start=clock(),remaining=deadline-start;if(remaining<=0)break;
    const rotated=Cube.fromString(facelets).move(rotations[axis]!).asString();
    const oldFaces=FACES.map((_,i)=>rotated[i*9+4]!);
    const toLocal=new Map(oldFaces.map((f,i)=>[f,FACES[i]!]));
    const input=[...rotated].map(f=>toLocal.get(f)!).join('');
    const localPlan=best.map(m=>`${toLocal.get(m[0]!)}${m.slice(1)}` as Move);
    const candidate=searchAxis(input,localPlan,clock,start+remaining/(rotations.length-axis),
      Math.floor((options.maxNodes??nodeLimit)/rotations.length)
    ).map(m=>`${oldFaces[FACES.indexOf(m[0] as typeof FACES[number])]}${m.slice(1)}` as Move);
    if(candidate.length<best.length&&applyMoves(facelets,candidate)===SOLVED)best=candidate;
  }
  return best;
}

function searchAxis(facelets:string,incumbent:readonly Move[],clock:()=>number,deadline:number,maxNodes:number):Move[] {
  let best=[...incumbent];
  if(clock()>=deadline||maxNodes<=0)return best;
  const tables=Cube.moveTables,prune=Cube.pruningTables,cube=Cube.fromString(facelets);
  // Reused per-depth storage keeps the inner loops allocation-free.
  const flip=new Int32Array(32),twist=new Int32Array(32),slice=new Int32Array(32);
  const corners=new Int32Array(32),edges=new Int32Array(32),slicePermutation=new Int32Array(32),parity=new Int32Array(32);
  const path=new Int8Array(32);
  flip[0]=cube.flip();twist[0]=cube.twist();slice[0]=Math.floor(cube.FRtoBR()/24);
  const root={corners:cube.URFtoDLF(),slice:cube.FRtoBR(),parity:cube.cornerParity(),a:cube.URtoUL(),b:cube.UBtoDF()};
  let nodes=0,expired=false,passDeadline=deadline,leafNodes=0;
  const stopped=()=>{
    nodes++;
    // Checking on entry and every 128 nodes bounds timer overhead/overshoot.
    if(nodes>maxNodes||(nodes%128===1&&clock()>=passDeadline))expired=true;
    return expired;
  };
  const heuristic1=(depth:number)=>Math.max(distance(prune.sliceFlip,495*flip[depth]!+slice[depth]!),distance(prune.sliceTwist,495*twist[depth]!+slice[depth]!));
  const heuristic2=(depth:number)=>Math.max(
    distance(prune.sliceURtoDFParity,(24*edges[depth]!+slicePermutation[depth]!)*2+parity[depth]!),
    distance(prune.sliceURFtoDLFParity,(24*corners[depth]!+slicePermutation[depth]!)*2+parity[depth]!));

  function phase2(depth:number,remaining:number,cost:number,last:number):boolean {
    if(stopped()||++leafNodes>leafNodeLimit)return false;
    const h=heuristic2(depth);
    if(h>remaining||cost+h>=best.length)return false;
    if(h===0){
      const candidate=shortenSolution(quarterMoves(Array.from(path.slice(0,depth),m=>names[m]!)));
      if(candidate.length<best.length&&applyMoves(facelets,candidate)===SOLVED)best=candidate;
      return true;
    }
    if(!remaining)return false;
    for(const move of next2[last]!){
      const nextCost=cost+(move%3===1?2:1);if(nextCost>=best.length)continue;
      path[depth]=move;
      corners[depth+1]=tables.URFtoDLF[corners[depth]!]![move]!;
      edges[depth+1]=tables.URtoDF[edges[depth]!]![move]!;
      slicePermutation[depth+1]=tables.FRtoBR[slicePermutation[depth]!]![move]!;
      parity[depth+1]=tables.parity[parity[depth]!]![move]!;
      if(phase2(depth+1,remaining-1,nextCost,Math.floor(move/3)))return true;
      if(expired||leafNodes>leafNodeLimit)return false;
    }
    return false;
  }

  function finish(depth:number,cost:number,last:number){
    let c=root.corners,s=root.slice,p=root.parity,a=root.a,b=root.b;
    for(let i=0;i<depth;i++){
      const m=path[i]!;c=tables.URFtoDLF[c]![m]!;s=tables.FRtoBR[s]![m]!;p=tables.parity[p]![m]!;
      a=tables.URtoUL[a]![m]!;b=tables.UBtoDF[b]![m]!;
    }
    corners[depth]=c;slicePermutation[depth]=s;parity[depth]=p;edges[depth]=tables.mergeURtoDF[a]![b]!;
    leafNodes=0;
    for(let remaining=heuristic2(depth);remaining<=Math.min(12,22-depth,best.length-cost-1);remaining++){
      if(phase2(depth,remaining,cost,last)||expired||leafNodes>leafNodeLimit)break;
    }
  }

  function phase1(depth:number,remaining:number,cost:number,last:number){
    if(stopped())return;
    const h=heuristic1(depth);if(h>remaining||cost+h>=best.length)return;
    if(!remaining){
      if(!h&&(depth===0||!phase2Moves.includes(path[depth-1]!)))finish(depth,cost,last);
      return;
    }
    for(const move of next1[last]!){
      const nextCost=cost+(move%3===1?2:1);if(nextCost>=best.length)continue;
      path[depth]=move;
      flip[depth+1]=tables.flip[flip[depth]!]![move]!;
      twist[depth+1]=tables.twist[twist[depth]!]![move]!;
      slice[depth+1]=Math.floor(tables.FRtoBR[slice[depth]!*24]![move]!/24);
      phase1(depth+1,remaining-1,nextCost,Math.floor(move/3));
      if(expired)return;
    }
  }

  // Give deeper phase-one alternatives time too, rather than spending the
  // entire budget trying to perfect the first phase-two branch.
  for(let depth=heuristic1(0);depth<=12;depth++){
    const start=clock();if(start>=deadline||nodes>=maxNodes)break;
    passDeadline=start+(deadline-start)/(13-depth);expired=false;
    phase1(0,depth,0,6);
  }
  return best;
}

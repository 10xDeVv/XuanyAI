import {BASIS,SOLVED,cornerColors,cornerFacelets,edgeColors,edgeFacelets,edgeToward,rotateGrid,validateCube} from './cube';
import {CenterMap,CubeColor,CubeState,Face,FaceGrid,FACES} from './types';

export type EdgeConstraint={a:CubeColor;b:CubeColor;aEdges:number[];bEdges:number[]};
export type ScanAssembly={state?:CubeState;invalid?:boolean};
export type AssemblyInput={grids:[CubeColor,FaceGrid<CubeColor>][];edges:EdgeConstraint[];revision:number};
export const reconstructScan=(input:AssemblyInput)=>assembleScan(new Map(input.grids),input.edges,input.revision);
function permutations<T>(items:T[]):T[][] {
  if(!items.length)return [[]];
  return items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest]));
}

// Reject impossible and repeated pieces as soon as their faces are assigned.
// This prunes the orientation search before expensive full parity validation.
const pieces=[
  {slots:cornerFacelets,variants:cornerColors.flatMap((p,id)=>[0,1,2].map(r=>({id,colors:p.slice(r)+p.slice(0,r)})))},
  {slots:edgeFacelets,variants:edgeColors.flatMap((p,id)=>[{id,colors:p},{id,colors:[...p].reverse().join('')}])},
];
function piecesFit(facelets:(string|undefined)[]):boolean {
  for(const {slots,variants} of pieces){
    let used=0;
    for(const slot of slots){
      const colors=slot.map(i=>facelets[i]);
      if(colors.filter(Boolean).length<2)continue;
      const piece=variants.find(p=>colors.every((c,i)=>!c||c===p.colors[i]));
      if(!piece)return false;
      if(colors.every(Boolean)){
        if(used&(1<<piece.id))return false;
        used|=1<<piece.id;
      }
    }
  }
  return true;
}

// All candidates anchor the same center on U. These four physical rotations
// identify equivalent reconstructions when that face has a symmetric pattern.
const yaw=(v:readonly number[])=>[-v[2]!,v[1]!,v[0]!];
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,n,i)=>s+n*b[i]!,0);
const yawPermutation=FACES.flatMap(f=>Array.from({length:9},(_,i)=>{
  const b=BASIS[f],n=yaw(b.n),p=yaw(b.n.map((v,j)=>v+(i%3-1)*b.right[j]!+(Math.floor(i/3)-1)*b.down[j]!));
  const face=FACES.find(g=>dot(BASIS[g].n,n)===1)!,basis=BASIS[face];
  return FACES.indexOf(face)*9+(dot(p,basis.down)+1)*3+dot(p,basis.right)+1;
}));
function physicalKey(state:CubeState):string {
  let colors=[...state.facelets].map(f=>state.centers[f as Face]);
  const variants:string[]=[];
  for(let r=0;r<4;r++){
    variants.push(colors.join(','));const next=[...colors];
    yawPermutation.forEach((dest,src)=>{next[dest]=colors[src]!;});colors=next;
  }
  return variants.sort()[0]!;
}

/** Reconstruct only a unique legal cube, up to whole-cube rotation.
 * No assumed center scheme, face order, or visible neighboring pair is needed
 * when the captured pieces themselves determine the arrangement uniquely.
 */
export function assembleScan(grids:ReadonlyMap<CubeColor,FaceGrid<CubeColor>>,edges:readonly EdgeConstraint[],revision:number):ScanAssembly {
  if(grids.size!==6)return {};
  const first=edges[0],up=first?.a??grids.keys().next().value!;
  const remaining=[...grids.keys()].filter(c=>c!==up&&c!==first?.b);
  const states=new Map<string,CubeState>();
  for(const other of permutations(remaining)){
    const centers:CenterMap=first?{U:up,F:first.b,R:other[0]!,D:other[1]!,L:other[2]!,B:other[3]!}
      :{U:up,F:other[0]!,R:other[1]!,D:other[2]!,L:other[3]!,B:other[4]!};
    const inverse=Object.fromEntries(FACES.map(f=>[centers[f],f])) as Record<CubeColor,Face>;
    const allowed=Object.fromEntries(FACES.map(f=>[f,!first&&f==='U'?[0]:[0,1,2,3]])) as Record<Face,number[]>;
    let valid=true;
    for(const e of edges){
      const a=inverse[e.a],b=inverse[e.b],ea=edgeToward(a,b),eb=edgeToward(b,a);
      if(ea===null||eb===null){valid=false;break;}
      allowed[a]=allowed[a].filter(r=>e.aEdges.some(i=>(i+r)%4===ea));
      allowed[b]=allowed[b].filter(r=>e.bEdges.some(i=>(i+r)%4===eb));
      if(!allowed[a].length||!allowed[b].length){valid=false;break;}
    }
    if(!valid)continue;
    const variants=Object.fromEntries(FACES.map(f=>[f,[...new Set(allowed[f].map(r=>rotateGrid(grids.get(centers[f])!,r).map(c=>inverse[c]).join('')))]])) as Record<Face,string[]>;
    const facelets:(string|undefined)[]=Array(54);
    const order:Face[]=['U','F','R','D','L','B'];
    const build=(i:number)=>{
      if(states.size>1)return;
      if(i===6){
        const s=facelets.join('');
        // Six uniform faces require no turns, whatever the center arrangement.
        // Session still requests fresh camera verification before declaring solved.
        if(validateCube(s).valid){const state={facelets:s,centers,revision};states.set(s===SOLVED?SOLVED:physicalKey(state),state);}
        return;
      }
      const f=order[i]!,offset=FACES.indexOf(f)*9;
      for(const variant of variants[f]){
        for(let j=0;j<9;j++)facelets[offset+j]=variant[j];
        if(piecesFit(facelets))build(i+1);
        if(states.size>1)break;
      }
      facelets.fill(undefined,offset,offset+9);
    };
    build(0);
    if(states.size>1)return {};
  }
  return states.size===1?{state:[...states.values()][0]!}:{invalid:true};
}

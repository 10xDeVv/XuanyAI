import { FACES, Face, Move, CubeState, CenterMap, FaceGrid } from './types';

type V = [number, number, number];
const add = (a: V, b: V): V => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scale = (a: V, s: number): V => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a: V, b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Each face is viewed from outside the cube. */
export const BASIS: Record<Face, { n: V; right: V; down: V }> = {
  U: { n:[0,1,0], right:[1,0,0], down:[0,0,1] },
  R: { n:[1,0,0], right:[0,0,-1], down:[0,-1,0] },
  F: { n:[0,0,1], right:[1,0,0], down:[0,-1,0] },
  D: { n:[0,-1,0], right:[1,0,0], down:[0,0,-1] },
  L: { n:[-1,0,0], right:[0,0,1], down:[0,-1,0] },
  B: { n:[0,0,-1], right:[-1,0,0], down:[0,-1,0] },
};
const stickers = FACES.flatMap(face => Array.from({length:9}, (_,i) => ({
  face, n: BASIS[face].n,
  p: add(BASIS[face].n, add(scale(BASIS[face].right,i%3-1),scale(BASIS[face].down,Math.floor(i/3)-1))),
})));
const key = (p: V,n: V) => [...p,...n].join(',');
const index = new Map(stickers.map((s,i)=>[key(s.p,s.n),i]));
const clockwise = (v: V,n: V): V => add(scale(n,dot(n,v)),scale(cross(n,v),-1));
const permutations = Object.fromEntries(FACES.map(face => [face,stickers.map((s,i)=>
  dot(s.p,BASIS[face].n)===1 ? index.get(key(clockwise(s.p,BASIS[face].n),clockwise(s.n,BASIS[face].n)))! : i
)])) as Record<Face, number[]>;

export const SOLVED = FACES.map(f=>f.repeat(9)).join('');
export const ALL_MOVES = FACES.flatMap(f=>[f,`${f}'`,`${f}2`] as Move[]);
export const DEFAULT_CENTERS: CenterMap = {U:'white',R:'red',F:'green',D:'yellow',L:'orange',B:'blue'};
export function moveFacelets(facelets: string, move: Move): string {
  const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
  let chars = facelets.split('');
  for(let t=0;t<turns;t++) { const next = [...chars]; permutations[move[0] as Face].forEach((dest,src)=>{next[dest]=chars[src]!;}); chars=next; }
  return chars.join('');
}
export const applyMoves = (s: string, moves: readonly Move[]) => moves.reduce(moveFacelets,s);
export const inverseMove = (m: Move): Move => m.endsWith('2') ? m : m.endsWith("'") ? m[0] as Move : `${m}'` as Move;
export const quarterMoves = (moves: readonly Move[]): Move[] => moves.flatMap(m=>m.endsWith('2') ? [m[0] as Move,m[0] as Move] : [m]);
export function rotateGrid<T>(grid: readonly T[], turns: number): FaceGrid<T> {
  let out=[...grid];
  for(let i=0;i<((turns%4)+4)%4;i++) out=[out[6]!,out[3]!,out[0]!,out[7]!,out[4]!,out[1]!,out[8]!,out[5]!,out[2]!];
  return out as FaceGrid<T>;
}
export const rotationsMatching = <T>(a: readonly T[], b: readonly T[]) => [0,1,2,3].filter(r=>rotateGrid(a,r).every((v,i)=>v===b[i]));
export function edgeToward(face: Face, neighbor: Face): number | null {
  const b=BASIS[face], n=BASIS[neighbor].n;
  const directions=[scale(b.down,-1),b.right,b.down,scale(b.right,-1)];
  const edge=directions.findIndex(d=>dot(d,n)===1);
  return edge<0 ? null : edge;
}

// Ordered facelets match Kociemba's URFDLB convention. Corner ordering encodes chirality.
export const cornerFacelets = [[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
export const cornerColors = ['URF','UFL','ULB','UBR','DFR','DLF','DBL','DRB'];
export const edgeFacelets = [[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
export const edgeColors = ['UR','UF','UL','UB','DR','DF','DL','DB','FR','FL','BL','BR'];
const parity = (p: number[]) => p.reduce((sum,x,i)=>sum+p.slice(i+1).filter(y=>y<x).length,0)%2;
export type Validation = {valid:true} | {valid:false; reason:string};
export function validateCube(s: string): Validation {
  const fail=(reason:string):Validation=>({valid:false,reason});
  if(s.length!==54 || /[^URFDLB]/.test(s)) return fail('The scan needs all 54 squares.');
  if(FACES.some(f=>[...s].filter(x=>x===f).length!==9)) return fail('Some colors were read incorrectly. Show the cube again.');
  if(FACES.some((f,i)=>s[i*9+4]!==f)) return fail('The face centers are inconsistent.');
  const cp:number[]=[], ep:number[]=[], co:number[]=[], eo:number[]=[];
  for(const slots of cornerFacelets) {
    const colors=slots.map(i=>s[i]!);
    const orientation=colors.findIndex(c=>c==='U'||c==='D');
    if(orientation<0) return fail('A corner has an impossible color combination.');
    const normalized=[colors[orientation],colors[(orientation+1)%3],colors[(orientation+2)%3]].join('');
    const piece=cornerColors.indexOf(normalized);
    if(piece<0) return fail('A corner was mirrored or misread.');
    cp.push(piece); co.push(orientation);
  }
  for(const slots of edgeFacelets) {
    const colors=slots.map(i=>s[i]!).join('');
    let piece=edgeColors.indexOf(colors), flip=0;
    if(piece<0) {piece=edgeColors.indexOf([...colors].reverse().join(''));flip=1;}
    if(piece<0) return fail('An edge has an impossible color combination.');
    ep.push(piece);eo.push(flip);
  }
  if(new Set(cp).size!==8 || new Set(ep).size!==12) return fail('Some pieces were read twice. Rotate the cube for another look.');
  if(co.reduce((a,b)=>a+b,0)%3) return fail('Corner orientations do not form a solvable cube. Rescan to check.');
  if(eo.reduce((a,b)=>a+b,0)%2) return fail('An edge appears flipped. Rescan to check.');
  if(parity(cp)!==parity(ep)) return fail('Piece positions do not form a solvable cube. Rescan to check.');
  return {valid:true};
}
export function stateAfter(state: CubeState,move: Move): CubeState {
  return {...state,facelets:moveFacelets(state.facelets,move),revision:state.revision+1};
}

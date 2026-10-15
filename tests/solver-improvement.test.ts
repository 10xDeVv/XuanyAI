import {beforeAll,expect,it} from 'vitest';
import Cube from '../vendor/cubejs';
import {ALL_MOVES,inverseMove,quarterMoves,SOLVED} from '../src/core/cube';
import {Move} from '../src/core/types';
import {improveSolution} from '../src/solver/improveSolution';
import {shortenSolution} from '../src/solver/shortSolution';
import {initializeSolver} from '../src/solver/solve';

beforeAll(initializeSolver);
const full="F2 B' U R' F R2 F L2 R2 D' F U2 B2 R' F D' B2 R2 F2 B' F2 R2 L2 F' D2";
const input=()=>Cube.fromString(SOLVED).move(full).asString();
const baseline=(facelets:string)=>shortenSolution(quarterMoves(Cube.fromString(facelets).solve().split(' ') as Move[]));
const verify=(facelets:string,moves:Move[])=>{
  expect(moves.every(m=>/^[URFDLB]'?$/.test(m))).toBe(true);
  expect(Cube.fromString(facelets).move(moves.join(' ')).asString()).toBe(SOLVED);
};

it('finds a strictly shorter full-scramble plan within a deterministic work bound',()=>{
  const facelets=input(),before=baseline(facelets),saved=[...before];
  const after=improveSolution(facelets,before,{now:()=>0,maxNodes:2_000_000});
  expect(after.length).toBeLessThan(before.length);
  verify(facelets,after);expect(before).toEqual(saved);
});

it('preserves the verified incumbent when time or node budgets expire',()=>{
  const facelets=input(),before=baseline(facelets);
  expect(improveSolution(facelets,before,{budgetMs:0})).toEqual(before);
  expect(improveSolution(facelets,before,{maxNodes:0,now:()=>0})).toEqual(before);
  let clock=0,calls=0;
  const after=improveSolution(facelets,before,{now:()=>{calls++;return clock+=20;}});
  expect(calls).toBeLessThan(30);expect(after.length).toBeLessThanOrEqual(before.length);verify(facelets,after);
  // A frozen/coarse timer still cannot cause an unbounded search.
  const limited=improveSolution(facelets,before,{now:()=>0,maxNodes:384});
  expect(limited.length).toBeLessThanOrEqual(before.length);verify(facelets,limited);
});

it('maps alternative search axes back to the input and never lengthens a plan',()=>{
  let seed=241;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  let improved=0;
  for(let i=0;i<12;i++){
    const scramble=Array.from({length:25},()=>ALL_MOVES[random()%18]!);
    const facelets=Cube.fromString(SOLVED).move(scramble.join(' ')).asString(),before=baseline(facelets);
    const after=improveSolution(facelets,before,{now:()=>0,maxNodes:500_000});
    expect(after.length).toBeLessThanOrEqual(before.length);verify(facelets,after);
    if(after.length<before.length)improved++;
  }
  expect(improved).toBeGreaterThan(0);
});

it('can start directly in phase two and retains already short or empty plans',()=>{
  for(const scramble of ["R2 F2 U B2",'U D',"R U R' U'",'']){
    const moves=scramble?scramble.split(' ') as Move[]:[];
    const facelets=Cube.fromString(SOLVED).move(scramble).asString();
    const short=quarterMoves([...moves].reverse().map(inverseMove));
    const after=improveSolution(facelets,short,{now:()=>0,maxNodes:10_000});
    expect(after.length).toBeLessThanOrEqual(short.length);verify(facelets,after);
    if(moves.length){
      const padded=[...short,'R',"R'",'U',"U'"] as Move[];
      const shorter=improveSolution(facelets,padded,{now:()=>0,maxNodes:100_000});
      expect(shorter.length).toBeLessThan(padded.length);verify(facelets,shorter);
    }
  }
});

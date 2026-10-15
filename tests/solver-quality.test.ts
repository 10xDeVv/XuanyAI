import {describe,expect,it} from 'vitest';
import Cube from '../vendor/cubejs';
import {ALL_MOVES,applyMoves,quarterMoves,SOLVED} from '../src/core/cube';
import {CubeScanner} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {FACES,Face,Move} from '../src/core/types';
import {shortenSolution,shortSolution} from '../src/solver/shortSolution';
import {initializeSolver,solveFacelets} from '../src/solver/solve';
import {observation,projected,state} from './fixtures';

const quarters=ALL_MOVES.filter(m=>!m.endsWith('2'));
// Independent move engine and an ordinary one-sided BFS serve as the oracle.
function exactDistances(maxDepth:number){
  const distances=new Map([[SOLVED,0]]);let frontier=[SOLVED];
  for(let depth=1;depth<=maxDepth;depth++){
    const next:string[]=[];
    for(const s of frontier)for(const m of quarters){
      const after=Cube.fromString(s).move(m).asString();
      if(!distances.has(after)){distances.set(after,depth);next.push(after);}
    }
    frontier=next;
  }
  return distances;
}
describe('solution length and correctness',()=>{
  it('returns optimal 90-degree step counts for every one- and two-face-turn scramble',()=>{
    const distances=exactDistances(4);
    const scrambles:Move[][]=[[],...ALL_MOVES.map(m=>[m]),...ALL_MOVES.flatMap(a=>ALL_MOVES.map(b=>[a,b]))];
    for(const scramble of scrambles){
      const input=Cube.fromString(SOLVED).move(scramble.join(' ')).asString();
      const solution=solveFacelets(input);
      expect(solution.length,scramble.join(' ')).toBe(distances.get(input));
      expect(Cube.fromString(input).move(solution.join(' ')).asString(),scramble.join(' ')).toBe(SOLVED);
      expect(solution.every(m=>!m.endsWith('2'))).toBe(true);
    }
  },30000);
  it('finds verified short routes for varied five- and six-quarter-turn states',()=>{
    let seed=7919;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let trial=0;trial<60;trial++){
      const scramble=Array.from({length:5+trial%2},()=>quarters[random()%quarters.length]!);
      const input=Cube.fromString(SOLVED).move(scramble.join(' ')).asString(),solution=shortSolution(input);
      expect(solution).toBeDefined();expect(solution!.length).toBeLessThanOrEqual(scramble.length);
      expect(Cube.fromString(input).move(solution!.join(' ')).asString()).toBe(SOLVED);
    }
  });
  it('removes redundant turns without changing their effect on scrambled cubes',()=>{
    const starting=Cube.fromString(SOLVED).move("R F U2 B L' D R2").asString();
    const routes:Move[][]=[['R',"R'"],['U','U','U'],['R','L',"R'"],['U','D',"U'","D'"],['F','R',"R'",'B','B','B',"F'"]];
    for(const route of routes){
      const shorter=shortenSolution(route);
      expect(shorter.length).toBeLessThan(route.length);
      expect(Cube.fromString(starting).move(shorter.join(' ')).asString()).toBe(Cube.fromString(starting).move(route.join(' ')).asString());
    }
  });
  it('retains verified Kociemba solutions for full scrambles and never makes them longer',()=>{
    initializeSolver();
    let seed=121;const random=()=>{seed=(Math.imul(seed,1103515245)+12345)>>>0;return seed;};
    for(let trial=0;trial<20;trial++){
      const scramble=Array.from({length:24},()=>ALL_MOVES[random()%18]!);
      const input=Cube.fromString(SOLVED).move(scramble.join(' ')).asString();
      const before=quarterMoves(Cube.fromString(input).solve().trim().split(/\s+/) as Move[]),after=solveFacelets(input);
      expect(after.length).toBeLessThanOrEqual(before.length);
      expect(Cube.fromString(input).move(after.join(' ')).asString()).toBe(SOLVED);
    }
  },30000);
  it('rejects impossible input and does not change a valid starting state',()=>{
    const input=applyMoves(SOLVED,['R','U']),saved=input;
    expect(solveFacelets(SOLVED)).toEqual([]);
    expect(solveFacelets(input)).toEqual(["U'","R'"]);
    expect(input).toBe(saved);
    expect(()=>solveFacelets(SOLVED.slice(1))).toThrow();
    const flipped=[...SOLVED];[flipped[5],flipped[10]]=[flipped[10]!,flipped[5]!];
    expect(()=>solveFacelets(flipped.join(''))).toThrow();
  });
});

it('preserves short physical scrambles through arbitrary scan references and reconstruction',()=>{
  const views:Face[][]=[['F','R','U'],['B','L','D'],['U','B','R'],['D','F','L']];
  for(let i=0;i<ALL_MOVES.length;i++)for(const second of ALL_MOVES){
    const scramble=[ALL_MOVES[i]!,second],physical=state(applyMoves(SOLVED,scramble)),scanner=new CubeScanner();
    if(i%2)physical.centers={U:'red',R:'blue',F:'white',D:'green',L:'yellow',B:'orange'};
    let result,t=0;
    // Change the first face and thus the scanner's internal coordinate system.
    const order=[...FACES.slice(i%6),...FACES.slice(0,i%6)];
    for(const f of order)for(let n=0;n<3;n++)result=scanner.observe(observation(physical,[f],t+=150));
    for(const faces of views)for(let n=0;n<3;n++)result=scanner.observe(projected(physical,faces,t+=150));
    expect(result!.state,scramble.join(' ')).toBeDefined();
    const captured=result!.state!;
    for(const faces of views)expect(matchObservation(captured,projected(physical,faces,t)),JSON.stringify({scramble,faces,captured,physical})).not.toBeNull();
    const moves=solveFacelets(captured.facelets);
    expect(moves.length,scramble.join(' ')).toBeLessThanOrEqual(quarterMoves(scramble).length);
    expect(Cube.fromString(captured.facelets).move(moves.join(' ')).asString()).toBe(SOLVED);
  }
},30000);

it('requires actual orientation evidence for uniform faces instead of choosing a mirrored center layout',()=>{
  const physical=state(SOLVED),scanner=new CubeScanner();let result,t=0;
  physical.centers={U:'red',R:'blue',F:'white',D:'green',L:'yellow',B:'orange'};
  for(const f of FACES)for(let n=0;n<3;n++)result=scanner.observe(observation(physical,[f],t+=150));
  expect(result!.captured).toHaveLength(6);expect(result!.state).toBeUndefined();expect(result!.message).toContain('three sides');
  const views:Face[][]=[['F','R','U'],['B','L','D'],['U','B','R'],['D','F','L']];
  for(const faces of views)for(let n=0;n<3;n++)result=scanner.observe(projected(physical,faces,t+=150));
  expect(result!.state).toBeDefined();
  for(const faces of views)expect(matchObservation(result!.state!,projected(physical,faces,t))).not.toBeNull();
  expect(solveFacelets(result!.state!.facelets)).toEqual([]);
});

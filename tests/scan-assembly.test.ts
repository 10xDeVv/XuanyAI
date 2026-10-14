import {expect,it} from 'vitest';
import {ALL_MOVES,applyMoves,rotateGrid,SOLVED} from '../src/core/cube';
import {assembleScan,AssemblyInput,reconstructScan,ScanAssembly} from '../src/core/assembleScan';
import {CubeScanner} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {CubeState,Face,FACES} from '../src/core/types';
import {Session} from '../src/session/Session';
import {solveFacelets} from '../src/solver/solve';
import {observation,projected,seen,state} from './fixtures';

const scramble=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
const grids=(s:CubeState)=>new Map(FACES.map((f,i)=>[s.centers[f],rotateGrid(seen(s,f).colors,i%4)]));
const views:Face[][]=[['F','R','U'],['B','L','D'],['U','B','R'],['D','F','L']];
it('reconstructs varied face orders, orientations, and center schemes without guessed rotations',()=>{
  let seed=123456;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  let completed=0;
  for(let trial=0;trial<24;trial++){
    const moves=Array.from({length:22},()=>ALL_MOVES[random()%18]!);
    const s=state(applyMoves(SOLVED,moves));
    if(trial%2)s.centers={U:'blue',F:'yellow',R:'white',D:'orange',L:'green',B:'red'};
    const shuffled=[...FACES];for(let i=shuffled.length-1;i>0;i--){const j=random()%(i+1);[shuffled[i],shuffled[j]]=[shuffled[j]!,shuffled[i]!];}
    const input=new Map(shuffled.map(f=>[s.centers[f],rotateGrid(seen(s,f).colors,random()%4)]));
    const result=assembleScan(input,[],7);
    expect(result.invalid).not.toBe(true);
    if(!result.state)continue; // Genuinely ambiguous states need a connecting view.
    completed++;
    expect(result.state.revision).toBe(7);
    for(const faces of views)expect(matchObservation(result.state,projected(s,faces,100))).not.toBeNull();
  }
  expect(completed).toBeGreaterThanOrEqual(20);
});
it('keeps symmetric patterns legal without accepting an incompatible arrangement',()=>{
  const s=state(applyMoves(SOLVED,['R2','F2','B2','L2','U2','D2','R2','U2','F2']));
  const result=assembleScan(grids(s),[],1);
  if(result.state)for(const faces of views)expect(matchObservation(result.state,projected(s,faces,100))).not.toBeNull();
  expect(result.invalid).not.toBe(true);
});
it('rejects a flipped edge even when color counts are correct',()=>{
  const s=[...SOLVED];[s[5],s[10]]=[s[10]!,s[5]!];
  expect(assembleScan(grids(state(s.join(''))),[],1).state).toBeUndefined();
});
it('moves directly from six single-face captures into a verified solution plan',async()=>{
  const requests:CubeState[]=[];
  const session=new Session({ready:async()=>{},dispose(){},solve:async s=>{
    requests.push(s);return {revision:s.revision,moves:solveFacelets(s.facelets)};
  }});
  session.start();let t=0;
  for(const f of ['B','U','L','D','R','F'] as Face[])for(let n=0;n<3;n++){
    const o=observation(scramble,[f],t+=150);o.faces[0]!.colors=rotateGrid(o.faces[0]!.colors,FACES.indexOf(f)%4);
    session.observe(o);
  }
  expect(session.getSnapshot().stage).toBe('planning');
  await Promise.resolve();
  const view=session.getSnapshot();expect(view.stage).toBe('guiding');expect(requests).toHaveLength(1);
  expect(view.solution!.moves.length).toBeGreaterThan(0);
  expect(applyMoves(view.solution!.state.facelets,view.solution!.moves)).toBe(SOLVED);
  for(const faces of views)expect(matchObservation(view.solution!.state,projected(scramble,faces,t))).not.toBeNull();
  session.dispose();
},30000);
it('keeps an explicit connecting instruction through blur and missing frames for ambiguous faces',()=>{
  const scanner=new CubeScanner(),s=state(applyMoves(SOLVED,['R']));let t=0,result;
  for(const f of FACES)for(let n=0;n<3;n++)result=scanner.observe(observation(s,[f],t+=150));
  expect(result!.captured).toHaveLength(6);expect(result!.state).toBeUndefined();
  expect(result!.phase).toBe('connecting');expect(result!.message).toContain('neighboring side');
  const instruction=result!.message;
  for(const quality of ['blur','glare','missing'] as const){
    result=scanner.observe({...observation(s,[],t+=150),quality});
    expect(result.captured).toHaveLength(6);expect(result.message).toBe(instruction);expect(result.phase).toBe('connecting');
  }
  for(const faces of views)for(let n=0;n<3;n++)result=scanner.observe(projected(s,faces,t+=150));
  expect(result!.state).toBeDefined();
  for(const faces of views)expect(matchObservation(result!.state!,projected(s,faces,t))).not.toBeNull();
});
it('runs background reconstruction once and opens the guide without needing another camera frame',async()=>{
  let resolve!:(v:ScanAssembly)=>void,input!:AssemblyInput,requests=0;
  const session=new Session({ready:async()=>{},dispose(){},assemble:scan=>{requests++;input=scan;return new Promise(r=>{resolve=r;});},solve:async s=>({revision:s.revision,moves:['R']})});
  session.start();let t=0;
  for(const f of FACES)for(let n=0;n<3;n++)session.observe(observation(scramble,[f],t+=150));
  expect(session.getSnapshot()).toMatchObject({stage:'scanning',scanPhase:'checking'});
  for(let n=0;n<5;n++)session.observe(observation(scramble,['B'],t+=150));
  expect(requests).toBe(1);
  resolve(reconstructScan(input));await Promise.resolve();await Promise.resolve();
  expect(session.getSnapshot().stage).toBe('guiding');session.dispose();
});
it('discards reconstruction results after a reset or a conflicting color observation',async()=>{
  for(const interruption of ['reset','conflict']){
    let resolve!:(v:ScanAssembly)=>void,input!:AssemblyInput,solves=0;
    const session=new Session({ready:async()=>{},dispose(){},assemble:scan=>{input=scan;return new Promise(r=>{resolve=r;});},solve:async s=>{solves++;return {revision:s.revision,moves:['R']};}});
    session.start();let t=0;
    for(const f of FACES)for(let n=0;n<3;n++)session.observe(observation(scramble,[f],t+=150));
    if(interruption==='reset')session.rescan();
    else {const o=observation(scramble,['F'],t+=150);o.faces[0]!.colors[0]=o.faces[0]!.colors[0]==='white'?'blue':'white';session.observe(o);}
    resolve(reconstructScan(input));await Promise.resolve();await Promise.resolve();
    expect(solves).toBe(0);expect(session.getSnapshot().stage).toBe('scanning');session.dispose();
  }
});
it('shows background reconstruction failures instead of waiting forever at six faces',async()=>{
  const session=new Session({ready:async()=>{},dispose(){},assemble:async()=>{throw new Error('Cube check timed out');},solve:async s=>({revision:s.revision,moves:[]})});
  session.start();let t=0;
  for(const f of FACES)for(let n=0;n<3;n++)session.observe(observation(scramble,[f],t+=150));
  await Promise.resolve();expect(session.getSnapshot()).toMatchObject({stage:'error',message:'Cube check timed out'});session.dispose();
});
it('retries after an obsolete reconstruction fails during a color recheck',async()=>{
  let reject!:(error:Error)=>void,requests=0;
  const scanner=new CubeScanner({assemble:()=>{requests++;return new Promise((_,r)=>{reject=r;});},complete(){},error(){throw new Error('Obsolete failure must be ignored');}});
  let t=0;
  for(const f of FACES)for(let n=0;n<3;n++)scanner.observe(observation(scramble,[f],t+=150));
  const conflict=observation(scramble,['F'],t+=150);conflict.faces[0]!.colors[0]=conflict.faces[0]!.colors[0]==='white'?'blue':'white';scanner.observe(conflict);
  reject(new Error('Obsolete background failure'));await Promise.resolve();
  for(let n=0;n<3;n++)scanner.observe(observation(scramble,['F'],t+=150));
  expect(requests).toBe(2);scanner.reset();
});

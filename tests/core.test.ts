import {describe,it,expect} from 'vitest';
import Cube from '../vendor/cubejs';
import {ALL_MOVES,SOLVED,moveFacelets,applyMoves,inverseMove,validateCube,rotateGrid,edgeToward} from '../src/core/cube';
import {solveFacelets} from '../src/solver/solve';
import {CubeTracker,matchObservation} from '../src/core/tracker';
import {CubeScanner} from '../src/core/scanner';
import {Session} from '../src/session/Session';
import {observation,projected,state} from './fixtures';
import {Face,FACES,Move,SolverAdapter} from '../src/core/types';
import {projectOnQuad,toPreview,turnArrow} from '../src/core/geometry';

const scramble=['R','U',"F'",'D','L2','B',"R'",'U2','F','L'] as Move[];
describe('cube model',()=>{
  it('agrees with the independently implemented cubejs engine for all 18 moves',()=>{
    const base=applyMoves(SOLVED,scramble);
    for(const move of ALL_MOVES)expect(moveFacelets(base,move)).toBe(Cube.fromString(base).move(move).asString());
  });
  it('round-trips every move and preserves legality over long deterministic scrambles',()=>{
    let s=SOLVED;
    for(let i=0;i<1000;i++) {const move=ALL_MOVES[(i*7+Math.floor(i/13))%18]!;expect(moveFacelets(moveFacelets(s,move),inverseMove(move))).toBe(s);s=moveFacelets(s,move);expect(validateCube(s).valid).toBe(true);}
  });
  it('rejects a single flipped edge, twisted corner, swapped edges, and mirrored corner',()=>{
    const altered=(slots:number[],values:string[])=>{const s=[...SOLVED];slots.forEach((slot,i)=>s[slot]=values[i]!);return s.join('');};
    expect(validateCube(altered([5,10],['R','U'])).valid).toBe(false);
    expect(validateCube(altered([8,9,20],['R','F','U'])).valid).toBe(false);
    expect(validateCube(altered([10,19],['F','R'])).valid).toBe(false);
    expect(validateCube(altered([9,20],['F','R'])).valid).toBe(false);
    expect(validateCube(SOLVED.slice(1)).valid).toBe(false);
  });
  it('returns only verified quarter turns for randomized states',()=>{
    for(let i=0;i<20;i++){const cube=Cube.random();const result=solveFacelets(cube.asString());expect(result.every(m=>!m.endsWith('2'))).toBe(true);expect(applyMoves(cube.asString(),result)).toBe(SOLVED);}
  },30000);
});
describe('automatic scanning',()=>{
  it('assembles an arbitrary scramble from adjacent views in arbitrary order',()=>{
    const scanner=new CubeScanner(),s=state(applyMoves(SOLVED,scramble));
    const views:Face[][]=[['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D'],['B','U','R']];
    let t=0,result;
    for(const view of views)for(let frame=0;frame<4;frame++){t+=120;result=scanner.observe(projected(s,view,t));}
    expect(result?.state).toBeDefined();
    expect(validateCube(result!.state!.facelets).valid).toBe(true);
    // Map reconstructed state back to physical center colors rather than assuming fixed U/F centers.
    expect(new Set(result!.captured).size).toBe(6);
    for(const faces of views)expect(matchObservation(result!.state!,projected(s,faces,t+100))).not.toBeNull();
    expect(applyMoves(result!.state!.facelets,solveFacelets(result!.state!.facelets))).toBe(SOLVED);
  },30000);
  it('reconstructs a unique scramble from isolated faces without requiring an adjacent view',()=>{
    const scanner=new CubeScanner(),s=state(applyMoves(SOLVED,scramble));let result,t=0;
    for(const f of FACES)for(let n=0;n<3;n++){t+=150;result=scanner.observe(observation(s,[f],t));}
    expect(result!.captured).toHaveLength(6);expect(result!.state).toBeDefined();
    for(const faces of [['F','R','U'],['B','L','D']] as Face[][])expect(matchObservation(result!.state!,projected(s,faces,t+150))).not.toBeNull();
  });
  it('quarantines conflicting views without erasing saved faces',()=>{
    const scanner=new CubeScanner(),s=state(applyMoves(SOLVED,scramble));
    for(let i=0;i<3;i++)scanner.observe(observation(s,['F'],i*150));
    const changed=state(moveFacelets(s.facelets,'U'));let result;
    for(let i=0;i<3;i++)result=scanner.observe(observation(changed,['F'],500+i*150));
    expect(result!.state).toBeUndefined();expect(result!.captured).toHaveLength(1);
    expect(result!.rechecking).toEqual([s.centers.F]);
  });
  it('requires fresh consecutive frames after a gap or obscured view',()=>{
    const scanner=new CubeScanner(),s=state(applyMoves(SOLVED,scramble));
    scanner.observe(observation(s,['F'],0));scanner.observe(observation(s,['F'],150));
    scanner.observe({...observation(s,['F'],200),quality:'blur'});
    expect(scanner.observe(observation(s,['F'],350)).captured).toHaveLength(0);
    expect(scanner.observe(observation(s,['F'],2000)).captured).toHaveLength(0);
    scanner.observe(observation(s,['F'],2150));
    expect(scanner.observe(observation(s,['F'],2300)).captured).toHaveLength(1);
  });
  it('targets a lower-confidence conflicting face for reacquisition',()=>{
    const scanner=new CubeScanner(),s=state(applyMoves(SOLVED,scramble));let t=0,result;
    for(const f of FACES)for(let n=0;n<3;n++){
      const o=observation(s,[f],t+=150);
      if(f==='F'){o.faces[0]!.colors[0]=o.faces[0]!.colors[0]==='white'?'blue':'white';o.faces[0]!.confidence.fill(.7);}
      result=scanner.observe(o);
    }
    expect(result!.state).toBeUndefined();expect(result!.captured).not.toContain(s.centers.F);
    expect(result!.message).toContain(s.centers.F);
  });
});
describe('complete session',()=>{
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const solver:SolverAdapter={ready:async()=>{},solve:async s=>({revision:s.revision,moves:solveFacelets(s.facelets)}),dispose:()=>{}};
  async function scanned(){
    const session=new Session(solver),physical=state(applyMoves(SOLVED,scramble));session.start();let t=0;
    for(const faces of [['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']] as Face[][]){
      for(let i=0;i<4;i++)session.observe(projected(physical,faces,t+=150));
    }
    await tick();expect(session.getSnapshot().stage).toBe('guiding');return {session,t};
  }
  it('replans after a wrong turn and confirms all six faces before success',async()=>{
    const run=await scanned(),session=run.session;let t=run.t;
    let cube=session.getSnapshot().cube!;
    for(let i=0;i<3;i++)session.observe(observation(cube,['F','R','U'],t+=150));
    const expected=session.getSnapshot().nextMove;
    const wrong=expected==='U'?'R':'U';
    const deviated={...cube,facelets:moveFacelets(cube.facelets,wrong)};
    for(let i=0;i<3;i++)session.observe(observation(deviated,['F','R','U'],t+=150));
    await tick();expect(session.getSnapshot().corrections).toBe(1);
    for(let turns=0;turns<100&&session.getSnapshot().stage!=='verifying';turns++){
      cube=session.getSnapshot().cube!;
      for(let i=0;i<3;i++)session.observe(observation(cube,['F','R','U'],t+=150));
      const move=session.getSnapshot().nextMove!;expect(move).toBeDefined();
      const after={...cube,facelets:moveFacelets(cube.facelets,move)};
      for(let i=0;i<3;i++)session.observe(observation(after,['F','R','U'],t+=150));
      await tick();
    }
    expect(session.getSnapshot().stage).toBe('verifying');
    for(const faces of [['F','R','U'],['L','D','F']] as Face[][])for(let i=0;i<3;i++)session.observe(observation(session.getSnapshot().cube!,faces,t+=150));
    expect(session.getSnapshot().stage).toBe('verifying');
    for(let i=0;i<3;i++)session.observe(observation(session.getSnapshot().cube!,['B','R','D'],t+=150));
    expect(session.getSnapshot().stage).toBe('solved');
  });
  it('does not combine old solved views with a hidden turn or tracking loss',async()=>{
    for(const interruption of ['hidden-turn','blur','gap']){
      const session=new Session(solver),physical=state(SOLVED);session.start();let t=0;
      for(const faces of [['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']] as Face[][])for(let i=0;i<4;i++)session.observe(projected(physical,faces,t+=150));
      await tick();expect(session.getSnapshot().stage).toBe('verifying');
      const cube=session.getSnapshot().cube!;
      for(const faces of [['F','R','U'],['L','D','F']] as Face[][])for(let i=0;i<3;i++)session.observe(observation(cube,faces,t+=150));
      expect(session.getSnapshot().message).toContain('5/6');
      if(interruption==='hidden-turn'){
        const turned={...cube,facelets:moveFacelets(cube.facelets,'B')};
        for(let i=0;i<3;i++)session.observe(observation(turned,['B'],t+=150));
        expect(session.getSnapshot().stage).toBe('verifying');
        session.observe(observation(turned,['B','R','D'],t+=150));
        expect(session.getSnapshot().stage).toBe('scanning');
      }else{
        if(interruption==='blur')session.observe({...observation(cube,['F','R'],t+=150),quality:'blur'});
        else t+=1000;
        for(let i=0;i<3;i++)session.observe(observation(cube,['B','R','D'],t+=150));
        expect(session.getSnapshot().stage).toBe('verifying');
        expect(session.getSnapshot().message).toContain('3/6');
      }
    }
  });
  it('rescans after backgrounding and ignores an obsolete solver result',async()=>{
    const {session}=await scanned();session.suspend();expect(session.getSnapshot().stage).toBe('scanning');expect(session.getSnapshot().cube).toBeUndefined();
    let resolve:((v:{revision:number;moves:Move[]})=>void)|undefined;
    const delayed:SolverAdapter={ready:async()=>{},solve:()=>new Promise(r=>{resolve=r;}),dispose:()=>{}};
    const other=new Session(delayed),physical=state(applyMoves(SOLVED,scramble));other.start();let t=0;
    for(const faces of [['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']] as Face[][])for(let i=0;i<4;i++)other.observe(projected(physical,faces,t+=150));
    expect(other.getSnapshot().stage).toBe('planning');const revision=other.getSnapshot().cube!.revision;other.rescan();resolve!({revision,moves:['R']});await tick();expect(other.getSnapshot().stage).toBe('scanning');
  });
});
describe('turn verification',()=>{
  it('recognizes every legal turn from settled observations',()=>{
    const before=state(applyMoves(SOLVED,scramble));
    for(const move of ALL_MOVES){
      const tracker=new CubeTracker(),after=state(moveFacelets(before.facelets,move));let result;
      for(let i=0;i<3;i++)result=tracker.observe(before,observation(after,['F','R','U'],i*150));
      expect(result!.move,move).toBe(move);expect(result!.state?.revision).toBe(2);
    }
  });
  it('does not infer an invisible back turn from only the front face',()=>{
    const before=state(applyMoves(SOLVED,scramble)),after=state(moveFacelets(before.facelets,'B')),tracker=new CubeTracker();
    expect(tracker.observe(before,observation(after,['F'],100)).status).toBe('ambiguous');
  });
  it('does not confirm across a tracking gap or guess a two-turn mismatch',()=>{
    const before=state(applyMoves(SOLVED,scramble)),after=state(moveFacelets(before.facelets,'R')),tracker=new CubeTracker();
    tracker.observe(before,observation(after,['F','R','U'],0));tracker.observe(before,observation(after,['F','R','U'],150));
    expect(tracker.observe(before,observation(after,['F','R','U'],2000)).status).toBe('settling');
    const missed=state(applyMoves(before.facelets,['R','U']));
    expect(tracker.observe(before,observation(missed,['F','R','U'],2200)).status).toBe('lost');
  });
  it('rejects blur and stale frames and requires consecutive settled evidence',()=>{
    const s=state(applyMoves(SOLVED,scramble)),tracker=new CubeTracker(),o=observation(s,['F','R','U'],100);
    expect(tracker.observe(s,{...o,quality:'blur'}).status).toBe('lost');
    expect(tracker.observe(s,o).status).toBe('settling');
    expect(tracker.observe(s,{...o,timestamp:300}).status).toBe('settling');
  });
});
describe('projection',()=>{
  it('maps perspective corners exactly and uses object-fit cover cropping',()=>{
    const q=[{x:10,y:20},{x:90,y:5},{x:120,y:100},{x:0,y:90}] as const;
    expect(projectOnQuad([...q],0,0)).toEqual(q[0]);
    expect(projectOnQuad([...q],1,1).x).toBeCloseTo(q[2].x);
    expect(toPreview({x:320,y:240},{frameWidth:640,frameHeight:480,previewWidth:300,previewHeight:300,rotation:0,mirrored:false})).toEqual({x:150,y:150});
    expect(turnArrow([...q],true).path).not.toBe(turnArrow([...q],false).path);
  });
  it('rotates a grid without changing its contents',()=>{expect(rotateGrid([0,1,2,3,4,5,6,7,8],4)).toEqual([0,1,2,3,4,5,6,7,8]);expect(edgeToward('F','R')).toBe(1);expect(edgeToward('F','B')).toBeNull();});
});

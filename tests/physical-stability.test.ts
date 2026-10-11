import {describe,expect,it} from 'vitest';
import {applyMoves,moveFacelets,SOLVED} from '../src/core/cube';
import {CubeScanner} from '../src/core/scanner';
import {CubeTracker} from '../src/core/tracker';
import {physicalFrameGapMs} from '../src/core/timing';
import {CubeObservation,Face,FACES,SolverAdapter} from '../src/core/types';
import {Session} from '../src/session/Session';
import {observation,projected,state} from './fixtures';
import {netFrame} from './net-fixtures';

const physical=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
const adapter=():SolverAdapter=>({ready:async()=>{},solve:async s=>({revision:s.revision,moves:[]}),dispose(){}});
const slow=(o:CubeObservation,processingMs=800)=>({...o,processingMs});

describe('physical scan mode stability',()=>{
  it.each(['weak-four','unarranged-six','larger-grid'])('preserves physical capture through a transient %s observation',noise=>{
    const session=new Session(adapter());session.start();
    for(const t of [0,150,300])session.observe(observation(physical,['F'],t));
    expect(session.getSnapshot().captured).toEqual([physical.centers.F]);
    const noisy=observation(physical,noise==='unarranged-six'?[...FACES]:['F','R','U','B'],450);
    if(noise==='weak-four')noisy.faces.forEach(f=>f.confidence.fill(.51));
    if(noise==='larger-grid')noisy.largerGrid=true;
    session.observe(noisy);
    for(const t of [600,750,900])session.observe(observation(physical,['F'],t));
    expect(session.getSnapshot()).toMatchObject({stage:'scanning',captured:[physical.centers.F]});
    expect(session.getSnapshot().diagramCount).toBeUndefined();
    session.dispose();
  });
  it('requires repeated matching spatial evidence before changing to picture capture',()=>{
    const session=new Session(adapter()),net=netFrame();session.start();
    session.observe(net);
    expect(session.getSnapshot().diagramCount).toBeUndefined();
    session.observe(observation(physical,['F'],150));
    session.observe({...net,timestamp:300});
    expect(session.getSnapshot().diagramCount).toBeUndefined();
    session.observe({...net,timestamp:450});
    expect(session.getSnapshot()).toMatchObject({stage:'scanning',diagramCount:6,diagramConfirmations:2});
    session.observe({...net,timestamp:600});session.observe({...net,timestamp:750});
    expect(session.getSnapshot().stage).toBe('picture');session.dispose();
  });
});

describe('physical capture cadence',()=>{
  it.each([800,900,1000])('assembles faces and adjacency at a %i ms measured detector cadence',cadence=>{
    const scanner=new CubeScanner();let t=0,result;
    const views:Face[][]=[['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']];
    for(const faces of views)for(let i=0;i<3;i++)result=scanner.observe(slow(projected(physical,faces,t+=cadence),cadence-100));
    expect(result!.state).toBeDefined();expect(result!.captured).toHaveLength(6);
  });
  it.each([800,900,1000])('verifies a distinguishable move at %i ms cadence',cadence=>{
    const tracker=new CubeTracker(),after=state(moveFacelets(physical.facelets,'R'));let result;
    for(let i=0;i<3;i++)result=tracker.observe(physical,slow(observation(after,['F','R','U'],i*cadence),cadence-100));
    expect(result).toMatchObject({status:'move',move:'R'});
  });
  it('retains the short gap deadline for fast frames and bounds the extension',()=>{
    expect(physicalFrameGapMs(1)).toBe(800);
    expect(physicalFrameGapMs(100,950)).toBe(1150);
    expect(physicalFrameGapMs(1e9)).toBe(1200);
    expect(physicalFrameGapMs(NaN,Infinity)).toBe(800);
    const scanner=new CubeScanner(),tracker=new CubeTracker();
    for(const timestamp of [0,150,950]){
      const o=observation(physical,['F','R','U'],timestamp);
      expect(tracker.observe(physical,o).status).toBe('settling');
    }
    for(const timestamp of [0,900,2200])expect(scanner.observe(slow(observation(physical,['F'],timestamp))).captured).toHaveLength(0);
    expect(scanner.observe(slow(observation(physical,['F'],3100))).captured).toHaveLength(0);
    expect(scanner.observe(slow(observation(physical,['F'],4000))).captured).toHaveLength(1);
  });
  it('does not combine confirmations across a changed, obscured, or ambiguous state',()=>{
    const changed=state(moveFacelets(physical.facelets,'R'));
    for(const interruption of ['change','blur','ambiguous'] as const){
      const tracker=new CubeTracker();
      for(const timestamp of [0,900])expect(tracker.observe(physical,slow(observation(changed,['F','R','U'],timestamp))).status).toBe('settling');
      const o=slow(observation(interruption==='change'||interruption==='ambiguous'?physical:changed,interruption==='ambiguous'?['F']:['F','R','U'],1800));
      if(interruption==='blur')o.quality='blur';
      expect(tracker.observe(physical,o).status).not.toBe('move');
      expect(tracker.observe(physical,slow(observation(changed,['F','R','U'],2700))).status).toBe('settling');
    }
    const scanner=new CubeScanner();
    for(const timestamp of [0,900,1800])scanner.observe(slow(observation(physical,['F'],timestamp)));
    let result;for(const timestamp of [2700,3600,4500])result=scanner.observe(slow(observation(changed,['F'],timestamp)));
    expect(result).toMatchObject({invalidated:true,captured:[]});
  });
  it('confirms solved through fresh slow views, but expires earlier views across a true gap',async()=>{
    for(const expire of [false,true]){
      const session=new Session(adapter()),cube=state(SOLVED);session.startFromPhoto(cube);await Promise.resolve();
      expect(session.getSnapshot().stage).toBe('verifying');let t=0;
      for(const faces of [['F','R','U'],['L','D','F']] as Face[][])for(let i=0;i<3;i++)session.observe(slow(observation(cube,faces,t+=900)));
      expect(session.getSnapshot().message).toContain('5/6');
      if(expire)t+=400;
      for(let i=0;i<3;i++)session.observe(slow(observation(cube,['B','R','D'],t+=900)));
      expect(session.getSnapshot().stage).toBe(expire?'verifying':'solved');
      if(expire)expect(session.getSnapshot().message).toContain('3/6');
      session.dispose();
    }
  });
});

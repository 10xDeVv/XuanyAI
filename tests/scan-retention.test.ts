import {describe,it,expect} from 'vitest';
import {applyMoves,moveFacelets,SOLVED} from '../src/core/cube';
import {CubeScanner} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {ReadableMessage} from '../src/core/readableMessage';
import {Face,FACES} from '../src/core/types';
import {observation,projected,state} from './fixtures';

const cube=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
function fiveFaces(){
  const scanner=new CubeScanner();let t=0;
  for(const face of FACES.slice(0,5))for(let i=0;i<3;i++)scanner.observe(observation(cube,[face],t+=150));
  return {scanner,t};
}
describe('retained physical capture',()=>{
  it('keeps five faces through blur, missing views, a three-frame color error, and the sixth face',()=>{
    const run=fiveFaces(),s=run.scanner;let t=run.t;
    for(const quality of ['blur','glare','missing'] as const){
      const result=s.observe({...observation(cube,[],t+=150),quality});
      expect(result.captured).toHaveLength(5);
    }
    for(let i=0;i<3;i++){
      const o=observation(cube,['F'],t+=150);o.faces[0]!.colors[0]='white';
      if(o.faces[0]!.colors[0]===observation(cube,['F'],0).faces[0]!.colors[0])o.faces[0]!.colors[0]='blue';
      const result=s.observe(o);expect(result.captured).toHaveLength(5);expect(result.state).toBeUndefined();
    }
    for(let i=0;i<3;i++)s.observe(observation(cube,['B'],t+=150));
    let result;for(let i=0;i<3;i++)result=s.observe(observation(cube,['F'],t+=150));
    expect(result!.captured).toHaveLength(6);expect(result!.rechecking).toEqual([]);
    for(const faces of [['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']] as Face[][])
      for(let i=0;i<3;i++)result=s.observe(projected(cube,faces,t+=150));
    expect(result!.state).toBeDefined();expect(matchObservation(result!.state!,projected(cube,['F','U','R'],t))).not.toBeNull();
  });
  it('requires fresh checks after a real twist, retaining five saved faces until they are checked',()=>{
    const run=fiveFaces(),s=run.scanner;let t=run.t;
    const changed=state(moveFacelets(cube.facelets,'U'));let result;
    for(let i=0;i<7;i++)result=s.observe(observation(changed,['F'],t+=150));
    expect(result!.captured).toHaveLength(5);expect(result!.state).toBeUndefined();
    expect(result!.rechecking).toHaveLength(4);
    for(const face of FACES)for(let i=0;i<7;i++){
      result=s.observe(observation(changed,[face],t+=150));
      expect(result.captured.length).toBeGreaterThanOrEqual(5);
    }
    for(const faces of [['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']] as Face[][])
      for(let i=0;i<7;i++)result=s.observe(projected(changed,faces,t+=150));
    expect(result!.rechecking).toEqual([]);
    expect(result!.state).toBeDefined();
    for(const faces of [['F','R','U'],['B','D','L']] as Face[][])expect(matchObservation(result!.state!,projected(changed,faces,t))).not.toBeNull();
  });
  it('does not treat two regions with the same center label as changed-face evidence',()=>{
    const run=fiveFaces();let t=run.t,result;
    for(let i=0;i<10;i++){
      const o=observation(cube,['F','R'],t+=150);o.faces[1]!.colors[4]=cube.centers.F;
      result=run.scanner.observe(o);
    }
    expect(result!.captured).toHaveLength(5);expect(result!.rechecking).toEqual([]);
  });
  it('does not reuse checks made before a second twist during revalidation',()=>{
    const run=fiveFaces();let t=run.t,result;
    const first=state(moveFacelets(cube.facelets,'U'));
    for(let i=0;i<7;i++)run.scanner.observe(observation(first,['F'],t+=150));
    const second=state(moveFacelets(first.facelets,'R'));
    for(let i=0;i<7;i++)result=run.scanner.observe(observation(second,['U'],t+=150));
    expect(result!.captured).toHaveLength(5);
    expect(result!.rechecking).toContain(cube.centers.F);
    expect(result!.state).toBeUndefined();
  });
});

describe('readable camera instructions',()=>{
  it('ignores alternating frame hints and holds each displayed instruction for two seconds',()=>{
    const gate=new ReadableMessage();gate.reset('Rotate slowly',0);
    for(let t=100;t<=2500;t+=100)expect(gate.update(t%200?'Hold still':'Adjust the light',t).text).toBe('Rotate slowly');
    expect(gate.update('Show blue',2600).text).toBe('Rotate slowly');
    expect(gate.update('Show blue',3250).text).toBe('Show blue');
    expect(gate.update('Show green',3300).text).toBe('Show blue');
    expect(gate.update('Show green',5000).text).toBe('Show blue');
    expect(gate.update('Show green',5250).text).toBe('Show green');
  });
  it('immediately replaces stale instructions when the mode, move, or error changes',()=>{
    const gate=new ReadableMessage();gate.reset('Rotate slowly',0);gate.update('Show blue',100);
    expect(gate.reset('Camera disconnected',200)).toBe('Camera disconnected');
    expect(gate.update('Camera disconnected',900).text).toBe('Camera disconnected');
  });
});

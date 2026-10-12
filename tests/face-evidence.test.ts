import {describe,it,expect} from 'vitest';
import {applyMoves,rotateGrid,SOLVED} from '../src/core/cube';
import {FaceEvidence} from '../src/core/faceEvidence';
import {CubeScanner,reliableFace} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {Face,Quad} from '../src/core/types';
import {observation,projected,state} from './fixtures';

const cube=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
describe('measured square evidence during capture',()=>{
  it('captures all six faces with a different uncertain square on every frame',()=>{
    const scanner=new CubeScanner();let t=0,result;
    for(const faces of [['F','R','U'],['R','B','D'],['F','L','U'],['L','B','D']] as Face[][]){
      for(let i=0;i<9;i++){
        const o=projected(cube,faces,t+=150);
        for(const face of o.faces)face.confidence[[0,1,2,3,5,6,7,8][i%8]!]=.56;
        expect(o.faces.some(reliableFace)).toBe(false);
        result=scanner.observe(o);
      }
    }
    expect(result!.captured).toHaveLength(6);expect(result!.state).toBeDefined();
    for(const faces of [['F','R','U'],['B','L','D']] as Face[][])expect(matchObservation(result!.state!,projected(cube,faces,t))).not.toBeNull();
  });
  it('does not promote a square that never had three clear measurements',()=>{
    const scanner=new CubeScanner();
    for(let i=0;i<30;i++){
      const o=observation(cube,['F'],i*150);o.faces[0]!.confidence[0]=.64;
      expect(scanner.observe(o).captured).toHaveLength(0);
    }
  });
  it.each(['contradiction','moved','gap','blur','glare','occluded','center'] as const)('does not reuse old square evidence after %s',interruption=>{
    const evidence=new FaceEvidence();
    for(let i=0;i<3;i++)evidence.observe(observation(cube,['F'],i*150));
    const o=observation(cube,['F'],450),f=o.faces[0]!;f.confidence[0]=.56;
    if(interruption==='contradiction')f.colors[1]=f.colors[1]==='white'?'blue':'white';
    if(interruption==='moved')f.quad=f.quad.map(p=>({x:p.x+50,y:p.y})) as Quad;
    if(interruption==='gap')o.timestamp=1400;
    if(['blur','glare','occluded'].includes(interruption))o.quality=interruption as 'blur'|'glare'|'occluded';
    if(interruption==='center')f.confidence[4]=.5;
    expect(evidence.observe(o).some(reliableFace)).toBe(false);
  });
  it('aligns corner-order changes by location without changing the measured grid',()=>{
    const evidence=new FaceEvidence();
    for(let i=0;i<3;i++)evidence.observe(observation(cube,['F'],i*150));
    for(let r=1;r<=3;r++){
      const o=observation(cube,['F'],300+r*150),f=o.faces[0]!;
      f.colors=rotateGrid(f.colors,-r);f.confidence[0]=.56;f.quad=f.quad.map((_,i)=>f.quad[(i+r)%4]!) as Quad;
      const measured=evidence.observe(o);
      expect(measured[0]!.colors).toEqual(f.colors);expect(reliableFace(measured[0]!)).toBe(true);
    }
  });
  it('cannot restore a low-confidence square with a different current color',()=>{
    const evidence=new FaceEvidence();
    for(let i=0;i<3;i++)evidence.observe(observation(cube,['F'],i*150));
    const o=observation(cube,['F'],450),f=o.faces[0]!;f.confidence[0]=.56;f.colors[0]=f.colors[0]==='blue'?'white':'blue';
    expect(reliableFace(evidence.observe(o)[0]!)).toBe(false);
  });
});

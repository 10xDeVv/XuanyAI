import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {assemblePhoto,FACE_NAMES,PANEL_LABELS,PhotoPanel,reviewPanel,uprightFace} from '../src/photo/model';
import {applyMoves,DEFAULT_CENTERS,rotateGrid,SOLVED} from '../src/core/cube';
import {CubeColor,CubeState,Face,FaceGrid,ObservedFace,Quad,SolverAdapter} from '../src/core/types';
import {observation,state} from './fixtures';
import {renderObservation} from './pixels';
import {solveFacelets} from '../src/solver/solve';
import {Session} from '../src/session/Session';

const require=createRequire(import.meta.url);
const cube=state(applyMoves(SOLVED,['R','U',"F'",'L2','D','B2']));
const panels=(source:CubeState=cube):PhotoPanel[]=>PANEL_LABELS.map(f=>({face:observation(source,[f],0).faces[0]!}));
const turns=[0,0,0,0,0,0];
describe('photo assembly',()=>{
  it('assembles labeled photos in arbitrary order and rotation and solves the exact state',()=>{
    const labels:Face[]=['B','D','R','F','U','L'];
    const rotated=labels.map((f,i)=>({face:{...observation(cube,[f],0).faces[0]!,colors:rotateGrid(observation(cube,[f],0).faces[0]!.colors,i)}}));
    const result=assemblePhoto(rotated,labels,labels.map((_,i)=>-i));
    expect(result.valid).toBe(true);if(!result.valid)return;
    expect(result.state.facelets).toBe(cube.facelets);
    expect(applyMoves(result.state.facelets,solveFacelets(result.state.facelets))).toBe(SOLVED);
  });
  it('normalizes all four detector corner origins to image top-left without mirroring',()=>{
    const face=panels()[0]!.face!;
    for(let n=0;n<4;n++){
      const detected={...face,colors:rotateGrid(face.colors,-n),confidence:rotateGrid(face.confidence,-n),quad:face.quad.map((_,i)=>face.quad[(i+n)%4]!) as Quad};
      expect(uprightFace(detected)).toEqual(face);
    }
  });
  it('reports the duplicate white centers in the supplied diagram and never constructs a state',()=>{
    const grids=['gyr owb ybo','brw goy rwg','ygb wro gbr','rby ogw bwo','wog byr rgb','obr ywg goy'];
    const colors:Record<string,CubeColor>={w:'white',r:'red',g:'green',y:'yellow',o:'orange',b:'blue'};
    const supplied=panels().map((p,i)=>({face:{...p.face!,colors:grids[i]!.replaceAll(' ','').split('').map(c=>colors[c]!) as FaceGrid<CubeColor>}}));
    const result=assemblePhoto(supplied,PANEL_LABELS,turns);
    expect(result).toMatchObject({valid:false,reason:expect.stringContaining('Up and Back both have white centers')});
    expect(result).not.toHaveProperty('state');
  });
  it('rejects missing, low confidence, duplicated labels, incorrect counts, and impossible pieces',()=>{
    expect(assemblePhoto(panels().slice(1),PANEL_LABELS,turns).valid).toBe(false);
    expect(assemblePhoto(panels(),['U','U','R','L','D','B'],turns).valid).toBe(false);
    const low=panels();low[0]=reviewPanel([{...low[0]!.face!,confidence:[.4,.9,.9,.9,.9,.9,.9,.9,.9]}]);
    expect(assemblePhoto(low,PANEL_LABELS,turns).valid).toBe(false);
    const wrong=panels();wrong[0]!.face={...wrong[0]!.face!,colors:[...wrong[0]!.face!.colors]};wrong[0]!.face!.colors[0]=wrong[0]!.face!.colors[0]==='white'?'red':'white';
    expect(assemblePhoto(wrong,PANEL_LABELS,turns).valid).toBe(false);
    const flipped=[...SOLVED];[flipped[5],flipped[10]]=[flipped[10]!,flipped[5]!];
    expect(assemblePhoto(panels(state(flipped.join(''))),PANEL_LABELS,turns).valid).toBe(false);
  });
  it('requires fresh camera evidence after a solved photo and rejects an illegal import',async()=>{
    const adapter:SolverAdapter={ready:async()=>{},solve:async s=>({revision:s.revision,moves:[]}),dispose(){}};
    const session=new Session(adapter);session.startFromPhoto({facelets:SOLVED,centers:DEFAULT_CENTERS,revision:1});
    await Promise.resolve();expect(session.getSnapshot().stage).toBe('verifying');
    expect(()=>session.startFromPhoto({...cube,facelets:'invalid'})).toThrow();session.dispose();
  });
});

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('photo worker with compiled detector',()=>{
  it.each([3,2])('reads six panels in a %i-column picture through the production worker',async(columns)=>{
    const width=columns*480,height=6/columns*480,pixels=new Uint8Array(width*height*4);
    for(let i=0;i<6;i++){
      const o=observation(cube,[PANEL_LABELS[i]!],0);
      o.faces[0]!.quad=[{x:55,y:75},{x:420,y:75},{x:420,y:440},{x:55,y:440}];
      const tile=renderObservation(o,{rounded:.3});
      for(let y=0;y<480;y++)pixels.set(tile.subarray(y*640*4,(y*640+480)*4),((Math.floor(i/columns)*480+y)*width+(i%columns)*480)*4);
    }
    const engine=await require('../public/vision/cube-vision.js')();
    const messages:any[]=[];
    const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
    runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
    await self.onmessage({data:{type:'init'}});
    expect(messages.pop()).toEqual({type:'ready'});
    await self.onmessage({data:{type:'photo',columns,width,height,buffer:pixels.buffer}});
    const result=messages.pop();expect(result.type).toBe('photo');expect(result.panels).toHaveLength(6);
    const read:PhotoPanel[]=result.panels.map((f:ObservedFace[])=>reviewPanel(f));
    read.forEach((p,i)=>expect(p.face?.colors,FACE_NAMES[PANEL_LABELS[i]!]).toEqual(panels()[i]!.face!.colors));
    expect(assemblePhoto(read,PANEL_LABELS,turns)).toMatchObject({valid:true,state:{facelets:cube.facelets}});
  });
});

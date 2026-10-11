import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
import {arrangeDiagram,DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto} from '../src/photo/model';
import {Session} from '../src/session/Session';
import {CubeObservation,SolverAdapter} from '../src/core/types';
import {fourByFourNetPixels,netCube,netFrame,netSlots} from './net-fixtures';
import {renderObservation} from './pixels';
import {applyMoves,SOLVED} from '../src/core/cube';
import {solveFacelets} from '../src/solver/solve';
const require=createRequire(import.meta.url),turns=[0,0,0,0,0,0];
const adapter=():SolverAdapter=>({ready:async()=>{},solve:vi.fn(async s=>({revision:s.revision,moves:[]})),dispose(){}});

describe('unfolded 3x3 net capture',()=>{
  it.each([false,true])('maps net geometry to correct labels and solves its exact state (tilt=%s)',tilted=>{
    const o=netFrame(tilted);o.faces.reverse();const arranged=arrangeDiagram(o.faces)!;
    expect(arranged.layout).toBe('net');expect(arranged.labels).toEqual(['U','L','F','R','B','D']);
    const scan=new DiagramScanner();let result;
    for(const timestamp of [0,150,300,450])result=scan.observe({...o,timestamp});
    const read=result!.read!,validation=assemblePhoto(read.panels,read.labels!,turns);
    expect(validation).toMatchObject({valid:true,state:{facelets:netCube.facelets}});
    if(validation.valid)expect(applyMoves(validation.state.facelets,solveFacelets(validation.state.facelets))).toBe(SOLVED);
  });
  it.each(netSlots)('requests missing $face without inventing any facelets',({face})=>{
    const o=netFrame();o.faces=o.faces.filter((_,i)=>netSlots[i]!.face!==face);
    const scan=new DiagramScanner();let result;
    for(const timestamp of [0,150,300,450,600])result=scan.observe({...o,timestamp});
    expect(result!.read).toBeUndefined();expect(result!.layout).toBe('net');expect(result!.message).toContain('all nine squares');
    if(face==='B')expect(result!.message).toContain('Back');
  });
  it('keeps a cropped Back face in scanning, then captures only after complete fresh observations',()=>{
    const solver=adapter(),session=new Session(solver),full=netFrame(),cropped={...full,faces:full.faces.filter((_,i)=>netSlots[i]!.face!=='B')};
    session.start('diagram');for(const timestamp of [0,150,300,450])session.observe({...cropped,timestamp});
    expect(session.getSnapshot()).toMatchObject({stage:'scanning',diagramCount:5,message:expect.stringContaining('Back'),captured:[]});
    expect(solver.solve).not.toHaveBeenCalled();
    for(const timestamp of [600,750,900]){session.observe({...full,timestamp});expect(session.getSnapshot().stage).toBe('scanning');}
    session.observe({...full,timestamp:1050});expect(session.getSnapshot().picture?.labels).toEqual(['U','L','F','R','B','D']);session.dispose();
  });
  it('does not promote an eight-region extrapolated Back grid to a complete net',()=>{
    const o=netFrame();o.faces[4]!.cells=8;
    const scan=new DiagramScanner();let result;
    for(const timestamp of [0,150,300,450])result=scan.observe({...o,timestamp});
    expect(result).toMatchObject({count:5,message:expect.stringContaining('Back')});expect(result!.read).toBeUndefined();
  });
  it('names both unclear faces when the outline of the full net is available',()=>{
    const o=netFrame();o.faces[4]!.cells=8;o.faces[5]!.cells=8;
    const result=new DiagramScanner().observe(o);
    expect(result).toMatchObject({count:4,message:expect.stringContaining('Back and Down')});expect(result.read).toBeUndefined();
  });
  it('blocks a flagged larger grid and resets a pending 3x3 capture',()=>{
    const o=netFrame(),scan=new DiagramScanner();for(const timestamp of [0,150,300])scan.observe({...o,timestamp});
    const result=scan.observe({...o,timestamp:450,largerGrid:true});expect(result.read).toBeUndefined();expect(result.message).toContain('3 × 3');
    expect(scan.observe({...o,timestamp:600}).read).toBeUndefined();
    for(const mode of ['auto','diagram'] as const){
      const solver=adapter(),session=new Session(solver);session.start(mode);
      for(const timestamp of [0,150,300,450])session.observe({...o,timestamp,largerGrid:true});
      expect(session.getSnapshot()).toMatchObject({stage:'scanning',captured:[],message:expect.stringContaining('3 × 3')});
      // A larger grid must be rejected without changing a physical scan's mode.
      expect(session.getSnapshot().diagramCount).toBe(mode==='diagram'?0:undefined);
      expect(solver.solve).not.toHaveBeenCalled();session.dispose();
    }
  });
});

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('unfolded net through production frame worker',()=>{
  it('captures light-background and perspective nets; rejects a cropped edge and a 4x4 net',async()=>{
    const engine=await require('../public/vision/cube-vision.js')(),messages:any[]=[];
    const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
    runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
    await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
    const detect=async(o:CubeObservation,buffer:ArrayBufferLike):Promise<CubeObservation>=>{
      await self.onmessage({data:{type:'frame',id:1,width:640,height:480,timestamp:o.timestamp,buffer}});const data=messages.pop();expect(data.type).toBe('observation');return {...o,...data};
    };
    for(const tilted of [false,true]){
      const o=netFrame(tilted),pixels=renderObservation(o,{rounded:.18,background:[240,245,249],border:[195,202,212]});
      const detected=await detect(o,pixels.buffer);expect(detected.largerGrid).toBe(false);expect(detected.faces).toHaveLength(6);
      const scan=new DiagramScanner();let result;
      for(const timestamp of [0,150,300,450])result=scan.observe({...detected,timestamp});
      expect(result!.read).toBeDefined();
      expect(assemblePhoto(result!.read!.panels,result!.read!.labels!,turns)).toMatchObject({valid:true,state:{facelets:netCube.facelets}});
    }
    // Crop the rightmost sticker column out of the Back face, as in the example.
    const o=netFrame();
    for(const cutoff of [570,590]){
      const pixels=renderObservation(o,{rounded:.18,background:[240,245,249],border:[195,202,212]});
      for(let y=0;y<480;y++)for(let x=cutoff;x<640;x++)pixels.set([204,204,204,255],(y*640+x)*4);
      const cropped=await detect(o,pixels.buffer),scan=new DiagramScanner();let result;
      for(const timestamp of [0,150,300,450])result=scan.observe({...cropped,timestamp});
      expect(result).toMatchObject({count:5,message:expect.stringContaining('Back')});expect(result!.read).toBeUndefined();
    }
    const four=await detect(o,fourByFourNetPixels().buffer);expect(four.largerGrid).toBe(true);expect(four.faces).toHaveLength(0);
  },30000);
});

import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
import {cameraDetailRegion,cameraFrameSize} from '../src/camera/frameSize';
import {CubeScanner,reliableFace} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {CubeObservation,FACES} from '../src/core/types';
import {laptopCube,laptopFrame,sampleWebcam} from './laptop-fixtures';

const require=createRequire(import.meta.url);
async function worker(engine:any){
  const messages:any[]=[];
  const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
  runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
  await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
  return async(data:unknown)=>{await self.onmessage({data});return messages.pop();};
}

it('samples landscape detail from native video pixels and leaves portrait/pictures alone',()=>{
  expect(cameraFrameSize(1280,720)).toEqual({width:960,height:540});
  expect(cameraDetailRegion(1280,720)).toEqual({x:280,y:0,size:720,width:720,height:720});
  expect(cameraDetailRegion(1920,1080)).toEqual({x:420,y:0,size:1080,width:960,height:960});
  expect(cameraDetailRegion(640,480)).toMatchObject({width:480,height:480});
  expect(cameraDetailRegion(720,1280)).toBeUndefined();
  expect(cameraDetailRegion(1280,720,true)).toBeUndefined();
});

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('landscape webcam detection',()=>{
  it.each([40,48])('recovers a %i-pixel face from measured detail that the reduced frame rejects',async size=>{
    const run=await worker(await require('../public/vision/cube-vision.js')()),source=laptopFrame('F',size);
    const buffer=sampleWebcam(source.pixels,0,0,1280,720,960,540).buffer;
    const detail={buffer:sampleWebcam(source.pixels,280,0,720,720,720,720).buffer,width:720,height:720,x:210,y:0,scaleX:.75,scaleY:.75};
    const frame={type:'frame',id:11,timestamp:321,width:960,height:540,buffer};
    const baseline=await run(frame);expect(baseline.type).toBe('observation');expect(baseline.faces.filter(reliableFace)).toHaveLength(0);
    const recovered=await run({...frame,detail});expect(recovered).toMatchObject({type:'observation',id:11,timestamp:321,width:960,height:540});
    expect(recovered.faces.filter(reliableFace)).toHaveLength(1);
    const o={...source.observation,...recovered,transform:{...source.observation.transform,frameWidth:960,frameHeight:540}} as CubeObservation;
    expect(matchObservation(laptopCube,o)).not.toBeNull();
    const q=o.faces[0]!.quad,cx=q.reduce((sum,p)=>sum+p.x,0)/4,cy=q.reduce((sum,p)=>sum+p.y,0)/4;
    expect(Math.abs(cx-480)).toBeLessThan(3);expect(Math.abs(cy-270)).toBeLessThan(3);
    const scanner=new CubeScanner();let result;
    for(const timestamp of [400,550,700])result=scanner.observe({...o,timestamp});
    expect(result!.captured).toEqual([laptopCube.centers.F]);
  });
  it('still rejects a covered face through the detail retry',async()=>{
    const run=await worker(await require('../public/vision/cube-vision.js')()),source=laptopFrame('F',48,true);
    const result=await run({type:'frame',id:1,timestamp:0,width:960,height:540,buffer:sampleWebcam(source.pixels,0,0,1280,720,960,540).buffer,
      detail:{buffer:sampleWebcam(source.pixels,280,0,720,720,720,720).buffer,width:720,height:720,x:210,y:0,scaleX:.75,scaleY:.75}});
    expect(result.type).toBe('observation');expect(result.faces.filter(reliableFace)).toHaveLength(0);
  });
  it('finishes a known webcam scan that the full-frame-only path leaves incomplete',async()=>{
    const run=await worker(await require('../public/vision/cube-vision.js')()),oldScan=new CubeScanner(),newScan=new CubeScanner();
    let timestamp=0,before,after;const measured:CubeObservation[]=[];
    for(const face of FACES){
      const source=laptopFrame(face,80),frame={type:'frame',id:1,timestamp:0,width:960,height:540,buffer:sampleWebcam(source.pixels,0,0,1280,720,960,540).buffer};
      const full=await run(frame),detail={buffer:sampleWebcam(source.pixels,280,0,720,720,720,720).buffer,width:720,height:720,x:210,y:0,scaleX:.75,scaleY:.75};
      const recovered=await run({...frame,detail});expect(recovered.type).toBe('observation');
      const o={...source.observation,...recovered,transform:{...source.observation.transform,frameWidth:960,frameHeight:540}} as CubeObservation;
      expect(matchObservation(laptopCube,o)).not.toBeNull();measured.push(o);
      for(let i=0;i<3;i++){
        timestamp+=150;before=oldScan.observe({...o,...full,timestamp});after=newScan.observe({...o,timestamp});
      }
    }
    expect(before!.captured.length).toBeLessThan(6);expect(after!.captured).toHaveLength(6);expect(after!.state).toBeDefined();
    for(const o of measured)expect(matchObservation(after!.state!,o)).not.toBeNull();
  });
});

it('never replaces a clear full-frame view, a picture, or an unsupported grid with a crop',async()=>{
  const clear=laptopFrame().observation.faces[0]!;
  for(const [result,picture] of [
    [{faces:[clear]},false], [{faces:[]},true], [{faces:[],largerGrid:true},false], [{faces:Array(4).fill({...clear,sharpness:0})},false],
  ] as const){
    let calls=0;
    const engine={HEAPU8:new Uint8Array(64*64*4),_malloc:()=>0x10,_free:()=>{},detectRGBA:()=>{calls++;return JSON.stringify(result);},detectPictureRGBA:()=>{calls++;return JSON.stringify(result);}};
    const run=await worker(engine),buffer=new ArrayBuffer(32*32*4);
    await run({type:'frame',id:1,timestamp:0,width:32,height:32,buffer,picture,detail:{buffer,width:32,height:32,x:0,y:0,scaleX:1,scaleY:1}});
    expect(calls).toBe(1);
  }
});

it('rejects malformed detail geometry instead of placing arrows at invented positions',async()=>{
  const engine={HEAPU8:new Uint8Array(64*64*4),_malloc:()=>0x10,_free:()=>{},detectRGBA:()=>JSON.stringify({faces:[]})};
  const run=await worker(engine),buffer=new ArrayBuffer(32*32*4);
  for(const scaleX of [NaN,0,-1,2]){
    const result=await run({type:'frame',id:1,timestamp:0,width:32,height:32,buffer,detail:{buffer,width:32,height:32,x:0,y:0,scaleX,scaleY:1}});
    expect(result.type).toBe('error');
  }
});

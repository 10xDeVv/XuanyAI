import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
import {CameraProcessingBudget,cameraDetailRegion,cameraFrameSize} from '../src/camera/frameSize';
import {CubeScanner,reliableFace} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {CubeObservation,FACES} from '../src/core/types';
import {laptopCube,laptopFrame,sampleWebcam} from './laptop-fixtures';

const require=createRequire(import.meta.url);
async function worker(engine:any,clock=performance){
  const messages:any[]=[];
  const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
  runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance:clock,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
  await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
  return async(data:unknown)=>{await self.onmessage({data});return messages.pop();};
}

it('samples bounded native detail in either orientation and leaves pictures full-frame',()=>{
  expect(cameraFrameSize(1280,720)).toEqual({width:960,height:540});
  expect(cameraDetailRegion(1280,720)).toEqual({x:320,y:40,size:640,width:640,height:640});
  expect(cameraDetailRegion(1920,1080)).toEqual({x:640,y:220,size:640,width:640,height:640});
  expect(cameraDetailRegion(640,480)).toMatchObject({width:480,height:480});
  expect(cameraDetailRegion(720,1280)).toEqual({x:40,y:320,size:640,width:640,height:640});
  expect(cameraDetailRegion(720,1280,false,480)).toEqual({x:120,y:400,size:480,width:480,height:480});
  expect(cameraDetailRegion(1280,720,true)).toBeUndefined();
});

function laptopDetail(pixels:Uint8Array){
  const r=cameraDetailRegion(1280,720)!,{width,height}=cameraFrameSize(1280,720);
  return {buffer:sampleWebcam(pixels,r.x,r.y,r.size,r.size,r.width,r.height).buffer,width:r.width,height:r.height,
    x:r.x*width/1280,y:r.y*height/720,scaleX:width/1280,scaleY:height/720};
}

it('reduces a slow physical workload without oscillating or reducing picture detail',()=>{
  const budget=new CameraProcessingBudget();
  budget.observe(2000,true);budget.observe(NaN);budget.observe(700);expect(budget.limit).toBe(960);
  budget.observe(1100);expect(cameraFrameSize(1280,800,false,budget.limit)).toEqual({width:640,height:400});
  expect(cameraDetailRegion(1280,800,false,budget.limit)).toMatchObject({width:640,height:640});
  budget.observe(900);expect(budget.limit).toBe(480);
  for(const duration of [1300,100,100,800])budget.observe(duration);
  expect(budget.limit).toBe(480);expect(cameraFrameSize(1280,800,true,budget.limit)).toEqual({width:1280,height:800});
});

it('does not spend another detection pass after the first has used its retry allowance',async()=>{
  let time=0,calls=0;
  const engine={HEAPU8:new Uint8Array(64*64*4),_malloc:()=>16,_free:()=>{},detectRGBA:()=>{calls++;time+=500;return JSON.stringify({faces:[]});}};
  const run=await worker(engine,{now:()=>time} as Performance),buffer=new ArrayBuffer(32*32*4);
  const result=await run({type:'frame',id:1,timestamp:0,width:32,height:32,buffer,detail:{buffer,width:32,height:32,x:0,y:0,scaleX:1,scaleY:1}});
  expect(calls).toBe(1);expect(result).toMatchObject({type:'observation',processingMs:500,timestamp:0});
});

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('landscape webcam detection',()=>{
  it.each([40,48])('recovers a %i-pixel face from measured detail that the reduced frame rejects',async size=>{
    const run=await worker(await require('../public/vision/cube-vision.js')()),source=laptopFrame('F',size);
    const buffer=sampleWebcam(source.pixels,0,0,1280,720,960,540).buffer;
    const detail=laptopDetail(source.pixels);
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
      detail:laptopDetail(source.pixels)});
    expect(result.type).toBe('observation');expect(result.faces.filter(reliableFace)).toHaveLength(0);
  });
  it('finishes a known webcam scan that the full-frame-only path leaves incomplete',async()=>{
    const run=await worker(await require('../public/vision/cube-vision.js')()),oldScan=new CubeScanner(),newScan=new CubeScanner();
    let timestamp=0,before,after;const measured:CubeObservation[]=[];
    for(const face of FACES){
      const source=laptopFrame(face,80),frame={type:'frame',id:1,timestamp:0,width:960,height:540,buffer:sampleWebcam(source.pixels,0,0,1280,720,960,540).buffer};
      const full=await run(frame),detail=laptopDetail(source.pixels);
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

it('does not retry a complete three-sided view, a picture, or an unsupported grid',async()=>{
  const clear=laptopFrame().observation.faces[0]!;
  for(const [result,picture] of [
    [{faces:[clear,clear,clear]},false], [{faces:[]},true], [{faces:[],largerGrid:true},false], [{faces:Array(4).fill({...clear,sharpness:0})},false],
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

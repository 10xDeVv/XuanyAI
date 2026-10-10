import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
import {CubeObservation} from '../src/core/types';
import {DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto,clearDiagramFace} from '../src/photo/model';
import {reliableFace} from '../src/core/scanner';
import {fourByFourNetPixels,joinedExample,joinedNetFrame,netCube,netFrame} from './net-fixtures';
import {transform} from './fixtures';
import {renderObservation} from './pixels';

function blurPixels(input:Uint8Array,w:number,h:number):Uint8Array {
  let pixels=input;
  for(let pass=0;pass<2;pass++){
    const out=new Uint8Array(pixels.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){
      let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=pixels[(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*4+c]!;
      out[(y*w+x)*4+c]=Math.round(sum/9);
    }
    pixels=out;
  }
  return pixels;
}

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('picture recovery safety (generated pixels)',()=>{
  it('reads small softened nets and rejects a covered square and a 4×4 net',async()=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')();
    const detect=(pixels:Uint8Array,w:number,h:number)=>{
      const ptr=engine._malloc(pixels.length);
      try{engine.HEAPU8.set(pixels,ptr);return JSON.parse(engine.detectPictureRGBA(ptr,w,h,w*4));}finally{engine._free(ptr);}
    };
    const capture=(d:any,w:number,h:number)=>{
      const scan=new DiagramScanner();let result;
      for(const timestamp of [0,150,300,450])result=scan.observe({...d,timestamp,transform:{...transform,frameWidth:w,frameHeight:h}});
      return result!.read;
    };
    for(const joined of [true,false]){
      const o=joined?joinedNetFrame(true):netFrame(true),w=384,h=288;
      o.transform={...o.transform,frameWidth:w,frameHeight:h};
      o.faces=o.faces.map(f=>({...f,quad:f.quad.map(p=>({x:p.x*.6,y:p.y*.6})) as typeof f.quad}));
      const source=renderObservation(o,{rounded:.12,inset:.04});
      // A screen's warm orange falls near the fixed red/orange boundary.
      for(let i=0;i<source.length;i+=4)if(source[i]===241&&source[i+1]===116&&source[i+2]===24)source.set([255,60,0],i);
      const pixels=blurPixels(source,w,h),detected=detect(pixels,w,h);
      expect(detected.enhanced).toBe(true);
      const read=capture(detected,w,h);
      expect(read,`softened ${joined?'joined':'separate'} net`).toBeDefined();
      expect(assemblePhoto(read!.panels,read!.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:(joined?joinedExample:netCube).facelets}});
      // An actually cropped image has no pixels for the rightmost column.
      const croppedWidth=w-40,cropped=new Uint8Array(croppedWidth*h*4);
      for(let row=0;row<h;row++)cropped.set(pixels.subarray(row*w*4,(row*w+croppedWidth)*4),row*croppedWidth*4);
      expect(capture(detect(cropped,croppedWidth,h),croppedWidth,h)).toBeUndefined();
      // Cover an entire corner sticker; layout alone cannot supply its color.
      const q=o.faces[0]!.quad,x=Math.floor(q[0].x),y=Math.floor(q[0].y),size=Math.ceil((q[1].x-q[0].x)/3)+4;
      for(let row=y;row<y+size;row++)for(let col=x;col<x+size;col++)pixels.set([48,54,51,255],(row*w+col)*4);
      expect(capture(detect(pixels,w,h),w,h)).toBeUndefined();
    }
    expect(capture(detect(fourByFourNetPixels(),640,480),640,480)).toBeUndefined();
  },30000);
});

it('requires a valid cube before confirming colors recovered from picture boundaries',()=>{
  const source=joinedNetFrame(),scan=new DiagramScanner();
  const o={...source,enhanced:true,faces:source.faces.map(f=>({...f,calibrated:true,sharpness:12}))};
  expect(clearDiagramFace(o.faces[0]!)).toBe(true);
  expect(reliableFace(o.faces[0]!)).toBe(false); // Physical turn thresholds stay strict.
  for(const timestamp of [0,150,300])expect(scan.observe({...o,timestamp}).read).toBeUndefined();
  const read=scan.observe({...o,timestamp:450}).read!;
  expect(assemblePhoto(read.panels,read.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:joinedExample.facelets}});
  const changed=structuredClone(o);changed.faces[0]!.colors[0]='red';scan.reset();
  for(const timestamp of [0,150,300,450,600]){
    const result=scan.observe({...changed,timestamp});expect(result.read).toBeUndefined();expect(result.message).toContain('colors do not yet agree');
  }
});

it('confirms slower picture recovery frames while expiring gaps and changed pictures',()=>{
  const o={...joinedNetFrame(),enhanced:true,processingMs:1500},scan=new DiagramScanner();
  for(const [i,timestamp] of [0,1600,3200,4800].entries()){
    const result=scan.observe({...o,timestamp});expect(result.confirmations).toBe(i+1);
    expect(!!result.read).toBe(i===3);
  }
  const expired=scan.observe({...o,timestamp:7300});expect(expired.confirmations).toBe(1);expect(expired.read).toBeUndefined();
  const changed=structuredClone(o);changed.faces[0]!.colors[0]='red';
  expect(scan.observe({...changed,timestamp:8900}).read).toBeUndefined();
  const restarted=scan.observe({...o,timestamp:10500});expect(restarted.confirmations).toBe(1);expect(restarted.read).toBeUndefined();
  // Partial frames can preserve progress but cannot keep a complete view alive.
  for(const timestamp of [11500,12500])expect(scan.observe({...o,faces:o.faces.slice(0,5),timestamp}).confirmations).toBe(1);
  expect(scan.observe({...o,faces:o.faces.slice(0,5),timestamp:13500}).confirmations).toBeUndefined();
});

// Private camera recordings stay local. Pass a manifest of RGBA files, frame
// dimensions and independently labeled expected states to replay them in CI or
// locally without checking users' screenshots into a public repository.
const manifest=process.env.CUBE_CAMERA_CASES;
type CameraCase={name:string;path:string;width:number;height:number;expected:string|null};
const cases:CameraCase[]=manifest?JSON.parse(readFileSync(manifest,'utf8')):[];
describe.skipIf(!manifest||!existsSync('public/vision/cube-vision.wasm'))('independently labeled camera pictures',()=>{
  it.each(cases)('reads or rejects $name through the production picture frame worker',async f=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')(),messages:any[]=[];
    const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
    runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
    await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
    const pixels=new Uint8Array(readFileSync(f.path)),scanner=new DiagramScanner();let result;
    for(let i=0;i<4;i++){
      await self.onmessage({data:{type:'frame',id:i,width:f.width,height:f.height,picture:true,timestamp:i*150,buffer:pixels.buffer}});
      const d=messages.pop();expect(d.type).toBe('observation');
      for(const face of d.faces)for(const p of face.quad){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThan(f.width);expect(p.y).toBeLessThan(f.height);}
      result=scanner.observe({...d,transform:{...transform,frameWidth:f.width,frameHeight:f.height}} as CubeObservation);
    }
    if(f.expected===null)expect(result!.read).toBeUndefined();
    else{expect(result!.read,JSON.stringify(result)).toBeDefined();const read=result!.read!;expect(assemblePhoto(read.panels,read.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:f.expected}});}
  },30000);
});

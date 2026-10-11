import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {CubeObservation,Face} from '../src/core/types';
import {applyMoves,SOLVED,validateCube} from '../src/core/cube';
import {matchObservation} from '../src/core/tracker';
import {CubeScanner} from '../src/core/scanner';
import {DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto} from '../src/photo/model';
import {projected,state} from './fixtures';
import {joinedExample,joinedNetFrame,netCube,netFrame} from './net-fixtures';
import {renderObservation} from './pixels';

// Generated camera variations, not claims about a live phone trial. Channel
// gains model a camera white-balance change; brightness varies across the image.
function cameraCast(source:Uint8Array,width:number,red:number,blue:number):Uint8Array {
  const out=new Uint8Array(source);
  for(let i=0;i<out.length;i+=4){
    const exposure=.72+.36*((i/4)%width)/width;
    for(let c=0;c<3;c++)out[i+c]=Math.min(255,Math.round(source[i+c]!*exposure*(c===0?red:c===2?blue:1)));
  }
  return out;
}

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('camera color calibration (generated pixels)',()=>{
  it('reads the exact cube from warm and cool picture casts with uneven exposure',async()=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')();
    for(const joined of [true,false])for(const [red,blue] of [[1.16,.84],[.85,1.15]]){
      const o=joined?joinedNetFrame(true):netFrame(true),w=o.transform.frameWidth,h=o.transform.frameHeight;
      const pixels=cameraCast(renderObservation(o,{rounded:.12}),w,red!,blue!),ptr=engine._malloc(pixels.length);
      try{
        engine.HEAPU8.set(pixels,ptr);
        const d=JSON.parse(engine.detectPictureRGBA(ptr,w,h,w*4)),scanner=new DiagramScanner();let result;
        for(const timestamp of [0,250,500,750])result=scanner.observe({...o,...d,timestamp});
        expect(result!.read,JSON.stringify({joined,red,blue,result})).toBeDefined();
        const read=result!.read!,validated=assemblePhoto(read.panels,read.labels!,[0,0,0,0,0,0]);
        expect(validated).toMatchObject({valid:true,state:{facelets:(joined?joinedExample:netCube).facelets}});
      }finally{engine._free(ptr);}
    }
  },30000);

  it('preserves physical cube colors and reconstructs the same observed state under a cast',async()=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')();
    const cube=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
    const views:Face[][]=[['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']];
    for(const [red,blue] of [[1.12,.88],[.9,1.1]]){
      const scanner=new CubeScanner(),observed:CubeObservation[]=[];let result,timestamp=0;
      for(const faces of views){
        const source=projected(cube,faces,0),w=source.transform.frameWidth,h=source.transform.frameHeight;
        const pixels=cameraCast(renderObservation(source),w,red!,blue!),ptr=engine._malloc(pixels.length);
        try{
          engine.HEAPU8.set(pixels,ptr);const detected={...source,...JSON.parse(engine.detectRGBA(ptr,w,h,w*4))};
          expect(detected.faces,JSON.stringify({red,blue,faces})).toHaveLength(3);
          expect(matchObservation(cube,detected)).not.toBeNull();observed.push(detected);
          for(let i=0;i<4;i++)result=scanner.observe({...detected,timestamp:timestamp+=150});
        }finally{engine._free(ptr);}
      }
      expect(result!.state,JSON.stringify(result)).toBeDefined();expect(validateCube(result!.state!.facelets).valid).toBe(true);
      // Scanner chooses its own whole-cube reference; all measured faces must
      // agree with the reconstructed state rather than comparing that reference.
      for(const o of observed)expect(matchObservation(result!.state!,o)).not.toBeNull();
    }
  },30000);

  it('does not invent a missing color or accept inconsistent center evidence',async()=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')();
    for(const problem of ['missing-orange','duplicate-white-center'] as const){
      const o=joinedNetFrame(true);
      if(problem==='missing-orange')o.faces=o.faces.map(f=>({...f,colors:f.colors.map(c=>c==='orange'?'red':c) as typeof f.colors}));
      else{o.faces[2]!.colors[4]='white';}
      const w=o.transform.frameWidth,h=o.transform.frameHeight,pixels=cameraCast(renderObservation(o),w,.9,1.1),ptr=engine._malloc(pixels.length);
      try{
        engine.HEAPU8.set(pixels,ptr);const d=JSON.parse(engine.detectPictureRGBA(ptr,w,h,w*4)),scanner=new DiagramScanner();
        for(const timestamp of [0,250,500,750]){
          const result=scanner.observe({...o,...d,timestamp});
          if(result.read)expect(assemblePhoto(result.read.panels,result.read.labels!,[0,0,0,0,0,0]).valid).toBe(false);
        }
      }finally{engine._free(ptr);}
    }
  },30000);
});

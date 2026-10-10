import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {renderObservation} from './pixels';
import {observation,projected,state} from './fixtures';
import {CubeScanner} from '../src/core/scanner';
import {CubeTracker,matchObservation} from '../src/core/tracker';
import {SOLVED,applyMoves,moveFacelets} from '../src/core/cube';
import {CubeObservation,Face,Move} from '../src/core/types';
const require=createRequire(import.meta.url);
// Source-only checkouts can run the logical suite before the toolchain build.
// npm run test:vision requires the binary and never silently skips it.
describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('compiled detector integration (synthetic pixels)',()=>{
  it('captures small rounded stickers without accepting a covered grid',async()=>{
    const engine=await require('../public/vision/cube-vision.js')(),ptr=engine._malloc(640*480*4);
    const cube=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B']));
    try{
      for(const size of [90,150,240]){
        const o=observation(cube,['F'],0);
        o.faces[0]!.quad=[{x:210,y:140},{x:210+size,y:135},{x:220+size,y:140+size},{x:200,y:145+size}];
        const pixels=renderObservation(o,{rounded:.3});engine.HEAPU8.set(pixels,ptr);
        const detected={...o,...JSON.parse(engine.detectRGBA(ptr,640,480,640*4))};
        expect(detected.faces).toHaveLength(1);
        expect(matchObservation(cube,detected)?.[0]?.face).toBe('F');
        const scanner=new CubeScanner();
        scanner.observe(detected);scanner.observe({...detected,timestamp:150});
        expect(scanner.observe({...detected,timestamp:300}).captured).toEqual([cube.centers.F]);
        // Cover a third of the face with a neutral obstruction.
        for(let y=130;y<155+size;y++)for(let x=195;x<220+size/3;x++)pixels.set([48,54,51,255],(y*640+x)*4);
        engine.HEAPU8.set(pixels,ptr);
        expect(JSON.parse(engine.detectRGBA(ptr,640,480,640*4)).faces).toHaveLength(0);
      }
    }finally{engine._free(ptr);}
  });
  it('reconstructs arbitrary views and verifies a correct and an incorrect settled turn',async()=>{
    const engine=await require('../public/vision/cube-vision.js')();
    const ptr=engine._malloc(640*480*4);
    const detect=(o:CubeObservation):CubeObservation=>{
      engine.HEAPU8.set(renderObservation(o),ptr);
      return {...o,...JSON.parse(engine.detectRGBA(ptr,640,480,640*4))};
    };
    try{
      const physical=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L'])),scanner=new CubeScanner();
      const views:Face[][]=[['R','B','D'],['F','L','U'],['R','F','U'],['L','B','D']];
      let t=0,result;
      for(const faces of views)for(let i=0;i<4;i++){
        const o=detect(projected(physical,faces,t+=150));
        expect(o.faces.length,`detected faces for ${faces}`).toBe(3);
        expect(matchObservation(physical,o),JSON.stringify({faces,detected:o.faces})).not.toBeNull();
        result=scanner.observe(o);
      }
      expect(result!.state,JSON.stringify(result)).toBeDefined();
      const cube=result!.state!;
      for(const faces of views)expect(matchObservation(cube,detect(projected(physical,faces,t+=150)))).not.toBeNull();
      for(const move of ['R',"U'"] as Move[]){
        const tracker=new CubeTracker(),after={...cube,facelets:moveFacelets(cube.facelets,move)};
        let tracking;
        for(let i=0;i<3;i++)tracking=tracker.observe(cube,detect(projected(after,['F','R','U'],t+=150)));
        expect(tracking!.status).toBe('move');expect(tracking!.move).toBe(move);
      }
    }finally{engine._free(ptr);}
  },30000);
});

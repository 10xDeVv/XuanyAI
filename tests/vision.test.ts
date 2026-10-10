import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {renderObservation} from './pixels';
import {projected,state} from './fixtures';
import {CubeScanner} from '../src/core/scanner';
import {CubeTracker,matchObservation} from '../src/core/tracker';
import {SOLVED,applyMoves,moveFacelets} from '../src/core/cube';
import {CubeObservation,Face,Move} from '../src/core/types';
const require=createRequire(import.meta.url);
// Source-only checkouts can run the logical suite before the toolchain build.
// npm run test:vision requires the binary and never silently skips it.
describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('compiled detector integration (synthetic pixels)',()=>{
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

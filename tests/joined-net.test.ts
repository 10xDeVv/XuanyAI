import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
import {CubeObservation,Quad} from '../src/core/types';
import {applyMoves,SOLVED,validateCube} from '../src/core/cube';
import {solveFacelets} from '../src/solver/solve';
import {arrangeDiagram,DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto} from '../src/photo/model';
import {joinedExample,joinedNetFrame} from './net-fixtures';
import {renderObservation} from './pixels';

const require=createRequire(import.meta.url);
describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('joined-face camera nets',()=>{
  it('groups the whole net instead of choosing overlapping 3x3 windows across faces',async()=>{
    expect(validateCube(joinedExample.facelets)).toEqual({valid:true});
    const engine=await require('../public/vision/cube-vision.js')(),messages:any[]=[];
    const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
    runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
    await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
    const detect=async(o:CubeObservation,pixels:Uint8Array)=>{
      await self.onmessage({data:{type:'frame',id:1,width:o.transform.frameWidth,height:o.transform.frameHeight,timestamp:0,buffer:pixels.buffer}});
      const d=messages.pop();expect(d.type).toBe('observation');return {...o,...d} as CubeObservation;
    };
    const capture=(d:CubeObservation)=>{const scan=new DiagramScanner();let result;for(const timestamp of [0,150,300,450])result=scan.observe({...d,timestamp});return result!.read;};
    for(const tilted of [false,true])for(const portrait of [false,true]){
      let o=joinedNetFrame(tilted);
      if(portrait)o={...o,transform:{...o.transform,frameWidth:720,frameHeight:1280},faces:o.faces.map(f=>({...f,quad:f.quad.map(p=>({x:p.x*.9+72,y:p.y*.9+424})) as Quad}))};
      const pixels=renderObservation(o,{rounded:.09,inset:.035,background:[17,17,17]}),d=await detect(o,pixels);
      expect(d.faces).toHaveLength(6);expect(d.largerGrid).toBe(false);
      const read=capture(d);expect(read,JSON.stringify({tilted,portrait,layout:arrangeDiagram(d.faces),quality:d.quality,minConfidence:Math.min(...d.faces.flatMap(f=>f.confidence)),minSharpness:Math.min(...d.faces.map(f=>f.sharpness))})).toBeDefined();
      const validation=assemblePhoto(read!.panels,read!.labels!,[0,0,0,0,0,0]);
      expect(validation).toMatchObject({valid:true,state:{facelets:joinedExample.facelets}});
      if(validation.valid)expect(applyMoves(validation.state.facelets,solveFacelets(validation.state.facelets))).toBe(SOLVED);
    }
    // Missing stickers cannot be recovered by borrowing a neighbor's square.
    const o=joinedNetFrame();
    for(const hidden of [0,2,4]){
      const incomplete={...o,faces:o.faces.filter((_,i)=>i!==hidden)};
      expect(capture(await detect(incomplete,renderObservation(incomplete,{rounded:.09,inset:.035,background:[17,17,17]})))).toBeUndefined();
    }
    const pixels=renderObservation(o,{rounded:.09,inset:.035,background:[17,17,17]});
    for(let y=180;y<220;y++)for(let x=280;x<320;x++)pixels.set([17,17,17,255],(y*640+x)*4);
    expect(capture(await detect(o,pixels))).toBeUndefined();
  },30000);
});

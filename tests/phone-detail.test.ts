import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
import {CubeScanner,reliableFace} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {CubeObservation,ObservedFace} from '../src/core/types';
import {rotateGrid} from '../src/core/cube';
import {phoneCube,phoneSource,phoneRequest,phoneViews} from './phone-fixtures';
import {projected} from './fixtures';

async function worker(engine:any){
  const messages:any[]=[];
  const self={location:{href:'https://local.test/vision.worker.js'},postMessage:(m:any)=>messages.push(m),onmessage:undefined as any};
  runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
  await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
  return async(data:any)=>{await self.onmessage({data});const result=messages.pop();expect(result.type,JSON.stringify(result)).toBe('observation');return result;};
}

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('phone detail after slow-frame adaptation',()=>{
  it.each([480,640])('completes a known scan with a %i-pixel processing limit',async limit=>{
    const run=await worker(await createRequire(import.meta.url)('../public/vision/cube-vision.js')());
    const before=new CubeScanner(),after=new CubeScanner();let previous,result,timestamp=0;
    const readings:CubeObservation[]=[];let improved=0;
    for(const faces of phoneViews){
      const source=phoneSource(faces),request=phoneRequest(source,limit);
      const baseline=await run({...request,detail:undefined}),focused=await run(request);
      if(focused.faces.filter(reliableFace).length>baseline.faces.filter(reliableFace).length)improved++;
      const o={...source.observation,...focused,transform:{...source.observation.transform,frameWidth:request.width,frameHeight:request.height}} as CubeObservation;
      expect(matchObservation(phoneCube,o),JSON.stringify(focused)).not.toBeNull();readings.push(o);
      for(let i=0;i<6;i++){
        timestamp+=200;previous=before.observe({...o,...baseline,timestamp});result=after.observe({...o,timestamp});
      }
    }
    if(limit===480){expect(improved).toBeGreaterThan(0);expect(previous!.captured.length).toBeLessThan(6);}
    expect(result!.captured).toHaveLength(6);expect(result!.state).toBeDefined();
    for(const o of readings)expect(matchObservation(result!.state!,o)).not.toBeNull();
  });
  it('does not complete a face whose squares are covered in the native camera pixels',async()=>{
    const source=phoneSource(['F']);
    for(let y=550;y<730;y++)for(let x=390;x<460;x++)source.pixels.set([48,54,51,255],(y*source.width+x)*4);
    const run=await worker(await createRequire(import.meta.url)('../public/vision/cube-vision.js')()),result=await run(phoneRequest(source));
    expect(result.faces.filter(reliableFace)).toHaveLength(0);
  });
});

it.each([0,1,2,3])('retains the known face when a more complete view reorders corners by %i turns',async rotation=>{
  const faces=projected(phoneCube,['F','R','U'],0).faces;
  const changed=faces.map(f=>({...f,colors:rotateGrid(f.colors,(4-rotation)%4),quad:f.quad.map((_,i)=>f.quad[(i+rotation)%4]!) as ObservedFace['quad']}));
  let calls=0;
  const run=await worker({HEAPU8:new Uint8Array(640*480*4+64),_malloc:()=>16,_free:()=>{},detectRGBA:()=>JSON.stringify({faces:calls++===0?[faces[0]]:changed})});
  const buffer=new ArrayBuffer(640*480*4),result=await run({type:'frame',id:1,width:640,height:480,buffer,detail:{buffer,width:640,height:480,x:0,y:0,scaleX:1,scaleY:1}});
  expect(result.faces).toHaveLength(3);
});

it.each(['conflict','displaced','missing','same-count'] as const)('keeps the original clear view if detail is %s',async problem=>{
    const faces=projected(phoneCube,['F','R','U'],0).faces,changed=structuredClone(faces);
    if(problem==='conflict')changed[0]!.colors[0]=changed[0]!.colors[0]==='red'?'blue':'red';
    if(problem==='displaced')changed[0]!.quad=changed[0]!.quad.map(p=>({x:p.x+100,y:p.y})) as ObservedFace['quad'];
    if(problem==='missing')changed.shift();
    if(problem==='same-count')changed.splice(1);
    let calls=0;
    const run=await worker({HEAPU8:new Uint8Array(640*480*4+64),_malloc:()=>16,_free:()=>{},detectRGBA:()=>JSON.stringify({faces:calls++===0?[faces[0]]:changed})});
    const buffer=new ArrayBuffer(640*480*4),result=await run({type:'frame',id:1,width:640,height:480,buffer,detail:{buffer,width:640,height:480,x:0,y:0,scaleX:1,scaleY:1}});
    expect(result.faces).toEqual([faces[0]]);
});

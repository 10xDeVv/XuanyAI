import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyMoves,SOLVED} from '../src/core/cube';
import {CubeScanner,reliableFace} from '../src/core/scanner';
import {matchObservation} from '../src/core/tracker';
import {CubeObservation,Face} from '../src/core/types';
import {projected,state} from './fixtures';
import {renderObservation} from './pixels';
import {cameraFrameSize} from '../src/camera/frameSize';

const require=createRequire(import.meta.url);
const cube=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
const recolor=(pixels:Uint8Array,from:number[],to:number[])=>{
  const result=new Uint8Array(pixels);
  for(let i=0;i<result.length;i+=4)if(from.every((v,c)=>pixels[i+c]===v))result.set(to,i);
  return result;
};

/** Generated camera stress cases, not physical iPhone recordings. Geometry and
 * expected colors are independent of the detector's classification thresholds. */
describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('physical camera palette and seam regressions',()=>{
  const run=async(check:(detect:(o:CubeObservation,pixels:Uint8Array)=>CubeObservation)=>void)=>{
    const engine=await require('../public/vision/cube-vision.js')(),ptr=engine._malloc(960*1280*4);
    try {check((o,pixels)=>{const {frameWidth:w,frameHeight:h}=o.transform;engine.HEAPU8.set(pixels,ptr);return {...o,...JSON.parse(engine.detectRGBA(ptr,w,h,w*4))};});}
    finally {engine._free(ptr);}
  };
  it.each([74,65,50])('uses measured colors when orange shifts toward red (G=%i) and white stays unchanged',async green=>{
    await run(detect=>{
      for(const faces of [['F'],['F','R','U'],['R','B','D'],['F','L','U'],['L','B','D']] as Face[][]){
        const o=projected(cube,faces,0),pixels=recolor(renderObservation(o,{rounded:.20}),[241,116,24],[241,green,24]);
        const measured=detect(o,pixels);
        expect(measured.faces.filter(reliableFace),JSON.stringify({faces,green,measured})).toHaveLength(faces.length);
        expect(matchObservation(cube,measured),JSON.stringify({faces,green,measured})).not.toBeNull();
      }
    });
  });
  it.each([74,65])('reconstructs a square-sticker cube with shifted orange (G=%i) from neighboring views',async green=>{
    await run(detect=>{
      const scanner=new CubeScanner(),measured:CubeObservation[]=[];let timestamp=0,result;
      for(const faces of [['F','R','U'],['R','B','D'],['F','L','U'],['L','B','D']] as Face[][]){
        const o=projected(cube,faces,0),pixels=recolor(renderObservation(o),[241,116,24],[241,green,24]);
        const view=detect(o,pixels);measured.push(view);
        // The square F/L/U fixture already lost its top region before the
        // palette fix. Two correct adjacent faces still provide scan evidence.
        expect(view.faces.filter(reliableFace).length).toBeGreaterThanOrEqual(2);
        expect(matchObservation(cube,view)).not.toBeNull();
        for(let i=0;i<3;i++)result=scanner.observe({...view,timestamp:timestamp+=150});
      }
      expect(result!.state).toBeDefined();expect(result!.captured).toHaveLength(6);
      for(const view of measured)expect(matchObservation(result!.state!,view)).not.toBeNull();
    });
  });
  it.each(['orange','blue','white','ambiguous','near-boundary'] as const)('does not invent a palette reference when %s is missing or inseparable',async missing=>{
    await run(detect=>{
      const o=projected(cube,['F','R','U'],0),original=renderObservation(o);
      const pixels=missing==='orange'?recolor(original,[241,116,24],[214,33,37]):
        missing==='blue'?recolor(original,[25,78,205],[25,171,67]):
        missing==='white'?recolor(original,[232,233,223],[245,218,25]):
        recolor(original,[241,116,24],missing==='near-boundary'?[241,44,24]:[230,38,32]);
      const measured=detect(o,pixels);
      // The geometry remains observable; the missing sixth reference cannot be
      // manufactured by splitting one hue cluster or imposing cube counts.
      expect(measured.faces.length).toBeGreaterThan(0);
      const absent=missing==='ambiguous'||missing==='near-boundary'?'orange':missing;
      expect(measured.faces.flatMap(f=>f.colors)).not.toContain(absent);
      expect(matchObservation(cube,measured)).toBeNull();
    });
  });
  it.each([.4,.6])('keeps narrow-seam observations correct at scale %s without inventing a missed face',async scale=>{
    await run(detect=>{
      const o=projected(cube,['F','R','U'],0);
      o.faces.forEach(f=>f.quad=f.quad.map(p=>({x:320+(p.x-320)*scale,y:240+(p.y-240)*scale})) as typeof f.quad);
      const measured=detect(o,renderObservation(o,{inset:.025,rounded:.20}));
      // At ~90 px overall cube width the third face is still missed. Preserve
      // the two measured neighbors; a larger view below must complete capture.
      if(scale===.4)expect(measured.faces.filter(reliableFace).length).toBeGreaterThanOrEqual(2);
      else expect(measured.faces.filter(reliableFace),JSON.stringify(measured)).toHaveLength(3);
      expect(matchObservation(cube,measured)).not.toBeNull();
    });
  });
  it.each([{width:480,height:640,scale:.4},{width:720,height:960,scale:.6}])('preserves narrow seams in a $width × $height portrait frame',async({width,height,scale})=>{
    await run(detect=>{
      const o=projected(cube,['F','R','U'],0);
      o.transform={...o.transform,frameWidth:width,frameHeight:height};
      o.faces.forEach(f=>f.quad=f.quad.map(p=>({x:width/2+(p.x-320)*scale,y:height/2+(p.y-240)*scale})) as typeof f.quad);
      const measured=detect(o,renderObservation(o,{inset:.025,rounded:.20}));
      if(scale===.4)expect(measured.faces.filter(reliableFace).length).toBeGreaterThanOrEqual(2);
      else expect(measured.faces.filter(reliableFace),JSON.stringify(measured)).toHaveLength(3);
      expect(matchObservation(cube,measured)).not.toBeNull();
    });
  });
  it('finishes a partial small-cube scan only after a larger measured view of the missing face',async()=>{
    await run(detect=>{
      const views:Face[][]=[['F','R','U'],['R','B','D'],['F','L','U'],['L','B','D']];
      const scanner=new CubeScanner(),observed:CubeObservation[]=[];let timestamp=0,result;
      const capture=(faces:Face[],scale:number)=>{
        const o=projected(cube,faces,0);o.transform={...o.transform,frameWidth:480,frameHeight:640};
        o.faces.forEach(f=>f.quad=f.quad.map(p=>({x:240+(p.x-320)*scale,y:320+(p.y-240)*scale})) as typeof f.quad);
        const view=detect(o,renderObservation(o,{inset:.025,rounded:.20}));observed.push(view);
        expect(matchObservation(cube,view)).not.toBeNull();
        for(let i=0;i<3;i++)result=scanner.observe({...view,timestamp:timestamp+=150});
      };
      for(const faces of views)capture(faces,.4);
      const captured=result!.captured;
      for(const faces of views.filter(faces=>faces.some(f=>!captured.includes(cube.centers[f]))))capture(faces,1);
      expect(result!.captured).toHaveLength(6);expect(result!.state).toBeDefined();
      for(const view of observed)expect(matchObservation(result!.state!,view)).not.toBeNull();
    });
  });
  it('captures the small narrow-seam cube at the production portrait resolution without moving it closer',async()=>{
    await run(detect=>{
      const scanner=new CubeScanner(),views:Face[][]=[['F','R','U'],['R','B','D'],['F','L','U'],['L','B','D']];
      const {width,height}=cameraFrameSize(960,1280),scale=width/1200;
      let timestamp=0,result;
      for(const faces of views){
        const o=projected(cube,faces,0);o.transform={...o.transform,frameWidth:width,frameHeight:height};
        o.faces.forEach(f=>f.quad=f.quad.map(p=>({x:width/2+(p.x-320)*scale,y:height/2+(p.y-240)*scale})) as typeof f.quad);
        const view=detect(o,renderObservation(o,{inset:.025,rounded:.20}));
        if(faces===views[0])expect(view.faces.filter(reliableFace)).toHaveLength(3);
        expect(matchObservation(cube,view)).not.toBeNull();
        for(let i=0;i<6;i++)result=scanner.observe({...view,timestamp:timestamp+=150});
      }
      expect(result!.captured).toHaveLength(6);expect(result!.state).toBeDefined();
      for(const faces of views)expect(matchObservation(result!.state!,projected(cube,faces,timestamp))).not.toBeNull();
    });
  });
});

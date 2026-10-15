import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {CubeScanner,reliableFace} from '../src/core/scanner';
import {rotateGrid} from '../src/core/cube';
import {CubeColor,CubeObservation,FaceGrid,ObservedFace} from '../src/core/types';
import {observation,state,transform} from './fixtures';
import {SOLVED} from '../src/core/cube';
import {renderObservation} from './pixels';

const expected:FaceGrid<CubeColor>=['green','orange','white','red','white','red','yellow','yellow','blue'];
const upright=(face:ObservedFace)=>{
  let first=0;for(let i=1;i<4;i++)if(face.quad[i]!.x+face.quad[i]!.y<face.quad[first]!.x+face.quad[first]!.y)first=i;
  return rotateGrid(face.colors,(4-first)%4);
};
const require=createRequire(import.meta.url);
describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('printed physical centers',()=>{
  it.each([120,180])('reads a %i-pixel face with a multicolor center mark and shifted orange',async size=>{
    const o=observation(state(SOLVED),['U'],0),face=o.faces[0]!;
    face.colors=[...expected];face.quad=[{x:240,y:140},{x:240+size,y:140},{x:240+size,y:140+size},{x:240,y:140+size}];
    const pixels=renderObservation(o,{rounded:.15}),w=o.transform.frameWidth;
    // Distinct measured red/orange at 354/6 degrees, including red's hue wrap.
    for(let i=0;i<pixels.length;i+=4){
      if(pixels[i]===214&&pixels[i+1]===33)pixels.set([214,33,51],i);
      if(pixels[i]===241&&pixels[i+1]===116)pixels.set([241,46,24],i);
    }
    const cx=240+size/2,cy=140+size/2;
    for(let y=Math.ceil(cy-size*.045);y<cy+size*.045;y++)for(let x=Math.ceil(cx-size*.045);x<cx+size*.045;x++){
      pixels.set([(x+y)%3===0?200:25,(x+y)%3===1?160:30,(x+y)%3===2?190:30,255],(y*w+x)*4);
    }
    const e=await require('../public/vision/cube-vision.js')(),p=e._malloc(pixels.length);
    try{
      e.HEAPU8.set(pixels,p);const result=JSON.parse(e.detectRGBA(p,w,480,w*4));
      expect(result.faces.filter(reliableFace),JSON.stringify(result)).toHaveLength(1);expect(upright(result.faces[0])).toEqual(expected);
      // An obstruction across the sticker edge is not a small printed logo.
      for(let y=cy-size/6;y<cy+size/6;y++)for(let x=cx-size/6;x<cx+size/20;x++)pixels.set([80,42,30,255],(y*w+x)*4);
      e.HEAPU8.set(pixels,p);const covered=JSON.parse(e.detectRGBA(p,w,480,w*4));
      expect(covered.faces.filter(reliableFace),JSON.stringify(covered)).toHaveLength(0);
    }finally{e._free(p);}
  });
});

// Private screenshot crops are kept outside Git and hosted assets. Their
// labels come from the supplied image, not from detector predictions. This
// replay proves one face can capture; it is not a six-face physical trial.
const path=process.env.CUBE_LAPTOP_CASES;
const cases:ReplayCase[]=path?JSON.parse(readFileSync(path,'utf8')).filter((c:ReplayCase)=>c.name==='full'||c.name.startsWith('full-')):[];
type ReplayCase={name:string;path:string;width:number;height:number};
describe.skipIf(!path)('reported laptop screenshot',()=>{
  it.each(cases)('reads and saves the correct visible face in $name',async c=>{
    const e=await require('../public/vision/cube-vision.js')(),pixels=readFileSync(c.path),p=e._malloc(pixels.length);
    try{
      e.HEAPU8.set(pixels,p);const detected=JSON.parse(e.detectRGBA(p,c.width,c.height,c.width*4));
      expect(detected.faces.filter(reliableFace)).toHaveLength(1);expect(upright(detected.faces[0])).toEqual(expected);
      const o={...detected,transform:{...transform,frameWidth:c.width,frameHeight:c.height}} as CubeObservation;
      const scanner=new CubeScanner();let result;
      for(const timestamp of [0,250,500])result=scanner.observe({...o,timestamp});
      expect(result!.captured).toEqual(['white']);expect(result!.state).toBeUndefined();
    }finally{e._free(p);}
  });
});

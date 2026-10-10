import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
import {cameraFrameSize} from '../src/camera/frameSize';
import {CubeObservation,Quad} from '../src/core/types';
import {netCube,netFrame} from './net-fixtures';
import {renderObservation} from './pixels';
import {DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto} from '../src/photo/model';
import {Session} from '../src/session/Session';

const require=createRequire(import.meta.url);
/** A complete landscape sheet occupies 80% of a portrait camera's width. */
function portraitSource():CubeObservation {
  const o=netFrame();return {...o,transform:{...o.transform,frameWidth:720,frameHeight:1280},faces:o.faces.map(f=>({...f,quad:f.quad.map(p=>({x:p.x*.9+72,y:p.y*.9+424})) as Quad}))};
}
/** Box filtering reproduces the loss of faint boundaries when halving a frame. */
function cameraPixels(source:Uint8Array,width:number,height:number){
  if(width===720&&height===1280)return source;
  const output=new Uint8Array(width*height*4),scale=720/width;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++){
    let sum=0;for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)sum+=source[(((y*scale+dy)*720+x*scale+dx)*4)+c]!;
    output[(y*width+x)*4+c]=Math.round(sum/(scale*scale));
  }
  return output;
}

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('portrait camera detail',()=>{
  it('preserves enough detail for a complete six-face net through the actual frame worker',async()=>{
    const engine=await require('../public/vision/cube-vision.js')(),messages:any[]=[];
    const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
    runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
    await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
    const o=portraitSource(),source=renderObservation(o,{rounded:.18,background:[240,245,249],border:[195,202,212]});
    const detect=async(picture:boolean,bytes=source)=>{
      const {width,height}=cameraFrameSize(720,1280,picture),buffer=cameraPixels(bytes,width,height).buffer;
      await self.onmessage({data:{type:'frame',id:1,width,height,timestamp:0,buffer}});
      const d=messages.pop();expect(d.type).toBe('observation');
      return {...o,...d,transform:{...o.transform,frameWidth:width,frameHeight:height}} as CubeObservation;
    };
    const scan=(d:CubeObservation)=>{const scanner=new DiagramScanner();let result;for(const timestamp of [0,150,300,450])result=scanner.observe({...d,timestamp});return result!;};
    // The previous physical-cube frame size silently failed to capture this sheet.
    expect(scan(await detect(false)).read).toBeUndefined();
    const high=await detect(true),read=scan(high).read;expect(read).toBeDefined();
    expect(assemblePhoto(read!.panels,read!.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:netCube.facelets}});
    // More resolution must not allow missing colors to be filled in.
    const covered=source.slice();
    for(let y=0;y<1280;y++)for(let x=600;x<720;x++)covered.set([95,93,90,255],(y*720+x)*4);
    expect(scan(await detect(true,covered)).read).toBeUndefined();
  },30000);
});

it('keeps auto-detected picture mode through partial frames instead of reverting to cube resolution',()=>{
  const session=new Session({ready:async()=>{},solve:async s=>({revision:s.revision,moves:[]}),dispose(){}}),o=netFrame();
  session.start();session.observe(o);
  session.observe({...o,timestamp:150,faces:o.faces.slice(0,2)});
  expect(session.getSnapshot()).toMatchObject({stage:'scanning',diagramCount:2,captured:[]});
  for(const timestamp of [300,450,600]){session.observe({...o,timestamp});expect(session.getSnapshot().stage).toBe('scanning');}
  session.observe({...o,timestamp:750});expect(session.getSnapshot().stage).toBe('picture');session.dispose();
});

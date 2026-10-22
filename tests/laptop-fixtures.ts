import {applyMoves,SOLVED} from '../src/core/cube';
import {Face} from '../src/core/types';
import {observation,state} from './fixtures';
import {renderObservation} from './pixels';

export const laptopCube=state(applyMoves(SOLVED,['R','U',"F'",'D','L2','B',"R'",'U2','F','L']));
/** Labeled generated webcam pixels with mild blur, not a physical recording. */
export function laptopFrame(face:Face='F',size=48,covered=false){
  const o=observation(laptopCube,[face],0);o.transform.frameWidth=1280;o.transform.frameHeight=720;
  o.faces[0]!.quad=[{x:640-size/2,y:360-size/2},{x:640+size/2,y:360-size/2},{x:640+size/2,y:360+size/2},{x:640-size/2,y:360+size/2}];
  const original=renderObservation(o,{rounded:.2,inset:.025}),pixels=original.slice();
  for(let y=360-size/2-2;y<360+size/2+2;y++)for(let x=640-size/2-2;x<640+size/2+2;x++)for(let c=0;c<3;c++){
    let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=original[((y+dy)*1280+x+dx)*4+c]!;
    pixels[(y*1280+x)*4+c]=Math.round(sum/9);
  }
  if(covered)for(let y=360-size;y<360+size;y++)for(let x=640-size;x<640-size/6;x++)pixels.set([48,54,51,255],(y*1280+x)*4);
  return {pixels,observation:o};
}

/** Area sampling is an independent stand-in for the browser canvas reduction. */
export function sampleWebcam(src:Uint8Array,x0:number,y0:number,cw:number,ch:number,w:number,h:number,sourceWidth=1280){
  const out=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const x1=x0+x*cw/w,x2=x0+(x+1)*cw/w,y1=y0+y*ch/h,y2=y0+(y+1)*ch/h,sum=[0,0,0];
    for(let sy=Math.floor(y1);sy<Math.ceil(y2);sy++)for(let sx=Math.floor(x1);sx<Math.ceil(x2);sx++){
      const weight=(Math.min(sx+1,x2)-Math.max(sx,x1))*(Math.min(sy+1,y2)-Math.max(sy,y1));
      for(let c=0;c<3;c++)sum[c]!+=src[(sy*sourceWidth+sx)*4+c]!*weight;
    }
    out.set([...sum.map(v=>Math.round(v/((x2-x1)*(y2-y1)))),255],(y*w+x)*4);
  }
  return out;
}

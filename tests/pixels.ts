import {CubeObservation,Point,Quad,CubeColor} from '../src/core/types';
import {projectOnQuad} from '../src/core/geometry';
const palette:Record<CubeColor,number[]>={white:[232,233,223],red:[214,33,37],green:[25,171,67],yellow:[245,218,25],orange:[241,116,24],blue:[25,78,205]};
/** Generated pixels with explicit geometry and colors; never a physical camera recording. */
export function renderObservation(o:CubeObservation,options:{rounded?:number;inset?:number;background?:number[];border?:number[]}={}):Uint8Array {
  const {frameWidth:w,frameHeight:h}=o.transform,bytes=new Uint8Array(w*h*4);
  for(let i=0;i<bytes.length;i+=4)bytes.set([...(options.background??[48,54,51]),255],i);
  const paint=(q:Point[],rgb:number[])=>{
    const left=Math.max(0,Math.floor(Math.min(...q.map(p=>p.x)))),right=Math.min(w,Math.ceil(Math.max(...q.map(p=>p.x))));
    const top=Math.max(0,Math.floor(Math.min(...q.map(p=>p.y)))),bottom=Math.min(h,Math.ceil(Math.max(...q.map(p=>p.y))));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const c=q.map((a,i)=>{const b=q[(i+1)%q.length]!;return (b.x-a.x)*(y+.5-a.y)-(b.y-a.y)*(x+.5-a.x);});
      if(c.every(v=>v>=0)||c.every(v=>v<=0))bytes.set([...rgb,255],(y*w+x)*4);
    }
  };
  for(const f of o.faces){
    paint(f.quad,options.border??[14,16,15]);
    for(let r=0;r<3;r++)for(let c=0;c<3;c++){
      const inset=options.inset??.055,radius=options.rounded??0,low=inset+radius,high=1-inset-radius;
      const outline=radius?[[high,low],[high,high],[low,high],[low,low]].flatMap(([x,y],corner)=>Array.from({length:6},(_,i)=>{
        const angle=(-90+corner*90+i*18)*Math.PI/180;return [c+x!+radius*Math.cos(angle),r+y!+radius*Math.sin(angle)];
      })):[[c+inset,r+inset],[c+1-inset,r+inset],[c+1-inset,r+1-inset],[c+inset,r+1-inset]];
      paint(outline.map(([u,v])=>projectOnQuad(f.quad,u!/3,v!/3)),palette[f.colors[r*3+c]!]);
    }
  }
  return bytes;
}

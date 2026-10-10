import {BASIS,rotateGrid,DEFAULT_CENTERS} from '../src/core/cube';
import {CubeObservation,CubeState,Face,FACES,ObservedFace,Quad} from '../src/core/types';
export const transform={frameWidth:640,frameHeight:480,previewWidth:640,previewHeight:480,rotation:0 as const,mirrored:false};
export function state(facelets:string):CubeState{return {facelets,centers:DEFAULT_CENTERS,revision:1};}
export function seen(s:CubeState,face:Face,rotation=0,quad?:Quad):ObservedFace {
  const colors=[...s.facelets.slice(FACES.indexOf(face)*9,FACES.indexOf(face)*9+9)].map(f=>s.centers[f as Face]);
  return {colors:rotateGrid(colors,rotation),confidence:[1,1,1,1,1,1,1,1,1],quad:quad??[{x:20,y:20},{x:140,y:20},{x:140,y:140},{x:20,y:140}],sharpness:120,glare:0};
}
export function observation(s:CubeState,faces:Face[],timestamp:number):CubeObservation {
  return {timestamp,faces:faces.map((f,i)=>seen(s,f,0,[{x:i*150,y:0},{x:i*150+100,y:0},{x:i*150+100,y:100},{x:i*150,y:100}])),quality:'good',processingMs:1,transform};
}
/** Physically consistent projection; used to exercise arbitrary face order without hand-authored edge constraints. */
export function projected(s:CubeState,faces:Face[],timestamp:number):CubeObservation {
  const direction=faces.map(f=>BASIS[f].n).reduce((a,b)=>a.map((n,i)=>n+b[i]!) as [number,number,number],[0,0,0] as [number,number,number]);
  const norm=(v:number[])=>{const l=Math.hypot(...v);return v.map(n=>n/l);};
  const n=norm(direction),worldUp=Math.abs(n[1]!)>.9?[0,0,-1]:[0,1,0];
  const cross=(a:number[],b:number[])=>[a[1]!*b[2]!-a[2]!*b[1]!,a[2]!*b[0]!-a[0]!*b[2]!,a[0]!*b[1]!-a[1]!*b[0]!];
  const right=norm(cross(worldUp,n)),up=cross(n,right),dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i]!,0);
  const result=faces.map(f=>{
    const basis=BASIS[f];
    const q=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{
      const p=basis.n.map((v,i)=>v+x!*basis.right[i]!+y!*basis.down[i]!);
      return {x:320+dot(p,right)*80,y:240-dot(p,up)*80};
    }) as Quad;
    return seen(s,f,0,q);
  });
  return {timestamp,faces:result,quality:'good',processingMs:1,transform};
}

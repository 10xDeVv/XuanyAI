import {applyMoves,BASIS} from './cube';
import {CubeColor,CubeState,Face,FACES,Move,Point} from './types';

export type Vec3=[number,number,number];
export type CameraView={yaw:number;pitch:number;zoom?:number;panX?:number;panY?:number};
export type CubeSurface={id:string;corners:Vec3[];normal:Vec3;center:Vec3;active:boolean;color?:CubeColor;face?:Face;sticker?:number};
export type ProjectedSurface=CubeSurface&{points:Point[];depth:number;light:number};
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const rotate=(p:Vec3,n:Vec3,angle:number):Vec3=>add(add(mul(p,Math.cos(angle)),mul(cross(n,p),Math.sin(angle))),mul(n,dot(n,p)*(1-Math.cos(angle))));

/** The camera can orbit; the cube's logical Up/Front reference never changes. */
export function viewForMove(move?:Move):CameraView {
  const face=move?.[0];
  return {yaw:face==='L'?-Math.PI/4:face==='B'?Math.PI*3/4:Math.PI/4,pitch:face==='D'?-.5:.5};
}
/** Dragging the scene never changes the cube or its logical face reference. */
export function orbitView(view:CameraView,dx:number,dy:number,span=320):CameraView {
  const scale=320/Math.max(100,span);
  return {...view,yaw:view.yaw-dx*.009*scale,pitch:clamp(view.pitch+dy*.009*scale,-1.5,1.5)};
}
export function panView(view:CameraView,dx:number,dy:number,span=320):CameraView {
  const scale=320/Math.max(100,span);
  return {...view,panX:clamp((view.panX??0)+dx*scale,-90,90),panY:clamp((view.panY??0)+dy*scale,-90,90)};
}
export function zoomView(view:CameraView,factor:number):CameraView {
  return {...view,zoom:clamp((view.zoom??1)*factor,.65,1.65)};
}
export function stateAtStep(initial:CubeState,moves:readonly Move[],step:number):CubeState {
  const count=clamp(Math.floor(Number.isFinite(step)?step:0),0,moves.length);
  return {...initial,facelets:applyMoves(initial.facelets,moves.slice(0,count)),revision:initial.revision+count};
}

/** All geometry derives from the same face basis as the solver's permutations. */
export function cubeSurfaces(state:CubeState,move?:Move,progress=0):CubeSurface[] {
  const surfaces:CubeSurface[]=[],axis=move?BASIS[move[0] as Face].n:undefined;
  const angle=move?(move.endsWith("'")?1:-1)*(move.endsWith('2')?Math.PI:Math.PI/2)*clamp(progress,0,1):0;
  const square=(id:string,p:Vec3,face:Face,half:number,offset:number,color?:CubeColor,sticker?:number)=>{
    const b=BASIS[face],active=!!axis&&dot(p,axis)>.5,center=add(p,mul(b.n,offset));
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(b.right,x!*half),mul(b.down,y!*half))));
    surfaces.push({id,center:active?rotate(center,axis!,angle):center,corners:active?corners.map(p=>rotate(p,axis!,angle)):corners,
      normal:active?rotate(b.n,axis!,angle):b.n,active,color,face,sticker});
  };
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    if(!x&&!y&&!z)continue;
    for(const face of FACES)square(`body-${x}-${y}-${z}-${face}`,[x,y,z],face,.477,.477);
  }
  FACES.forEach((face,f)=>{const b=BASIS[face];for(let i=0;i<9;i++){
    const p=add(b.n,add(mul(b.right,i%3-1),mul(b.down,Math.floor(i/3)-1)));
    square(`sticker-${f*9+i}`,p,face,.408,.487,state.centers[state.facelets[f*9+i] as Face],f*9+i);
  }});
  return surfaces;
}
function camera(view:CameraView) {
  const {yaw,pitch}=view,dir:Vec3=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
  const right:Vec3=[Math.cos(yaw),0,-Math.sin(yaw)];
  return {dir,right,up:cross(dir,right)};
}
export function projectPoint(p:Vec3,view:CameraView,size=320):Point {
  const {dir,right,up}=camera(view),scale=size*.16*(view.zoom??1)*8/(8-dot(p,dir));
  return {x:size/2+dot(p,right)*scale+(view.panX??0),y:size/2-dot(p,up)*scale+(view.panY??0)};
}
export function projectSurfaces(surfaces:CubeSurface[],view:CameraView,size=320):ProjectedSurface[] {
  const {dir}=camera(view),eye=mul(dir,8);
  return surfaces.filter(s=>dot(s.normal,add(eye,mul(s.center,-1)))>.001).map(s=>({...s,
    points:s.corners.map(p=>projectPoint(p,view,size)),depth:dot(s.center,dir),
    light:clamp(.73+.15*s.normal[1]+.08*s.normal[2]-.04*s.normal[0],.56,1),
  })).sort((a,b)=>a.depth-b.depth||Number(a.color!==undefined)-Number(b.color!==undefined));
}
/** Arrow lies on the target face and follows the solver's outside-face convention. */
export function previewArrow(move:Move,view:CameraView,size=320):Point[] {
  const b=BASIS[move[0] as Face],direction=move.endsWith("'")?-1:1;
  return Array.from({length:37},(_,i)=>{
    const angle=-Math.PI*.8+direction*i/36*Math.PI*1.45;
    return projectPoint(add(mul(b.n,1.56),add(mul(b.right,.97*Math.cos(angle)),mul(b.down,.97*Math.sin(angle)))),view,size);
  });
}

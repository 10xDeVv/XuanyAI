import { Point, Quad, PreviewTransform } from './types';

export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function sharedEdge(a:Quad,b:Quad):[number,number]|null {
  let best:{i:number;j:number;error:number}|null=null;
  for(let i=0;i<4;i++) for(let j=0;j<4;j++) {
    const length=(distance(a[i]!,a[(i+1)%4]!)+distance(b[j]!,b[(j+1)%4]!))/2;
    const error=(distance(a[i]!,b[(j+1)%4]!)+distance(a[(i+1)%4]!,b[j]!))/(2*length);
    if(length>8 && error<0.22 && (!best || error<best.error)) best={i,j,error};
  }
  return best ? [best.i,best.j] : null;
}
/** Unit square to arbitrary planar quadrilateral, including perspective. */
export function projectOnQuad(q:Quad,u:number,v:number):Point {
  const [a,b,c,d]=q;
  const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
  const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
  const det=dx1*dy2-dx2*dy1;
  const g=Math.abs(det)>1e-9?(dx3*dy2-dx2*dy3)/det:0;
  const h=Math.abs(det)>1e-9?(dx1*dy3-dx3*dy1)/det:0;
  const denom=g*u+h*v+1;
  return {x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/denom,y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/denom};
}
export function toPreview(p:Point,t:PreviewTransform):Point {
  let {x,y}=p, w=t.frameWidth,h=t.frameHeight;
  if(t.rotation===90) { [x,y]=[h-y,x]; [w,h]=[h,w]; }
  else if(t.rotation===180) [x,y]=[w-x,h-y];
  else if(t.rotation===270) { [x,y]=[y,w-x]; [w,h]=[h,w]; }
  if(t.mirrored) x=w-x;
  const scale=Math.max(t.previewWidth/w,t.previewHeight/h);
  return {x:x*scale+(t.previewWidth-w*scale)/2,y:y*scale+(t.previewHeight-h*scale)/2};
}
export function turnArrow(q:Quad,counterclockwise:boolean):{path:string;head:string} {
  const points=Array.from({length:33},(_,i)=>{
    const theta=(-Math.PI*0.8)+(counterclockwise?-1:1)*i/32*Math.PI*1.5;
    return projectOnQuad(q,0.5+0.32*Math.cos(theta),0.5+0.32*Math.sin(theta));
  });
  const end=points[32]!,prev=points[29]!;
  const angle=Math.atan2(end.y-prev.y,end.x-prev.x);
  const size=Math.max(9,Math.min(23,distance(q[0],q[1])*0.12));
  const left={x:end.x-size*Math.cos(angle-0.55),y:end.y-size*Math.sin(angle-0.55)};
  const right={x:end.x-size*Math.cos(angle+0.55),y:end.y-size*Math.sin(angle+0.55)};
  return {path:points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),head:`${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`};
}

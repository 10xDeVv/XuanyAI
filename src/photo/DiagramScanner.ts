import {distance,projectOnQuad} from '../core/geometry';
import {reliableFace} from '../core/scanner';
import {CubeObservation,ObservedFace,Point} from '../core/types';
import {PhotoLayout,PhotoRead,reviewPanel,uprightFace} from './model';

const unit=(p:Point):Point=>{const n=Math.hypot(p.x,p.y);return {x:p.x/n,y:p.y/n};};
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const span=(values:number[])=>Math.max(...values)-Math.min(...values);
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;

/** Spatial panel identity, never center-color identity. No OCR or fixed crops. */
export function arrangeDiagram(input:ObservedFace[]):{faces:ObservedFace[];columns:PhotoLayout}|null {
  if(input.length!==6)return null;
  const faces=input.map(uprightFace);
  const axes=faces.map(f=>({
    x:unit({x:f.quad[1].x-f.quad[0].x,y:f.quad[1].y-f.quad[0].y}),
    y:unit({x:f.quad[3].x-f.quad[0].x,y:f.quad[3].y-f.quad[0].y}),
  }));
  const x=unit({x:mean(axes.map(a=>a.x.x)),y:mean(axes.map(a=>a.x.y))});
  const y=unit({x:mean(axes.map(a=>a.y.x)),y:mean(axes.map(a=>a.y.y))});
  const det=x.x*y.y-x.y*y.x;
  if(!Number.isFinite(det)||det<.65||axes.some(a=>dot(a.x,x)<.93||dot(a.y,y)<.93))return null;
  const sizes=faces.map(f=>(distance(f.quad[0],f.quad[1])+distance(f.quad[0],f.quad[3]))/2),size=mean(sizes);
  if(Math.min(...sizes)<Math.max(...sizes)*.55)return null;
  const panels=faces.map(face=>{
    const c=projectOnQuad(face.quad,.5,.5);
    return {face,u:(c.x*y.y-c.y*y.x)/det/size,v:(x.x*c.y-x.y*c.x)/det/size};
  });
  for(const columns of [3,2] as const){
    const vertical=[...panels].sort((a,b)=>a.v-b.v),rows=6/columns;
    const groups=Array.from({length:rows},(_,r)=>vertical.slice(r*columns,(r+1)*columns).sort((a,b)=>a.u-b.u));
    const rowPositions=groups.map(g=>mean(g.map(p=>p.v)));
    const colPositions=Array.from({length:columns},(_,c)=>mean(groups.map(g=>g[c]!.u)));
    const gaps=(v:number[])=>v.slice(1).map((p,i)=>p-v[i]!);
    const dx=gaps(colPositions),dy=gaps(rowPositions);
    if([...dx,...dy].some(d=>d<1.03||d>4))continue;
    if(groups.some(g=>span(g.map(p=>p.v))>Math.min(...dy)*.27))continue;
    if(colPositions.some((_,c)=>span(groups.map(g=>g[c]!.u))>Math.min(...dx)*.27))continue;
    return {faces:groups.flat().map(p=>p.face),columns};
  }
  return null;
}

export type DiagramResult={count:number;columns?:PhotoLayout;read?:PhotoRead};
export class DiagramScanner {
  private pending?:{key:string;since:number;last:number;count:number;anchor:ObservedFace[]};
  reset(){this.pending=undefined;}
  observe(o:CubeObservation):DiagramResult {
    const count=o.faces.filter(reliableFace).length,arranged=arrangeDiagram(o.faces);
    if(o.quality!=='good'||count!==6||!arranged){this.reset();return {count};}
    const key=`${o.transform.frameWidth}:${o.transform.frameHeight}:${arranged.columns}:`+arranged.faces.map(f=>f.colors.join(',')).join('|');
    const prior=this.pending;
    if(prior&&o.timestamp<=prior.last)return {count,columns:arranged.columns};
    const steady=prior&&arranged.faces.every((f,i)=>f.quad.every((p,j)=>distance(p,prior.anchor[i]!.quad[j]!)<distance(f.quad[0],f.quad[1])*.18));
    if(!prior||prior.key!==key||o.timestamp-prior.last>=800||!steady){
      this.pending={key,since:o.timestamp,last:o.timestamp,count:1,anchor:arranged.faces};
    }else{prior.last=o.timestamp;prior.count++;}
    const current=this.pending!;
    return {count,columns:arranged.columns,...(current.count>=4&&o.timestamp-current.since>=450?{read:{panels:arranged.faces.map(f=>reviewPanel([f])),processingMs:o.processingMs}}:{})};
  }
}

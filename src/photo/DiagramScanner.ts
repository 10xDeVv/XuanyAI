import {distance,projectOnQuad} from '../core/geometry';
import {reliableFace} from '../core/scanner';
import {CubeObservation,Face,ObservedFace,Point} from '../core/types';
import {FACE_NAMES,PANEL_LABELS,PhotoLayout,PhotoRead,reviewPanel,uprightFace} from './model';

const unit=(p:Point):Point=>{const n=Math.hypot(p.x,p.y);return {x:p.x/n,y:p.y/n};};
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const span=(values:number[])=>Math.max(...values)-Math.min(...values);
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const clearFace=(f:ObservedFace)=>reliableFace(f)&&(f.cells===undefined||f.cells===9);

type Panel={face:ObservedFace;u:number;v:number};
type Arrangement={faces:ObservedFace[];columns?:PhotoLayout;layout:'panels'|'net';labels:Face[]};
/** Spatial panel identity, never center-color identity. No OCR or fixed crops. */
function projectPanels(input:ObservedFace[]):Panel[]|null {
  if(input.length<5||input.length>6)return null;
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
  return faces.map(face=>{
    const c=projectOnQuad(face.quad,.5,.5);
    return {face,u:(c.x*y.y-c.y*y.x)/det/size,v:(x.x*c.y-x.y*c.x)/det/size};
  });
}

const NET: {label:Face;x:number;y:number}[]=[{label:'U',x:1,y:0},{label:'L',x:0,y:1},{label:'F',x:1,y:1},{label:'R',x:2,y:1},{label:'B',x:3,y:1},{label:'D',x:1,y:2}];
/** The upright U / L F R B / D net. Partial fits are hints, never inferred colors. */
function fitNet(panels:Panel[]):(Arrangement&{missing?:Face;error:number})|null {
  const fits:(Arrangement&{missing?:Face;error:number})[]=[];
  for(const absent of panels.length===6?[-1]:[0,1,2,3,4,5]){
    const expected=NET.filter((_,i)=>i!==absent),vertical=[...panels].sort((a,b)=>a.v-b.v),ordered:Panel[]=[];
    let offset=0;
    for(let row=0;row<3;row++){
      const n=expected.filter(p=>p.y===row).length;
      ordered.push(...vertical.slice(offset,offset+n).sort((a,b)=>a.u-b.u));offset+=n;
    }
    const fit=(axis:'x'|'y',observed:'u'|'v')=>{
      const a=expected.map(p=>p[axis]),b=ordered.map(p=>p[observed]),ma=mean(a),mb=mean(b);
      const slope=a.reduce((sum,v,i)=>sum+(v-ma)*(b[i]!-mb),0)/a.reduce((sum,v)=>sum+(v-ma)**2,0);
      return {slope,origin:mb-slope*ma};
    };
    const x=fit('x','u'),y=fit('y','v');
    if([x.slope,y.slope].some(d=>d<1.02||d>2.3))continue;
    const errors=ordered.map((p,i)=>Math.hypot(p.u-x.origin-x.slope*expected[i]!.x,p.v-y.origin-y.slope*expected[i]!.y));
    if(Math.max(...errors)>.23*Math.min(x.slope,y.slope))continue;
    fits.push({layout:'net',faces:ordered.map(p=>p.face),labels:expected.map(p=>p.label),error:mean(errors),...(absent>=0?{missing:NET[absent]!.label}:{})});
  }
  fits.sort((a,b)=>a.error-b.error);
  if(fits[1]&&fits[1].error-fits[0]!.error<.05)return null;
  return fits[0]??null;
}

export function arrangeDiagram(input:ObservedFace[]):Arrangement|null {
  if(input.length!==6)return null;
  const panels=projectPanels(input);if(!panels)return null;
  const net=fitNet(panels);if(net)return net;
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
    return {faces:groups.flat().map(p=>p.face),columns,layout:'panels',labels:[...PANEL_LABELS]};
  }
  return null;
}

export type DiagramResult={count:number;columns?:PhotoLayout;layout?:'panels'|'net';message?:string;read?:PhotoRead};
export class DiagramScanner {
  private pending?:{key:string;since:number;last:number;count:number;anchor:ObservedFace[]};
  reset(){this.pending=undefined;}
  observe(o:CubeObservation):DiagramResult {
    if(o.largerGrid){this.reset();return {count:0,message:'This picture has more than 3 squares per side. Use a 3 × 3 cube diagram.'};}
    const clear=o.faces.filter(clearFace);
    const count=clear.length,arranged=count===6?arrangeDiagram(clear):null;
    if(o.quality!=='good'||count!==6||!arranged){
      const outlined=arrangeDiagram(o.faces);
      if(outlined?.layout==='net'){
        const unclear=outlined.faces.flatMap((f,i)=>clearFace(f)?[]:[FACE_NAMES[outlined.labels[i]!]]);
        if(unclear.length){this.reset();return {count,layout:'net',message:`Unfolded cube found. Show ${unclear.join(' and ')} more clearly; all nine squares of each face must be visible.`};}
      }
      this.reset();const panels=count===5?projectPanels(clear):null,partial=panels?fitNet(panels):null;
      return {count,...(partial?.missing?{layout:'net' as const,message:`Unfolded cube found. Show the whole ${FACE_NAMES[partial.missing]} face more clearly; all nine squares must be visible.`}:{})};
    }
    const key=`${o.transform.frameWidth}:${o.transform.frameHeight}:${arranged.layout}:${arranged.columns}:`+arranged.faces.map(f=>f.colors.join(',')).join('|');
    const prior=this.pending;
    if(prior&&o.timestamp<=prior.last)return {count,columns:arranged.columns,layout:arranged.layout};
    const steady=prior&&arranged.faces.every((f,i)=>f.quad.every((p,j)=>distance(p,prior.anchor[i]!.quad[j]!)<distance(f.quad[0],f.quad[1])*.18));
    if(!prior||prior.key!==key||o.timestamp-prior.last>=800||!steady){
      this.pending={key,since:o.timestamp,last:o.timestamp,count:1,anchor:arranged.faces};
    }else{prior.last=o.timestamp;prior.count++;}
    const current=this.pending!;
    return {count,columns:arranged.columns,layout:arranged.layout,...(current.count>=4&&o.timestamp-current.since>=450?{read:{panels:arranged.faces.map(f=>reviewPanel([f])),processingMs:o.processingMs,labels:arranged.labels,layout:arranged.layout}}:{})};
  }
}

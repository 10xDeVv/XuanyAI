import {distance,projectOnQuad} from '../core/geometry';
import {CubeObservation,Face,ObservedFace,Point} from '../core/types';
import {assemblePhoto,clearDiagramFace,FACE_NAMES,PANEL_LABELS,PhotoLayout,PhotoRead,reviewPanel,uprightFace} from './model';

const unit=(p:Point):Point=>{const n=Math.hypot(p.x,p.y);return {x:p.x/n,y:p.y/n};};
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const span=(values:number[])=>Math.max(...values)-Math.min(...values);
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const clearFace=clearDiagramFace;

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
  const widths=faces.map(f=>distance(f.quad[0],f.quad[1])),heights=faces.map(f=>distance(f.quad[0],f.quad[3]));
  const sizes=widths.map((w,i)=>(w+heights[i]!)/2),width=mean(widths),height=mean(heights);
  if(Math.min(...sizes)<Math.max(...sizes)*.55)return null;
  return faces.map(face=>{
    const c=projectOnQuad(face.quad,.5,.5);
    return {face,u:(c.x*y.y-c.y*y.x)/det/width,v:(x.x*c.y-x.y*c.x)/det/height};
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
    // Joined nets have exactly one face-width between neighboring centers.
    if([x.slope,y.slope].some(d=>d<.96||d>2.3))continue;
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

export type DiagramResult={count:number;confirmations?:number;columns?:PhotoLayout;layout?:'panels'|'net';message?:string;read?:PhotoRead};
const confirming='Picture found. Hold steady while we check all six faces.';
const near=(face:ObservedFace,anchor:ObservedFace)=>face.quad.every((p,j)=>distance(p,anchor.quad[j]!)<distance(anchor.quad[0],anchor.quad[1])*.18);
const sameColors=(face:ObservedFace,anchor:ObservedFace)=>face.colors.every((c,i)=>c===anchor.colors[i]);
type Candidate={key:string;frame:string;since:number;lastComplete:number;count:number;arrangement:Arrangement;enhanced:boolean};
/** Partial views may preserve a complete candidate, but never add confirmation evidence. */
function compatiblePartial(faces:ObservedFace[],candidate:Candidate):boolean {
  if(faces.length<4||faces.length>5)return false;
  const matched=new Set<number>();
  for(const raw of faces){
    const face=uprightFace(raw),matches=candidate.arrangement.faces.flatMap((anchor,i)=>near(face,anchor)?[i]:[]);
    if(matches.length!==1||matched.has(matches[0]!)||!sameColors(face,candidate.arrangement.faces[matches[0]!]!))return false;
    matched.add(matches[0]!);
  }
  return true;
}
export class DiagramScanner {
  private pending?:Candidate;
  private lastObserved=-Infinity;
  private lastResult:DiagramResult={count:0};
  reset(){this.pending=undefined;this.lastObserved=-Infinity;this.lastResult={count:0};}
  observe(o:CubeObservation):DiagramResult {
    if(o.timestamp<=this.lastObserved)return {...this.lastResult,read:undefined};
    // Recovery performs bounded extra image passes. Its complete, identical
    // pictures can arrive slower than physical tracking frames.
    if(o.timestamp-this.lastObserved>=(o.enhanced||this.pending?.enhanced?2500:800))this.pending=undefined;
    this.lastObserved=o.timestamp;
    const result=this.observeFresh(o);this.lastResult=result;return result;
  }
  private observeFresh(o:CubeObservation):DiagramResult {
    if(o.largerGrid){this.pending=undefined;return {count:0,message:'This picture has more than 3 squares per side. Use a 3 × 3 cube diagram.'};}
    const clear=o.faces.filter(clearFace);
    const count=clear.length,arranged=count===6?arrangeDiagram(clear):null;
    if(o.enhanced&&arranged){
      const panels=arranged.faces.map(f=>reviewPanel([f]));
      if(!assemblePhoto(panels,arranged.labels,[0,0,0,0,0,0]).valid){
        this.pending=undefined;
        return {count,layout:arranged.layout,message:'The colors do not yet agree. Keep every square visible and move a little closer so we can check them again.'};
      }
    }
    const frame=`${o.transform.frameWidth}:${o.transform.frameHeight}:${o.transform.rotation}:${o.transform.mirrored}`;
    const prior=this.pending;
    // A held view cannot keep old evidence alive indefinitely. Only a fresh,
    // complete frame can confirm a candidate or extend the dropout deadline.
    const recovering=o.enhanced||prior?.enhanced;
    if(prior&&(prior.frame!==frame||o.timestamp-prior.lastComplete>=(recovering?3000:1500)||o.timestamp-prior.since>(recovering?10000:5000)))this.pending=undefined;
    if(o.quality!=='good'||count!==6||!arranged){
      const held=this.pending;
      if(held&&o.quality==='good'&&compatiblePartial(clear,held))return {count,confirmations:held.count,columns:held.arrangement.columns,layout:held.arrangement.layout,message:confirming};
      this.pending=undefined;
      const outlined=arrangeDiagram(o.faces);
      if(outlined?.layout==='net'){
        const unclear=outlined.faces.flatMap((f,i)=>clearFace(f)?[]:[FACE_NAMES[outlined.labels[i]!]]);
        if(unclear.length)return {count,layout:'net',message:`Unfolded cube found. Show ${unclear.join(' and ')} more clearly; all nine squares of each face must be visible.`};
      }
      const panels=count===5?projectPanels(clear):null,partial=panels?fitNet(panels):null;
      return {count,...(partial?.missing?{layout:'net' as const,message:`Unfolded cube found. Show the whole ${FACE_NAMES[partial.missing]} face more clearly; all nine squares must be visible.`}:{})};
    }
    const key=`${frame}:${arranged.layout}:${arranged.columns}:`+arranged.faces.map(f=>f.colors.join(',')).join('|');
    const candidate=this.pending;
    const steady=candidate&&arranged.faces.every((f,i)=>near(f,candidate.arrangement.faces[i]!));
    if(!candidate||candidate.key!==key||!steady){
      this.pending={key,frame,since:o.timestamp,lastComplete:o.timestamp,count:1,arrangement:arranged,enhanced:!!o.enhanced};
    }else{candidate.lastComplete=o.timestamp;candidate.count=Math.min(4,candidate.count+1);candidate.enhanced ||= !!o.enhanced;}
    const current=this.pending!;
    return {count,confirmations:current.count,message:confirming,columns:arranged.columns,layout:arranged.layout,...(current.count>=4&&o.timestamp-current.since>=450?{read:{panels:arranged.faces.map(f=>reviewPanel([f])),processingMs:o.processingMs,labels:arranged.labels,layout:arranged.layout}}:{})};
  }
}

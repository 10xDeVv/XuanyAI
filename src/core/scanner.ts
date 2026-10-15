import { CubeColor, CubeObservation, CubeState, FaceGrid, ObservedFace } from './types';
import { rotateGrid, rotationsMatching } from './cube';
import {assembleScan,AssemblyInput,CornerConstraint,EdgeConstraint,ScanAssembly} from './assembleScan';
import { sharedEdge } from './geometry';
import { physicalFrameGapMs } from './timing';
import { FaceEvidence } from './faceEvidence';

type StoredFace={grid:FaceGrid<CubeColor>;quality:number;confirmedAt:number};
export type ScanProgress={captured:CubeColor[];rechecking:CubeColor[];phase:'capturing'|'checking'|'connecting'|'rechecking'|'ready';message:string;state?:CubeState;invalidated?:boolean};
const signature=(g:readonly CubeColor[])=>[0,1,2,3].map(r=>rotateGrid(g,r).join(',')).sort()[0]!;
const canonical=(g:FaceGrid<CubeColor>)=>[0,1,2,3].map(r=>rotateGrid(g,r)).sort((a,b)=>a.join(',').localeCompare(b.join(',')))[0]!;
export const reliableFace=(f:ObservedFace)=>f.confidence.every(c=>c>=0.65)&&f.glare<0.22&&f.sharpness>=18;

export class CubeScanner {
  private evidence=new FaceEvidence();
  private faces=new Map<CubeColor,StoredFace>();
  private pending=new Map<CubeColor,{signature:string;count:number;since:number;last:number;processingMs:number}>();
  private edges:EdgeConstraint[]=[];
  private corners:CornerConstraint[]=[];
  private pendingEdges=new Map<string,{count:number;since:number;last:number;processingMs:number}>();
  private reacquired=new Set<CubeColor>();
  private uncertain=new Set<CubeColor>();
  private rechecking=new Set<CubeColor>();
  private changedSince:number|undefined;
  private assemblyKey='';
  private assembledState:CubeState|undefined;
  private assemblyPending=false;
  private request=0;
  private lastTimestamp=-Infinity;
  private revision=0;
  constructor(private background?:{assemble:(input:AssemblyInput)=>Promise<ScanAssembly>;complete:(result:ScanProgress)=>void;error:(error:unknown)=>void}){}
  reset() {this.request++;this.assemblyPending=false;this.evidence.reset();this.faces.clear();this.pending.clear();this.edges=[];this.corners=[];this.pendingEdges.clear();this.reacquired.clear();this.uncertain.clear();this.rechecking.clear();this.changedSince=undefined;this.assemblyKey='';this.assembledState=undefined;this.lastTimestamp=-Infinity;this.revision++;}
  private progress(message:string,extra:Partial<ScanProgress>={}):ScanProgress {
    const rechecking=[...new Set([...this.uncertain,...this.rechecking])];
    const phase=extra.state?'ready':rechecking.length?'rechecking':this.faces.size<6?'capturing':this.assemblyPending?'checking':'connecting';
    if(phase==='checking')message='All six faces are saved. Matching the pieces to build your cube…';
    if(phase==='connecting'){
      const connections=(c:CubeColor)=>this.edges.filter(e=>e.a===c||e.b===c).length;
      const center=[...this.faces.keys()].sort((a,b)=>connections(a)-connections(b))[0]!;
      message=this.corners.length?`All six faces are saved. Show the ${center} center with a neighboring side visible, then pause. Keep the layers still.`
        :`All six faces are saved. Tilt the cube to show three sides meeting at a corner, including the ${center} center. Keep the layers still and pause.`;
    }
    if(phase==='rechecking')message=`Your saved faces are kept. Show the ${rechecking[0]} center and pause so I can check its colors.`;
    return {captured:[...this.faces.keys()],rechecking,phase,message,...extra};
  }
  private completed(assembled:ScanAssembly):ScanProgress {
    this.assemblyPending=false;this.assembledState=assembled.state;
    if(assembled.state)return this.progress('Cube captured.',{state:assembled.state});
    if(assembled.invalid)return this.progress(this.reacquire([...this.faces.keys()]));
    return this.progress('');
  }
  observe(o:CubeObservation):ScanProgress {
    const result=(message:string,extra:Partial<ScanProgress>={})=>this.progress(message,extra);
    if(o.timestamp<=this.lastTimestamp) return result('Rotate the whole cube slowly.');
    this.lastTimestamp=o.timestamp;
    const measured=this.evidence.observe(o);
    if(o.quality==='blur') {this.pending.clear();this.pendingEdges.clear();return result('Pause for a moment so I can see the squares.');}
    if(o.quality==='glare') {this.pending.clear();this.pendingEdges.clear();return result('Tilt the cube away from the light.');}
    // Duplicate center labels are color ambiguity, not two independent views.
    const visible=measured.filter(f=>reliableFace(f)&&o.faces.filter(other=>other.colors[4]===f.colors[4]).length===1);
    for(const c of this.pending.keys())if(!visible.some(f=>f.colors[4]===c))this.pending.delete(c);
    if(!visible.length) {
      this.pendingEdges.clear();
      if(o.faces.some(f=>f.glare>=.22))return result('Tilt the cube away from the light so the colors are clear.');
      if(o.faces.some(f=>f.sharpness<18))return result('Hold still a little farther from the camera so the squares can focus.');
      if(o.faces.length||o.diagnostics?.grids)return result('The colors aren’t clear yet. Try even light or switch to the back camera.');
      return result('Show one complete 3 × 3 face first. Keep fingers off the squares and pause.');
    }
    let invalidated=false;
    for(const face of visible) {
      const center=face.colors[4],sig=signature(face.colors);
      const old=this.pending.get(center);
      const p=old?.signature===sig&&o.timestamp-old.last<physicalFrameGapMs(o.processingMs,old.processingMs)?{...old,count:old.count+1,last:o.timestamp,processingMs:o.processingMs}:{signature:sig,count:1,since:o.timestamp,last:o.timestamp,processingMs:o.processingMs};
      this.pending.set(center,p);
      const stored=this.faces.get(center);
      const matches=stored&&rotationsMatching(face.colors,stored.grid).length>0;
      // Keep the saved view while checking a conflicting reading. Never solve
      // through an unresolved conflict, even if that face leaves the camera.
      if(stored&&!matches){this.uncertain.add(center);this.assemblyKey='';this.assembledState=undefined;}
      if(p.count<3 || o.timestamp-p.since<220) continue;
      if(stored&&!matches) {
        // A short run of misclassified colors used to erase the entire scan.
        // Require stronger evidence before replacing just this face. A real
        // twist may affect other saved faces, so require fresh checks of those
        // older views before assembling, without discarding their capture.
        if(p.count<6||o.timestamp-p.since<900)continue;
        // A later contradiction may be a second physical turn. Do not reuse
        // checks that predate this pattern just because another check is open.
        this.changedSince=Math.max(this.changedSince??-Infinity,p.since);
        for(const [color,saved] of this.faces)if(color!==center&&saved.confirmedAt<this.changedSince)this.rechecking.add(color);
        this.faces.set(center,{grid:canonical(face.colors),quality:Math.min(...face.confidence),confirmedAt:o.timestamp});
        this.uncertain.delete(center);this.rechecking.delete(center);
        this.edges=this.edges.filter(e=>e.a!==center&&e.b!==center);this.pendingEdges.clear();
        this.corners=this.corners.filter(c=>![c.a,c.b,c.c].includes(center));
        this.assemblyKey='';this.assembledState=undefined;this.revision++;invalidated=true;
      } else if(stored) {
        stored.confirmedAt=o.timestamp;
        this.uncertain.delete(center);
        if(this.changedSince===undefined||p.since>=this.changedSince)this.rechecking.delete(center);
      } else {
        this.faces.set(center,{grid:canonical(face.colors),quality:Math.min(...face.confidence),confirmedAt:o.timestamp});
      }
    }
    const visibleEdges=new Set<string>();
    for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
      const [a,b]=[visible[i]!,visible[j]!].sort((a,b)=>a.colors[4].localeCompare(b.colors[4])) as [ObservedFace,ObservedFace];
      const ca=a.colors[4],cb=b.colors[4];
      const sa=this.faces.get(ca),sb=this.faces.get(cb),edges=sharedEdge(a.quad,b.quad);
      if(ca===cb || !edges) continue;
      const aEdges=rotationsMatching(a.colors,sa?.grid??canonical(a.colors)).map(r=>(edges[0]+r)%4).sort();
      const bEdges=rotationsMatching(b.colors,sb?.grid??canonical(b.colors)).map(r=>(edges[1]+r)%4).sort();
      if(!aEdges.length || !bEdges.length) continue;
      const c={a:ca,b:cb,aEdges,bEdges};
      const key=JSON.stringify(c),old=this.pendingEdges.get(key);visibleEdges.add(key);
      const p=old&&o.timestamp-old.last<physicalFrameGapMs(o.processingMs,old.processingMs)?{...old,count:old.count+1,last:o.timestamp,processingMs:o.processingMs}:{count:1,since:o.timestamp,last:o.timestamp,processingMs:o.processingMs};
      this.pendingEdges.set(key,p);
      if(sa&&sb&&p.count>=3&&o.timestamp-p.since>=220&&!this.edges.some(e=>JSON.stringify(e)===key))this.edges.push(c);
    }
    if(visible.length===3&&visible.every(f=>{const saved=this.faces.get(f.colors[4]);return saved&&rotationsMatching(f.colors,saved.grid).length>0;})){
      const [a,b,c]=[...visible].sort((x,y)=>x.colors[4].localeCompare(y.colors[4])) as [ObservedFace,ObservedFace,ObservedFace];
      const ab=sharedEdge(a.quad,b.quad),ac=sharedEdge(a.quad,c.quad),bc=sharedEdge(b.quad,c.quad);
      if(ab&&ac&&bc){
        const delta=(ac[0]-ab[0]+4)%4;
        if(delta===1||delta===3){
          const corner={a:a.colors[4],b:b.colors[4],c:c.colors[4],delta},key=JSON.stringify(corner),old=this.pendingEdges.get(key);
          visibleEdges.add(key);
          const p=old&&o.timestamp-old.last<physicalFrameGapMs(o.processingMs,old.processingMs)?{...old,count:old.count+1,last:o.timestamp,processingMs:o.processingMs}:{count:1,since:o.timestamp,last:o.timestamp,processingMs:o.processingMs};
          this.pendingEdges.set(key,p);
          if(p.count>=3&&o.timestamp-p.since>=220&&!this.corners.some(c=>JSON.stringify(c)===key))this.corners.push(corner);
        }
      }
    }
    for(const key of this.pendingEdges.keys())if(!visibleEdges.has(key))this.pendingEdges.delete(key);
    const check=[...this.uncertain,...this.rechecking][0];
    if(check)return result(`Your saved faces are kept. Show the ${check} center and pause so I can check its colors.`,{invalidated});
    this.changedSince=undefined;
    if(this.faces.size<6) {
      const unsaved=visible.find(f=>!this.faces.has(f.colors[4]));
      if(unsaved)return result(`Hold the ${unsaved.colors[4]} face still until it is saved.`);
      return result(this.faces.size?'Face saved. Slowly roll the whole cube to an unchecked center, then pause.':'Face found. Hold still for a moment to capture it.');
    }
    const counts=new Map<CubeColor,number>();
    for(const f of this.faces.values())for(const c of f.grid)counts.set(c,(counts.get(c)??0)+1);
    if([...counts.values()].some(n=>n!==9)||counts.size!==6){
      // A conflicting color count cannot be fixed by rotating the assembled state.
      // Reacquire the least confident face containing an overrepresented color.
      return result(this.reacquire([...this.faces].filter(([,f])=>f.grid.some(c=>(counts.get(c)??0)>9)).map(([c])=>c)));
    }
    const key=JSON.stringify([[...this.faces].map(([color,face])=>[color,face.grid]),this.edges,this.corners]);
    if(this.assemblyPending)return result('');
    if(key===this.assemblyKey)return this.assembledState?result('Cube captured.',{state:this.assembledState}):result('Tilt the cube to show two neighboring faces together.');
    this.assemblyKey=key;
    const input:AssemblyInput={grids:[...this.faces].map(([c,f])=>[c,f.grid]),edges:[...this.edges],corners:[...this.corners],revision:this.revision};
    if(this.background){
      const request=++this.request;this.assemblyPending=true;
      void this.background.assemble(input).then(assembled=>{
        if(request!==this.request)return;
        this.assemblyPending=false;
        const currentKey=JSON.stringify([[...this.faces].map(([color,face])=>[color,face.grid]),this.edges,this.corners]);
        if(key!==this.assemblyKey||key!==currentKey||this.uncertain.size||this.rechecking.size){this.assemblyKey='';return;}
        this.background!.complete(this.completed(assembled));
      },error=>{
        if(request!==this.request)return;
        this.assemblyPending=false;
        if(key===this.assemblyKey)this.background!.error(error);
      });
      return result('');
    }
    return this.completed(assembleScan(new Map(input.grids),input.edges,input.revision,input.corners));
  }
  private reacquire(candidates:CubeColor[]):string {
    let available=candidates.filter(c=>!this.reacquired.has(c));
    if(!available.length){this.reacquired.clear();available=candidates;}
    const suspect=available.sort((a,b)=>this.faces.get(a)!.quality-this.faces.get(b)!.quality)[0];
    if(!suspect)return 'Show two neighboring faces together so I can check the saved views.';
    this.reacquired.add(suspect);this.faces.delete(suspect);this.pending.delete(suspect);this.pendingEdges.clear();
    this.edges=this.edges.filter(e=>e.a!==suspect&&e.b!==suspect);this.assemblyKey='';this.assembledState=undefined;
    this.corners=this.corners.filter(c=>![c.a,c.b,c.c].includes(suspect));
    return `Show the ${suspect} center again. One view didn’t agree.`;
  }
}

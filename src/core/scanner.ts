import { CubeColor, CubeObservation, CubeState, FACES, Face, FaceGrid, CenterMap, ObservedFace } from './types';
import { edgeToward, rotateGrid, rotationsMatching, validateCube } from './cube';
import { sharedEdge } from './geometry';
import { physicalFrameGapMs } from './timing';

type StoredFace={grid:FaceGrid<CubeColor>;quality:number;confirmedAt:number};
type EdgeConstraint={a:CubeColor;b:CubeColor;aEdges:number[];bEdges:number[]};
export type ScanProgress={captured:CubeColor[];rechecking:CubeColor[];message:string;state?:CubeState;invalidated?:boolean};
const signature=(g:readonly CubeColor[])=>[0,1,2,3].map(r=>rotateGrid(g,r).join(',')).sort()[0]!;
const canonical=(g:FaceGrid<CubeColor>)=>[0,1,2,3].map(r=>rotateGrid(g,r)).sort((a,b)=>a.join(',').localeCompare(b.join(',')))[0]!;
export const reliableFace=(f:ObservedFace)=>f.confidence.every(c=>c>=0.65)&&f.glare<0.22&&f.sharpness>=18;
function permutations<T>(items:T[]):T[][] {
  if(!items.length) return [[]];
  return items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest]));
}

export class CubeScanner {
  private faces=new Map<CubeColor,StoredFace>();
  private pending=new Map<CubeColor,{signature:string;count:number;since:number;last:number;processingMs:number}>();
  private edges:EdgeConstraint[]=[];
  private pendingEdges=new Map<string,{count:number;since:number;last:number;processingMs:number}>();
  private reacquired=new Set<CubeColor>();
  private uncertain=new Set<CubeColor>();
  private rechecking=new Set<CubeColor>();
  private changedSince:number|undefined;
  private assemblyKey='';
  private assembledState:CubeState|undefined;
  private lastTimestamp=-Infinity;
  private revision=0;
  reset() {this.faces.clear();this.pending.clear();this.edges=[];this.pendingEdges.clear();this.reacquired.clear();this.uncertain.clear();this.rechecking.clear();this.changedSince=undefined;this.assemblyKey='';this.assembledState=undefined;this.lastTimestamp=-Infinity;this.revision++;}
  observe(o:CubeObservation):ScanProgress {
    const result=(message:string,extra:Partial<ScanProgress>={}):ScanProgress=>({captured:[...this.faces.keys()],rechecking:[...new Set([...this.uncertain,...this.rechecking])],message,...extra});
    if(o.timestamp<=this.lastTimestamp) return result('Rotate the whole cube slowly.');
    this.lastTimestamp=o.timestamp;
    if(o.quality==='blur') {this.pending.clear();this.pendingEdges.clear();return result('Pause for a moment so I can see the squares.');}
    if(o.quality==='glare') {this.pending.clear();this.pendingEdges.clear();return result('Tilt the cube away from the light.');}
    // Duplicate center labels are color ambiguity, not two independent views.
    const visible=o.faces.filter(f=>reliableFace(f)&&o.faces.filter(other=>other.colors[4]===f.colors[4]).length===1);
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
      if(stored&&!matches)this.uncertain.add(center);
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
    for(const key of this.pendingEdges.keys())if(!visibleEdges.has(key))this.pendingEdges.delete(key);
    const check=[...this.uncertain,...this.rechecking][0];
    if(check)return result(`Your saved faces are kept. Show the ${check} center and pause so I can check its colors.`,{invalidated});
    this.changedSince=undefined;
    if(this.faces.size<6) return result(this.faces.size?'Face saved. Turn the whole cube a little, then pause with two sides visible.':'Face found. Hold still for a moment to capture it.');
    const counts=new Map<CubeColor,number>();
    for(const f of this.faces.values())for(const c of f.grid)counts.set(c,(counts.get(c)??0)+1);
    if([...counts.values()].some(n=>n!==9)||counts.size!==6){
      // A conflicting color count cannot be fixed by rotating the assembled state.
      // Reacquire the least confident face containing an overrepresented color.
      return result(this.reacquire([...this.faces].filter(([,f])=>f.grid.some(c=>(counts.get(c)??0)>9)).map(([c])=>c)));
    }
    const key=JSON.stringify([[...this.faces].map(([color,face])=>[color,face.grid]),this.edges]);
    if(key===this.assemblyKey)return this.assembledState?result('Cube captured.',{state:this.assembledState}):result('Tilt the cube to show two neighboring faces together.');
    this.assemblyKey=key;
    const assembled=this.assemble();
    this.assembledState=assembled.state;
    if(assembled.state) return result('Cube captured.',{state:assembled.state});
    if(assembled.invalid)return result(this.reacquire([...this.faces.keys()]));
    return result('Tilt the cube to show two neighboring faces together.');
  }
  private reacquire(candidates:CubeColor[]):string {
    let available=candidates.filter(c=>!this.reacquired.has(c));
    if(!available.length){this.reacquired.clear();available=candidates;}
    const suspect=available.sort((a,b)=>this.faces.get(a)!.quality-this.faces.get(b)!.quality)[0];
    if(!suspect)return 'Show two neighboring faces together so I can check the saved views.';
    this.reacquired.add(suspect);this.faces.delete(suspect);this.pending.delete(suspect);this.pendingEdges.clear();
    this.edges=this.edges.filter(e=>e.a!==suspect&&e.b!==suspect);this.assemblyKey='';this.assembledState=undefined;
    return `Show the ${suspect} center again. One view didn’t agree.`;
  }
  private assemble():{state?:CubeState;invalid?:boolean} {
    const first=this.edges[0];
    if(!first) return {};
    const remaining=[...this.faces.keys()].filter(c=>c!==first.a&&c!==first.b);
    const states=new Map<string,CubeState>();
    // The first observed adjacent centers define an internal U/F reference. No physical orientation is prescribed.
    for(const other of permutations(remaining)) {
      const centers:CenterMap={U:first.a,F:first.b,R:other[0]!,D:other[1]!,L:other[2]!,B:other[3]!};
      const inverse=Object.fromEntries(FACES.map(f=>[centers[f],f])) as Record<CubeColor,Face>;
      const allowed=Object.fromEntries(FACES.map(f=>[f,[0,1,2,3]])) as Record<Face,number[]>;
      let valid=true;
      for(const e of this.edges) {
        const a=inverse[e.a],b=inverse[e.b],ea=edgeToward(a,b),eb=edgeToward(b,a);
        if(ea===null || eb===null) {valid=false;break;}
        allowed[a]=allowed[a].filter(r=>e.aEdges.some(i=>(i+r)%4===ea));
        allowed[b]=allowed[b].filter(r=>e.bEdges.some(i=>(i+r)%4===eb));
        if(!allowed[a].length || !allowed[b].length) {valid=false;break;}
      }
      if(!valid) continue;
      const build=(i:number,facelets:string)=>{
        if(states.size>1)return;
        if(i===6) { if(validateCube(facelets).valid) states.set(facelets,{facelets,centers,revision:this.revision}); return; }
        const f=FACES[i]!,grid=this.faces.get(centers[f])!.grid;
        const variants=new Set(allowed[f].map(r=>rotateGrid(grid,r).map(c=>inverse[c]).join('')));
        for(const variant of variants) build(i+1,facelets+variant);
      };
      build(0,'');
      if(states.size>1) return {};
    }
    return states.size===1?{state:[...states.values()][0]!}:{invalid:true};
  }
}

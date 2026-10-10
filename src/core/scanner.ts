import { CubeColor, CubeObservation, CubeState, FACES, Face, FaceGrid, CenterMap, ObservedFace } from './types';
import { edgeToward, rotateGrid, rotationsMatching, validateCube } from './cube';
import { sharedEdge } from './geometry';

type StoredFace={grid:FaceGrid<CubeColor>;quality:number};
type EdgeConstraint={a:CubeColor;b:CubeColor;aEdges:number[];bEdges:number[]};
export type ScanProgress={captured:CubeColor[];message:string;state?:CubeState;invalidated?:boolean};
const signature=(g:readonly CubeColor[])=>[0,1,2,3].map(r=>rotateGrid(g,r).join(',')).sort()[0]!;
export const reliableFace=(f:ObservedFace)=>f.confidence.every(c=>c>=0.65)&&f.glare<0.22&&f.sharpness>=18;
function permutations<T>(items:T[]):T[][] {
  if(!items.length) return [[]];
  return items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest]));
}

export class CubeScanner {
  private faces=new Map<CubeColor,StoredFace>();
  private pending=new Map<CubeColor,{signature:string;count:number;since:number;last:number}>();
  private edges:EdgeConstraint[]=[];
  private lastTimestamp=-Infinity;
  private revision=0;
  reset() {this.faces.clear();this.pending.clear();this.edges=[];this.lastTimestamp=-Infinity;this.revision++;}
  observe(o:CubeObservation):ScanProgress {
    const result=(message:string,extra:Partial<ScanProgress>={}):ScanProgress=>({captured:[...this.faces.keys()],message,...extra});
    if(o.timestamp<=this.lastTimestamp) return result('Rotate the whole cube slowly.');
    this.lastTimestamp=o.timestamp;
    if(o.quality==='blur') {this.pending.clear();return result('Pause for a moment so I can see the squares.');}
    if(o.quality==='glare') {this.pending.clear();return result('Tilt the cube away from the light.');}
    const visible=o.faces.filter(reliableFace);
    for(const c of this.pending.keys())if(!visible.some(f=>f.colors[4]===c))this.pending.delete(c);
    if(!visible.length) return result('Bring the cube into view, with your fingers near its edges.');
    let invalidated=false;
    for(const face of visible) {
      const center=face.colors[4],sig=signature(face.colors);
      const old=this.pending.get(center);
      const p=old?.signature===sig&&o.timestamp-old.last<800?{...old,count:old.count+1,last:o.timestamp}:{signature:sig,count:1,since:o.timestamp,last:o.timestamp};
      this.pending.set(center,p);
      if(p.count<3 || o.timestamp-p.since<220) continue;
      const stored=this.faces.get(center);
      if(stored && !rotationsMatching(face.colors,stored.grid).length) {
        // A layer twist can alter several previously captured faces. Start a coherent capture again.
        this.reset(); this.lastTimestamp=o.timestamp; invalidated=true; break;
      }
      if(!stored) this.faces.set(center,{grid:face.colors,quality:Math.min(...face.confidence)});
    }
    if(invalidated) return result('The squares changed. Rotate the whole cube without twisting a layer.',{invalidated:true});
    for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
      const a=visible[i]!,b=visible[j]!,ca=a.colors[4],cb=b.colors[4];
      const sa=this.faces.get(ca),sb=this.faces.get(cb),edges=sharedEdge(a.quad,b.quad);
      if(ca===cb || !sa || !sb || !edges) continue;
      const aEdges=rotationsMatching(a.colors,sa.grid).map(r=>(edges[0]+r)%4);
      const bEdges=rotationsMatching(b.colors,sb.grid).map(r=>(edges[1]+r)%4);
      if(!aEdges.length || !bEdges.length) continue;
      const c={a:ca,b:cb,aEdges,bEdges};
      if(!this.edges.some(e=>JSON.stringify(e)===JSON.stringify(c))) this.edges.push(c);
    }
    if(this.faces.size<6) return result(`${this.faces.size} of 6 faces captured. Keep rotating the whole cube.`);
    const counts=new Map<CubeColor,number>();
    for(const f of this.faces.values())for(const c of f.grid)counts.set(c,(counts.get(c)??0)+1);
    if([...counts.values()].some(n=>n!==9)||counts.size!==6){
      // A conflicting color count cannot be fixed by rotating the assembled state.
      // Reacquire the least confident face containing an overrepresented color.
      const suspect=[...this.faces].filter(([,f])=>f.grid.some(c=>(counts.get(c)??0)>9)).sort((a,b)=>a[1].quality-b[1].quality)[0]?.[0];
      if(suspect){this.faces.delete(suspect);this.pending.delete(suspect);this.edges=this.edges.filter(e=>e.a!==suspect&&e.b!==suspect);return result(`Show the ${suspect} center again. One view didn’t agree.`);}
    }
    const assembled=this.assemble();
    if(assembled) return result('Cube captured.',{state:assembled});
    return result('Tilt the cube to show two neighboring faces together.');
  }
  private assemble():CubeState|null {
    const first=this.edges[0];
    if(!first) return null;
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
        if(i===6) { if(validateCube(facelets).valid) states.set(facelets,{facelets,centers,revision:this.revision}); return; }
        const f=FACES[i]!,grid=this.faces.get(centers[f])!.grid;
        const variants=new Set(allowed[f].map(r=>rotateGrid(grid,r).map(c=>inverse[c]).join('')));
        for(const variant of variants) build(i+1,facelets+variant);
      };
      build(0,'');
      if(states.size>1) return null;
    }
    return states.size===1?[...states.values()][0]!:null;
  }
}

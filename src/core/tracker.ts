import { CubeObservation, CubeState, Face, FacePose, FACES, TrackingResult, Move } from './types';
import { ALL_MOVES, edgeToward, rotationsMatching, stateAfter } from './cube';
import { reliableFace } from './scanner';
import { sharedEdge } from './geometry';

export function matchObservation(state:CubeState,o:CubeObservation):FacePose[]|null {
  const visible=o.faces.filter(reliableFace);
  if(!visible.length) return null;
  const poses:FacePose[]=[];
  for(const seen of visible) {
    const f=FACES.find(f=>state.centers[f]===seen.colors[4]);
    if(!f || poses.some(p=>p.face===f)) return null;
    const expected=[...state.facelets.slice(FACES.indexOf(f)*9,FACES.indexOf(f)*9+9)].map(c=>state.centers[c as Face]);
    const rotations=rotationsMatching(seen.colors,expected);
    if(!rotations.length) return null;
    poses.push({face:f,quad:seen.quad,rotations});
  }
  for(let i=0;i<poses.length;i++) for(let j=i+1;j<poses.length;j++) {
    const a=poses[i]!,b=poses[j]!,edges=sharedEdge(a.quad,b.quad);
    if(!edges) continue;
    const ea=edgeToward(a.face,b.face),eb=edgeToward(b.face,a.face);
    if(ea===null||eb===null) return null;
    a.rotations=a.rotations.filter(r=>(edges[0]+r)%4===ea);
    b.rotations=b.rotations.filter(r=>(edges[1]+r)%4===eb);
    if(!a.rotations.length||!b.rotations.length) return null;
  }
  return poses;
}

export class CubeTracker {
  private pending:{key:string;since:number;count:number;last:number}|null=null;
  private timestamp=-Infinity;
  private candidates:{state:CubeState;move?:Move}[]=[];
  private revision=-1;
  reset() {this.pending=null;this.timestamp=-Infinity;this.revision=-1;}
  observe(state:CubeState,o:CubeObservation):TrackingResult {
    const empty=(status:TrackingResult['status'],candidates=0):TrackingResult=>({status,poses:[],confidence:0,candidates});
    if(o.timestamp<=this.timestamp) return empty('settling');
    this.timestamp=o.timestamp;
    if(this.revision!==state.revision) {
      this.pending=null;this.revision=state.revision;
      this.candidates=[{state},...ALL_MOVES.map(move=>({move,state:stateAfter(state,move)}))];
    }
    if(o.quality!=='good') {this.pending=null;return empty('lost');}
    const matches=this.candidates.map(c=>({...c,poses:matchObservation(c.state,o)})).filter(c=>c.poses);
    if(matches.length!==1) {this.pending=null;return empty(matches.length?'ambiguous':'lost',matches.length);}
    const match=matches[0]!,key=match.move??'none';
    const p=this.pending?.key===key&&o.timestamp-this.pending.last<800?{...this.pending,count:this.pending.count+1,last:o.timestamp}:{key,count:1,since:o.timestamp,last:o.timestamp};
    this.pending=p;
    if(p.count<3 || o.timestamp-p.since<220) return {status:'settling',poses:match.poses!,confidence:0.5,candidates:1};
    if(!match.move) return {status:'unchanged',poses:match.poses!,confidence:1,candidates:1};
    this.pending=null;
    return {status:'move',poses:match.poses!,confidence:1,candidates:1,move:match.move,state:match.state};
  }
}

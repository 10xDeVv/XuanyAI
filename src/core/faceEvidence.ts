import {rotateGrid} from './cube';
import {distance} from './geometry';
import {physicalFrameGapMs} from './timing';
import {CubeColor,CubeObservation,FaceGrid,ObservedFace,Quad} from './types';

type Reading={face:ObservedFace;timestamp:number;processingMs:number};
const clear=(face:ObservedFace)=>face.glare<.22&&face.sharpness>=18&&(face.cells===undefined||face.cells===9);
/** Capture-only evidence. Never used to confirm a move or a solved cube.
 * Each square needs three measured high-confidence readings, including the
 * center. No color is inferred from counts, a saved face, or the solver. */
export class FaceEvidence {
  private windows=new Map<CubeColor,Reading[]>();
  reset(){this.windows.clear();}
  observe(o:CubeObservation):ObservedFace[]{
    for(const [color,window] of this.windows){
      const last=window[window.length-1]!;
      if(o.timestamp-last.timestamp>=physicalFrameGapMs(o.processingMs,last.processingMs))this.windows.delete(color);
    }
    if(o.quality==='blur'||o.quality==='glare'||o.quality==='occluded'){this.reset();return [];}
    return o.faces.map(face=>{
      const center=face.colors[4];
      if(!clear(face)||face.confidence[4]<.65||o.faces.filter(f=>f.colors[4]===center).length!==1){this.windows.delete(center);return face;}
      let history=this.windows.get(center)??[];
      // Align detector corner-order changes by geometry, not by whichever
      // color rotation would make an old view appear to match.
      if(history.length){
        const last=history[history.length-1]!.face;
        const edge=face.quad.reduce((sum,p,i)=>sum+distance(p,face.quad[(i+1)%4]!),0)/4;
        const errors=[0,1,2,3].map(r=>face.quad.reduce((sum,p,i)=>sum+distance(p,last.quad[(i+r)%4]!),0)/4);
        const rotation=errors.indexOf(Math.min(...errors));
        if(errors[rotation]!>edge*.18)history=[];
        else history=history.map(reading=>({...reading,face:{...reading.face,
          colors:rotateGrid(reading.face.colors,(4-rotation)%4),
          confidence:rotateGrid(reading.face.confidence,(4-rotation)%4),
          quad:reading.face.quad.map((_,i)=>reading.face.quad[(i+rotation)%4]!) as Quad}}));
      }
      // A confident contradiction may be a real layer twist. Throw away this
      // short evidence window rather than voting it away with earlier frames.
      if(history.some(r=>face.colors.some((c,i)=>face.confidence[i]!>=.65&&r.face.confidence[i]!>=.65&&c!==r.face.colors[i])))history=[];
      const window=[...history,{face,timestamp:o.timestamp,processingMs:o.processingMs}].slice(-6);
      this.windows.set(center,window);
      if(window.length<3||o.timestamp-window[0]!.timestamp<220)return face;
      const confidence=face.confidence.map((value,i)=>{
        const votes=window.filter(r=>r.face.confidence[i]!>=.65&&r.face.colors[i]===face.colors[i]);
        // The current label must agree even when its confidence dips. A
        // hidden/changing square cannot inherit a different historical color.
        return votes.length>=3?Math.max(value,Math.min(...votes.map(r=>r.face.confidence[i]!))):value;
      }) as FaceGrid<number>;
      return {...face,confidence};
    });
  }
}

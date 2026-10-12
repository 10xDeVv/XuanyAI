import {describe,expect,it} from 'vitest';
import {ALL_MOVES,applyMoves,BASIS,DEFAULT_CENTERS,inverseMove,moveFacelets,SOLVED} from '../src/core/cube';
import {cubeSurfaces,orbitView,panView,previewArrow,projectPoint,projectSurfaces,stateAtStep,viewForMove,zoomView} from '../src/core/cubePreview';
import {CubeState,Face,FACES,Move} from '../src/core/types';

const state:CubeState={facelets:applyMoves(SOLVED,['R','U',"F'",'L2','D','B2']),centers:DEFAULT_CENTERS,revision:7};
const stickers=(s:CubeState,move?:Move,t=0)=>cubeSurfaces(s,move,t).filter(p=>p.sticker!==undefined);
const near=(a:number[],b:number[])=>a.every((v,i)=>Math.abs(v-b[i]!)<1e-7);

describe('3D replica and solution states',()=>{
  it.each(ALL_MOVES)('animates %s to exactly the solver permutation, including every neighboring strip',move=>{
    const before=stickers(state),during=stickers(state,move,.5),after=stickers(state,move,1);
    const expected=stickers({...state,facelets:moveFacelets(state.facelets,move)});
    expect(after).toHaveLength(54);
    for(const surface of after){
      const destination=expected.filter(p=>near(p.center,surface.center)&&near(p.normal,surface.normal));
      expect(destination,`${move} sticker ${surface.sticker}`).toHaveLength(1);
      expect(surface.color).toBe(destination[0]!.color);
    }
    expect(new Set(after.map(p=>p.id)).size).toBe(54);
    expect(during.filter(p=>p.active)).toHaveLength(21);
    for(const p of during.filter(p=>!p.active))expect(p).toEqual({...before[p.sticker!]!,active:false});
    expect(during.some(p=>p.active&&!near(p.normal,before[p.sticker!]!.normal))).toBe(true);
  });
  it('uses the scanned center mapping instead of assuming a fixed cube color scheme',()=>{
    const custom:CubeState={...state,centers:{U:'blue',R:'yellow',F:'orange',D:'green',L:'white',B:'red'}};
    for(const surface of stickers(custom))expect(surface.color).toBe(custom.centers[custom.facelets[surface.sticker!] as Face]);
  });
  it('keeps step navigation exact, reversible, and bounded without mutating the scan',()=>{
    const moves:Move[]=['B',"R'",'D','F2','L',"U'"];
    for(const step of [0,1,2,3,6,4,2,0,6]){
      expect(stateAtStep(state,moves,step)).toEqual({...state,facelets:applyMoves(state.facelets,moves.slice(0,step)),revision:state.revision+step});
    }
    expect(stateAtStep(state,moves,-2)).toEqual(state);
    expect(stateAtStep(state,moves,999)).toEqual(stateAtStep(state,moves,moves.length));
    expect(stateAtStep(state,moves,NaN)).toEqual(state);
    const solution:Move[]=['R','U',"F'",'L2','D','B2'].reverse().map(m=>inverseMove(m as Move));
    expect(stateAtStep(state,solution,solution.length).facelets).toBe(SOLVED);
    expect(state.revision).toBe(7);
  });
  it('shows each target face, including Back and Down, with finite perspective geometry',()=>{
    for(const move of ALL_MOVES){
      const view=viewForMove(move),centerIndex=FACES.indexOf(move[0] as Face)*9+4;
      for(const progress of [0,.25,.5,.75,1]){
        const surfaces=projectSurfaces(cubeSurfaces(state,move,progress),view);
        expect(surfaces.some(s=>s.sticker===centerIndex)).toBe(true);
        expect(surfaces.every(s=>s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>0&&p.x<320&&p.y>0&&p.y<320))).toBe(true);
        expect(surfaces.map(p=>p.depth)).toEqual(surfaces.map(p=>p.depth).sort((a,b)=>a-b));
      }
      expect(previewArrow(move,view)).toHaveLength(37);
    }
  });
  it('orbits the view without changing any facelets and reverses the arrow for inverse moves',()=>{
    const geometry=cubeSurfaces(state);
    for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const pitch of [-.5,.5]){
      const visible=projectSurfaces(geometry,{yaw,pitch});expect(visible.length).toBeGreaterThan(0);
      expect(geometry).toEqual(cubeSurfaces(state));
    }
    const view=viewForMove('F'),normal=previewArrow('F',view),inverse=previewArrow("F'",view);
    expect(normal[0]).toEqual(inverse[0]);expect(normal[10]).not.toEqual(inverse[10]);
    expect(BASIS.F.n).toEqual([0,0,1]);
  });
  it('supports continuous drag, bounded zoom and pan, without changing cube state',()=>{
    const before=JSON.stringify(state),start=viewForMove('F');
    const dragged=orbitView(start,105,-63),panned=panView(dragged,25,19),zoomed=zoomView(panned,1.2);
    expect(projectPoint([1,1,1],dragged)).not.toEqual(projectPoint([1,1,1],start));
    const a=projectPoint([1,1,1],dragged),b=projectPoint([1,1,1],panned);
    expect(b.x-a.x).toBeCloseTo(25);expect(b.y-a.y).toBeCloseTo(19);
    expect(zoomed.zoom).toBeCloseTo(1.2);
    expect(projectSurfaces(cubeSurfaces(state,'F',.5),zoomed).every(s=>s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))).toBe(true);
    expect(Math.abs(orbitView(start,0,10000).pitch)).toBeLessThan(Math.PI/2);
    expect(zoomView(start,100).zoom).toBe(1.65);expect(zoomView(start,.0001).zoom).toBe(.65);
    expect(panView(start,10000,-10000)).toMatchObject({panX:90,panY:-90});
    expect(JSON.stringify(state)).toBe(before);
  });
});

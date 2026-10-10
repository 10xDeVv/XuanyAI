import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
import {arrangeDiagram,DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto,PANEL_LABELS} from '../src/photo/model';
import {applyMoves,SOLVED} from '../src/core/cube';
import {projectOnQuad,toPreview} from '../src/core/geometry';
import {CubeObservation,CubeState,Quad,SolverAdapter} from '../src/core/types';
import {Session} from '../src/session/Session';
import {state,seen,transform,projected} from './fixtures';
import {renderObservation} from './pixels';

const require=createRequire(import.meta.url);
const cube=state(applyMoves(SOLVED,['R','U',"F'",'L2','D','B2']));
export function diagramFrame(columns:2|3=3,source:CubeState=cube,perspective=false):CubeObservation {
  const width=columns===3?640:480,height=columns===3?480:640;
  const paper:Quad=perspective?[{x:42,y:20},{x:width-15,y:58},{x:width-48,y:height-15},{x:18,y:height-45}]:[{x:15,y:15},{x:width-15,y:15},{x:width-15,y:height-15},{x:15,y:height-15}];
  const rows=6/columns;
  const faces=PANEL_LABELS.map((face,i)=>{
    const x=i%columns,y=Math.floor(i/columns);
    return seen(source,face,0,[[.1,.15],[.86,.15],[.86,.85],[.1,.85]].map(([u,v])=>projectOnQuad(paper,(x+u!)/columns,(y+v!)/rows)) as Quad);
  });
  return {faces,timestamp:0,transform:{...transform,frameWidth:width,frameHeight:height},quality:'good',processingMs:1};
}
const adapter=():SolverAdapter=>({ready:async()=>{},solve:vi.fn(async s=>({revision:s.revision,moves:[]})),dispose(){}});
describe('live diagram capture',()=>{
  it.each([2,3] as const)('orders a tilted %i-column sheet independent of detector order and captures only after settling',columns=>{
    const o=diagramFrame(columns,cube,true);o.faces.reverse();
    expect(arrangeDiagram(o.faces)?.columns).toBe(columns);
    const scan=new DiagramScanner();
    for(const timestamp of [0,150,300])expect(scan.observe({...o,timestamp}).read).toBeUndefined();
    const read=scan.observe({...o,timestamp:450}).read!;
    expect(assemblePhoto(read.panels,PANEL_LABELS,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:cube.facelets}});
  });
  it('resets capture on major occlusion, color changes, blur, camera movement and frame gaps',()=>{
    const base=diagramFrame();
    const mutations=[
      {...base,faces:base.faces.slice(0,3)},
      {...base,quality:'blur' as const},
      diagramFrame(3,state(applyMoves(cube.facelets,['U']))),
      {...base,faces:base.faces.map(f=>({...f,quad:f.quad.map(p=>({x:p.x+40,y:p.y})) as Quad}))},
    ];
    for(const changed of mutations){
      const scan=new DiagramScanner();for(const timestamp of [0,150,300])scan.observe({...base,timestamp});
      expect(scan.observe({...changed,timestamp:450}).read).toBeUndefined();
      expect(scan.observe({...base,timestamp:600}).read).toBeUndefined();
    }
    const scan=new DiagramScanner();for(const timestamp of [0,150,300])scan.observe({...base,timestamp});
    expect(scan.observe({...base,timestamp:1200}).read).toBeUndefined();
    scan.reset();expect(scan.observe({...base,timestamp:1350}).read).toBeUndefined();
  });
  it('rejects non-panel geometry and keeps ordinary physical scanning working',()=>{
    expect(arrangeDiagram(projected(cube,['U','F','R'],0).faces)).toBeNull();
    const random=diagramFrame();random.faces[5]!.quad=random.faces[0]!.quad;
    expect(arrangeDiagram(random.faces)).toBeNull();
    const session=new Session(adapter());session.start();
    for(const timestamp of [0,150,300])session.observe({...projected(cube,['U','F','R'],timestamp)});
    expect(session.getSnapshot().stage).toBe('scanning');
    expect(session.getSnapshot().captured.length).toBe(3);session.dispose();
  });
  it('auto-detects a sheet without invoking the solver and captures duplicate centers for review',()=>{
    const solver=adapter(),session=new Session(solver),o=diagramFrame();
    o.faces[5]!.colors[4]=o.faces[0]!.colors[4];
    session.start();for(const timestamp of [0,150,300,450])session.observe({...o,timestamp});
    expect(session.getSnapshot().stage).toBe('picture');
    expect(session.getSnapshot().diagramCount).toBe(6);
    expect(solver.solve).not.toHaveBeenCalled();
    expect(assemblePhoto(session.getSnapshot().picture!.panels,PANEL_LABELS,[0,0,0,0,0,0]).valid).toBe(false);
    session.observe({...o,timestamp:600});expect(solver.solve).not.toHaveBeenCalled();session.dispose();
  });
  it('never uses a static solved sheet as physical solved or move confirmation',async()=>{
    const session=new Session(adapter()),solved=state(SOLVED);session.startFromPhoto(solved);await Promise.resolve();
    const o=diagramFrame(3,solved);
    for(const timestamp of [0,150,300,450,600,750])session.observe({...o,timestamp});
    expect(session.getSnapshot()).toMatchObject({stage:'verifying',movesDone:0,confirmedAt:0,poses:[]});session.dispose();
  });
  it('keeps all camera pixels and overlays inside a narrow preview',()=>{
    const t={...transform,previewWidth:360,previewHeight:380,fit:'contain' as const};
    expect(toPreview({x:0,y:0},t)).toEqual({x:0,y:55});
    expect(toPreview({x:640,y:480},t)).toEqual({x:360,y:325});
  });
});

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('live frame worker with compiled detector',()=>{
  it.each([2,3] as const)('reads a %i-column sheet through camera frame messages, including perspective',async columns=>{
    const engine=await require('../public/vision/cube-vision.js')(),messages:any[]=[];
    const self={location:{href:'https://local.test/vision.worker.js?v=test'},postMessage:(m:unknown)=>messages.push(m),onmessage:undefined as unknown as (e:{data:unknown})=>Promise<void>};
    runInNewContext(readFileSync('public/vision.worker.js','utf8'),{self,URL,performance,Uint8Array,importScripts:()=>{},createCubeVision:()=>engine});
    await self.onmessage({data:{type:'init'}});expect(messages.pop()).toEqual({type:'ready'});
    for(const perspective of [false,true]){
      const o=diagramFrame(columns,cube,perspective),pixels=renderObservation(o,{rounded:.22}),scan=new DiagramScanner();
      let result,last;
      for(let id=1;id<=4;id++){
        await self.onmessage({data:{type:'frame',id,width:o.transform.frameWidth,height:o.transform.frameHeight,timestamp:id*150,buffer:pixels.buffer}});
        const data=messages.pop();expect(data.type).toBe('observation');expect(data.id).toBe(id);expect(data.faces).toHaveLength(6);
        last=data;result=scan.observe({...o,...data});
      }
      expect(result!.read,JSON.stringify({perspective,result,faces:last.faces})).toBeDefined();
      expect(assemblePhoto(result!.read!.panels,PANEL_LABELS,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:cube.facelets}});
      // The same frame path must not fill in a missing/covered panel.
      const hidden=renderObservation({...o,faces:o.faces.slice(0,5)},{rounded:.22});
      await self.onmessage({data:{type:'frame',id:5,width:o.transform.frameWidth,height:o.transform.frameHeight,timestamp:750,buffer:hidden.buffer}});
      expect(scan.observe({...o,...messages.pop()}).read).toBeUndefined();
    }
  },30000);
});

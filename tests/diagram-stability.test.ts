import {describe,it,expect} from 'vitest';
import {DiagramScanner} from '../src/photo/DiagramScanner';
import {assemblePhoto} from '../src/photo/model';
import {Session} from '../src/session/Session';
import {CubeObservation,Quad} from '../src/core/types';
import {joinedExample,joinedNetFrame} from './net-fixtures';
import {netCube,netFrame} from './net-fixtures';
import {renderObservation} from './pixels';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';

const full=()=>joinedNetFrame();
const partial=(o:CubeObservation,hidden=4)=>({...o,faces:o.faces.filter((_,i)=>i!==hidden)});
const recolor=(o:CubeObservation,face=0)=>({...o,faces:o.faces.map((f,i)=>i===face?{...f,colors:f.colors.map((c,j)=>j===0?(c==='red'?'blue':'red'):c) as typeof f.colors}:f)});
const seed=(scan:DiagramScanner,o=full())=>{for(const timestamp of [0,150,300])scan.observe({...o,timestamp});};

describe('picture confirmation across detection dropouts',()=>{
  it('retains progress through alternating 6/5 and 6/4 views, only counting complete frames',()=>{
    const o=full(),scan=new DiagramScanner();
    for(const [i,timestamp] of [0,150,300,450,600,750,900].entries()){
      const frame=i%2?{...o,faces:o.faces.slice(0,i===3?4:5)}:o;
      const result=scan.observe({...frame,timestamp});
      expect(result.confirmations).toBe(Math.floor(i/2)+1);
      if(i<6)expect(result.read).toBeUndefined();
      else expect(assemblePhoto(result.read!.panels,result.read!.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:joinedExample.facelets}});
    }
  });
  it('retains a candidate when one face has low confidence or fewer measured regions',()=>{
    for(const field of ['confidence','cells']){
      const scan=new DiagramScanner(),o=full();seed(scan,o);
      const weak={...o,faces:o.faces.map((f,i)=>i?f:field==='cells'?{...f,cells:8}:{...f,confidence:f.confidence.map(()=>.4) as typeof f.confidence})};
      expect(scan.observe({...weak,timestamp:450})).toMatchObject({count:5,confirmations:3});
      expect(scan.observe({...o,timestamp:600}).read).toBeDefined();
    }
  });
  it('does not capture from partial views, even after four fast complete frames',()=>{
    const o=full(),scan=new DiagramScanner();
    for(const timestamp of [0,100,200,300])expect(scan.observe({...o,timestamp}).read).toBeUndefined();
    for(const timestamp of [450,600,750,900,1050,1200,1350,1500,1650,1800])expect(scan.observe({...partial(o),timestamp}).read).toBeUndefined();
    expect(scan.observe({...o,timestamp:1950}).confirmations).toBe(1);
  });
  it('expires repeated partial views relative to the last complete observation',()=>{
    const o=full(),scan=new DiagramScanner();seed(scan,o);
    for(const timestamp of [450,600,750,900,1050,1200,1350,1500,1650])expect(scan.observe({...partial(o),timestamp}).confirmations).toBe(3);
    expect(scan.observe({...partial(o),timestamp:1800}).confirmations).toBeUndefined();
    expect(scan.observe({...o,timestamp:1950}).confirmations).toBe(1);
  });
  it('allows alternating detections at two processed frames per second without requiring a fast device',()=>{
    const o=full(),scan=new DiagramScanner();let result;
    for(let i=0;i<7;i++){
      result=scan.observe({...i%2?partial(o):o,timestamp:i*500});
      expect(result.confirmations).toBe(Math.floor(i/2)+1);
      if(i<6)expect(result.read).toBeUndefined();
    }
    expect(result!.read).toBeDefined();
  });
  it('resets on a visible changed color, duplicate grid, substantial movement or frame transform change',()=>{
    const o=full(),p=partial(o);
    const changed=[
      recolor(p),
      {...p,faces:[...p.faces.slice(0,4),p.faces[0]!]},
      {...p,faces:p.faces.map(f=>({...f,quad:f.quad.map(v=>({x:v.x+60,y:v.y})) as Quad}))},
      {...p,transform:{...p.transform,frameWidth:1280}},
      {...p,transform:{...p.transform,mirrored:true}},
      {...p,faces:p.faces.slice(0,3)},
      {...p,quality:'blur' as const},
    ];
    for(const frame of changed){
      const scan=new DiagramScanner();seed(scan,o);
      expect(scan.observe({...frame,timestamp:450}).confirmations).toBeUndefined();
      expect(scan.observe({...o,timestamp:600}).read).toBeUndefined();
    }
  });
  it('requires a new full set of confirmations if a hidden face changed',()=>{
    const o=full(),scan=new DiagramScanner();seed(scan,o);
    expect(scan.observe({...partial(o,4),timestamp:450}).confirmations).toBe(3);
    const changed=recolor(o,4);
    for(const timestamp of [600,750,900])expect(scan.observe({...changed,timestamp}).read).toBeUndefined();
    expect(scan.observe({...changed,timestamp:1050}).read).toBeDefined();
  });
  it('ignores duplicate and late frames without counting them or resetting current evidence',()=>{
    const o=full(),scan=new DiagramScanner();seed(scan,o);
    for(const timestamp of [300,100,200,300])expect(scan.observe({...recolor(o),timestamp})).toMatchObject({confirmations:3,read:undefined});
    expect(scan.observe({...o,timestamp:450}).read).toBeDefined();
    expect(scan.observe({...o,timestamp:450}).read).toBeUndefined();
  });
  it('keeps session confirmation progress and instruction stable during brief dropouts',()=>{
    const session=new Session({ready:async()=>{},solve:async s=>({revision:s.revision,moves:[]}),dispose(){}}),o=full();
    session.start('diagram');
    let message='';
    for(const [i,timestamp] of [0,150,300,450,600,750].entries()){
      session.observe({...i%2?partial(o):o,timestamp});
      const view=session.getSnapshot();
      expect(view.diagramConfirmations).toBe(Math.floor(i/2)+1);
      if(i)expect(view.message).toBe(message);else message=view.message;
      expect(view.stage).toBe('scanning');
    }
    session.observe({...o,timestamp:900});expect(session.getSnapshot().stage).toBe('picture');
    session.suspend();expect(session.getSnapshot().diagramConfirmations).toBeUndefined();session.dispose();
  });
});

describe.skipIf(!existsSync('public/vision/cube-vision.wasm'))('dropouts through the compiled pixel detector',()=>{
  it('captures the joined net while an orange square repeatedly falls below color confidence',async()=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')(),o=full();
    const pixels=renderObservation(o,{rounded:.09,inset:.035,background:[17,17,17]}),weak=pixels.slice();
    // Keep sticker boundaries, but move Up's orange hue near the red/orange
    // boundary. The real sampler returns ~0.627 confidence (below 0.65).
    for(let y=15;y<165;y++)for(let x=170;x<320;x++){
      const i=(y*640+x)*4;if(weak[i]===241&&weak[i+1]===116)weak.set([255,51,0,255],i);
    }
    const scan=new DiagramScanner();let result;
    for(let i=0;i<7;i++){
      const bytes=i%2?weak:pixels,ptr=engine._malloc(bytes.length);
      try{engine.HEAPU8.set(bytes,ptr);result=scan.observe({...o,...JSON.parse(engine.detectRGBA(ptr,640,480,640*4)),timestamp:i*150});}finally{engine._free(ptr);}
      expect(result.count).toBe(i%2?5:6);expect(result.confirmations).toBe(Math.floor(i/2)+1);
      if(i<6)expect(result.read).toBeUndefined();
    }
    expect(assemblePhoto(result!.read!.panels,result!.read!.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:joinedExample.facelets}});
  },30000);
  it('captures the same state across six alternating full/covered-face sequences without stitching partial frames',async()=>{
    const engine=await createRequire(import.meta.url)('../public/vision/cube-vision.js')(),o=netFrame();
    const detect=(frame:CubeObservation)=>{
      const pixels=renderObservation(frame,{rounded:.18,background:[240,245,249],border:[195,202,212]}),ptr=engine._malloc(pixels.length);
      try{engine.HEAPU8.set(pixels,ptr);return {...frame,...JSON.parse(engine.detectRGBA(ptr,640,480,640*4))} as CubeObservation;}finally{engine._free(ptr);}
    };
    const complete=detect(o);
    for(let hidden=0;hidden<6;hidden++){
      const incomplete=detect(partial(o,hidden)),scan=new DiagramScanner();let result;
      for(let i=0;i<7;i++){
        result=scan.observe({...i%2?incomplete:complete,timestamp:i*150});
        expect(result.count).toBe(i%2?5:6);expect(result.confirmations).toBe(Math.floor(i/2)+1);
        if(i<6)expect(result.read).toBeUndefined();
      }
      expect(assemblePhoto(result!.read!.panels,result!.read!.labels!,[0,0,0,0,0,0])).toMatchObject({valid:true,state:{facelets:netCube.facelets}});
    }
  },30000);
});

import {applyMoves,SOLVED} from '../src/core/cube';
import {projectOnQuad} from '../src/core/geometry';
import {CubeObservation,Face,FACES,Quad} from '../src/core/types';
import {state,seen,transform} from './fixtures';

export const netCube=state(applyMoves(SOLVED,['R','U',"F'",'L2','D','B2']));
export const netSlots:{face:Face;x:number;y:number}[]=[{face:'U',x:1,y:0},{face:'L',x:0,y:1},{face:'F',x:1,y:1},{face:'R',x:2,y:1},{face:'B',x:3,y:1},{face:'D',x:1,y:2}];
export function netFrame(tilted=false):CubeObservation {
  const paper:Quad=tilted?[{x:20,y:12},{x:630,y:45},{x:602,y:468},{x:12,y:432}]:[{x:10,y:10},{x:630,y:10},{x:630,y:470},{x:10,y:470}];
  return {timestamp:0,transform,quality:'good',processingMs:1,faces:netSlots.map(s=>seen(netCube,s.face,0,[[.035,.09],[.925,.09],[.925,.98],[.035,.98]].map(([x,y])=>projectOnQuad(paper,(s.x+x!)/4,(s.y+y!)/3)) as Quad))};
}
// Independently transcribed colors from the reported touching-face example.
const exampleColors:Record<Face,string>={U:'YWOGWBYOB',L:'GOGROYOGR',F:'OWRBGOGGO',R:'YWWYRBWGW',B:'BRRRBYBOB',D:'WRGYYWYBR'};
const colorFaces:Record<string,Face>={W:'U',R:'R',G:'F',Y:'D',O:'L',B:'B'};
export const joinedExample=state(FACES.map(f=>[...exampleColors[f]].map(c=>colorFaces[c]).join('')).join(''));
export function joinedNetFrame(tilted=false):CubeObservation {
  const paper:Quad=tilted?[{x:30,y:25},{x:622,y:50},{x:603,y:456},{x:18,y:424}]:[{x:20,y:15},{x:620,y:15},{x:620,y:465},{x:20,y:465}];
  return {timestamp:0,transform,quality:'good',processingMs:1,faces:netSlots.map(s=>seen(joinedExample,s.face,0,[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>projectOnQuad(paper,(s.x+x!)/4,(s.y+y!)/3)) as Quad))};
}
/** An actual 4x4 pixel lattice to ensure its 3x3 windows are never solved. */
export function fourByFourNetPixels():Uint8Array {
  const bytes=new Uint8Array(640*480*4),palette=[[232,233,223],[214,33,37],[25,171,67],[245,218,25],[241,116,24],[25,78,205]];
  for(let i=0;i<bytes.length;i+=4)bytes.set([232,241,252,255],i);
  const rect=(x:number,y:number,w:number,h:number,rgb:number[])=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)bytes.set([...rgb,255],(row*640+col)*4);};
  netSlots.forEach((s,n)=>{
    const x=10+s.x*156,y=8+s.y*154;rect(x,y,140,140,[0,0,0]);
    for(let row=0;row<4;row++)for(let col=0;col<4;col++)rect(x+5+col*33,y+5+row*33,30,30,palette[(row*4+col+n*3)%6]!);
  });
  return bytes;
}

// Pixel-level fixtures exercise the compiled production detector. These are
// synthetic geometry tests, not substitutes for the physical acceptance set.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const create=require('../public/vision/cube-vision.js');
const engine=await create();
const width=640,height=480,size=width*height*4,ptr=engine._malloc(size);
const palette={white:[232,233,223],red:[214,33,37],green:[25,171,67],yellow:[245,218,25],orange:[241,116,24],blue:[25,78,205]};
const grid=['white','red','blue','green','orange','yellow','blue','white','red'];
const frames=[];
const point=(q,u,v)=>{
  const [p0,p1,p2,p3]=q,dx=p0[0]-p1[0]+p2[0]-p3[0],dy=p0[1]-p1[1]+p2[1]-p3[1];
  const a=p1[0]-p2[0],b=p3[0]-p2[0],c=p1[1]-p2[1],d=p3[1]-p2[1],den=a*d-b*c;
  const g=(dx*d-b*dy)/den,h=(a*dy-dx*c)/den,k=g*u+h*v+1;
  return [(p0[0]+(p1[0]-p0[0]+g*p1[0])*u+(p3[0]-p0[0]+h*p3[0])*v)/k,(p0[1]+(p1[1]-p0[1]+g*p1[1])*u+(p3[1]-p0[1]+h*p3[1])*v)/k];
};
function polygon(bytes,q,color){
  for(let y=Math.max(0,Math.floor(Math.min(...q.map(p=>p[1]))));y<Math.min(height,Math.ceil(Math.max(...q.map(p=>p[1]))));y++)for(let x=Math.max(0,Math.floor(Math.min(...q.map(p=>p[0]))));x<Math.min(width,Math.ceil(Math.max(...q.map(p=>p[0]))));x++){
    const crosses=q.map((p,i)=>{const b=q[(i+1)%4];return (b[0]-p[0])*(y+.5-p[1])-(b[1]-p[1])*(x+.5-p[0]);});
    if(crosses.every(v=>v>=0)||crosses.every(v=>v<=0))bytes.set([...color,255],(y*width+x)*4);
  }
}
function render(q,gap=.055){
  const bytes=new Uint8Array(size);for(let i=0;i<size;i+=4)bytes.set([48,54,51,255],i);
  if(q){polygon(bytes,q,[14,16,15]);for(let row=0;row<3;row++)for(let col=0;col<3;col++)polygon(bytes,[[col+gap,row+gap],[col+1-gap,row+gap],[col+1-gap,row+1-gap],[col+gap,row+1-gap]].map(([u,v])=>point(q,u/3,v/3)),palette[grid[row*3+col]]);}
  return bytes;
}
function detect(bytes){engine.HEAPU8.set(bytes,ptr);return JSON.parse(engine.detectRGBA(ptr,width,height,width*4));}
function matches(actual,expected){let g=[...actual];for(let r=0;r<4;r++){if(g.join()===expected.join())return true;g=[g[6],g[3],g[0],g[7],g[4],g[1],g[8],g[5],g[2]];}return false;}
try{
  assert.equal(detect(render()).faces.length,0,'Blank background must not become a face');
  for(const [name,q,gap] of [
    ['frontal',[[180,95],[440,95],[440,355],[180,355]],.055],
    ['perspective',[[225,85],[458,145],[422,378],[167,322]],.055],
    ['narrow seams',[[180,95],[440,95],[440,355],[180,355]],.018],
    ['rotated',[[400,65],[495,265],[290,365],[185,155]],.055],
  ]){
    const bytes=render(q,gap),result=detect(bytes);
    frames.push({name,...result});
    assert(result.faces.some(f=>matches(f.colors,grid)),`${name}: expected all nine colors; got ${JSON.stringify(result)}`);
    assert(result.faces.every(f=>f.confidence.every(v=>v>=.65)),`${name}: expected usable confidence`);
    console.log(`${name}: ${result.faces.length} face(s), ${result.processingMs.toFixed(1)}ms`);
  }
  const obscured=render([[180,95],[440,95],[440,355],[180,355]]);
  polygon(obscured,[[180,95],[355,95],[355,355],[180,355]],[48,54,51]);
  assert.equal(detect(obscured).faces.length,0,'Occluded grid must not be accepted');
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/synthetic-detector-results.json',JSON.stringify({kind:'synthetic',date:new Date().toISOString(),frames},null,2));
  console.log('Compiled WASM detector: all pixel fixtures passed. Physical camera trials still required.');
}finally{engine._free(ptr);}

import {rotateGrid,validateCube} from '../core/cube';
import {CenterMap,COLORS,CubeColor,CubeState,Face,FACES,ObservedFace,Quad} from '../core/types';

export type PhotoLayout = 3 | 2;
export const PANEL_LABELS: Face[] = ['U','F','R','L','D','B'];
export const FACE_NAMES: Record<Face,string> = {U:'Up',F:'Front',R:'Right',L:'Left',D:'Down',B:'Back'};
export type PhotoPanel = {face:ObservedFace|null; issue?:string};
export type PhotoRead = {panels:PhotoPanel[];processingMs:number;labels?:Face[];layout?:'panels'|'net'};
export type PhotoValidation = {valid:true;state:CubeState} | {valid:false;reason:string};

/** A detector's first corner can be any corner. Align diagrams with the image. */
export function uprightFace(face:ObservedFace):ObservedFace {
  let first=0;
  for(let i=1;i<4;i++)if(face.quad[i]!.x+face.quad[i]!.y<face.quad[first]!.x+face.quad[first]!.y)first=i;
  return {...face,colors:rotateGrid(face.colors,-first),confidence:rotateGrid(face.confidence,-first),quad:face.quad.map((_,i)=>face.quad[(first+i)%4]!) as Quad};
}
export function reviewPanel(faces:ObservedFace[]):PhotoPanel {
  if(faces.length!==1)return {face:null,issue:faces.length?'More than one grid in this panel. Use a picture with one face per panel.':'No complete 3 × 3 grid found. Use a clearer, straight-on picture.'};
  const face=uprightFace(faces[0]!);
  if(face.cells!==undefined&&face.cells<9)return {face,issue:'Show all nine squares of this face. Its grid is incomplete or unclear.'};
  if(face.confidence.some(c=>!Number.isFinite(c)||c<.65)||face.glare>=.22||face.sharpness<18)
    return {face,issue:'Some squares are unclear. Use a sharper picture with even lighting.'};
  return {face};
}
export function assemblePhoto(panels:PhotoPanel[],labels:Face[],turns:number[],revision=1):PhotoValidation {
  const fail=(reason:string):PhotoValidation=>({valid:false,reason});
  if(panels.length!==6||panels.some(p=>!p.face||p.issue))return fail('We need six clear faces. Replace the picture or check the selected layout.');
  if(labels.length!==6||new Set(labels).size!==6||labels.some(f=>!FACES.includes(f)))return fail('Assign each face name exactly once: Up, Front, Right, Left, Down, Back.');
  if(turns.length!==6||turns.some(t=>!Number.isInteger(t)))return fail('Check the orientation of all six faces.');
  const grids=panels.map((p,i)=>rotateGrid(p.face!.colors,turns[i]!));
  const centers={} as CenterMap;
  labels.forEach((f,i)=>{centers[f]=grids[i]![4];});
  const conflicts=COLORS.flatMap(c=>{const faces=FACES.filter(f=>centers[f]===c);return faces.length>1?[`${faces.map(f=>FACE_NAMES[f]).join(' and ')} both have ${c} centers`]:[];});
  if(conflicts.length){const missing=COLORS.filter(c=>!Object.values(centers).includes(c));return fail(`${conflicts.join('; ')}. ${missing.length?`Missing ${missing.join(' and ')} center. `:''}A real six-color cube needs one center of each color.`);}
  const counts=Object.fromEntries(COLORS.map(c=>[c,grids.flat().filter(v=>v===c).length]));
  const bad=COLORS.filter(c=>counts[c]!==9);
  if(bad.length)return fail(`Each color needs 9 squares. Found ${bad.map(c=>`${counts[c]} ${c}`).join(', ')}. Check the picture and detected colors.`);
  const colorToFace=Object.fromEntries(FACES.map(f=>[centers[f],f])) as Record<CubeColor,Face>;
  const facelets=FACES.map(f=>grids[labels.indexOf(f)]!.map(c=>colorToFace[c]).join('')).join('');
  const result=validateCube(facelets);
  if(!result.valid)return fail(`${result.reason} Check face names and rotations; the picture may show an impossible cube.`);
  return {valid:true,state:{facelets,centers,revision}};
}

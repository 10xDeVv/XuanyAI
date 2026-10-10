import Svg,{G,Polygon,Path} from 'react-native-svg';
import {projectOnQuad} from '../core/geometry';
import {Quad} from '../core/types';
/** Illustration only, displayed before the camera starts. */
export function CubeArt(){
  const faces:{q:Quad;colors:string[]}[]=[
    {q:[{x:170,y:42},{x:290,y:100},{x:170,y:163},{x:50,y:100}],colors:['#D3EDAC','#EEF0DC','#D3EDAC','#F3C45F','#D3EDAC','#EEF0DC','#D3EDAC','#E57D58','#D3EDAC']},
    {q:[{x:50,y:108},{x:166,y:169},{x:166,y:306},{x:50,y:239}],colors:['#E58560','#E58560','#EDC463','#E9EEDE','#E58560','#E58560','#7DAA95','#E58560','#E9EEDE']},
    {q:[{x:174,y:169},{x:290,y:108},{x:290,y:239},{x:174,y:306}],colors:['#7FAAAA','#86AAA8','#EAC667','#86AAA8','#E9EEDE','#86AAA8','#86AAA8','#86AAA8','#D2EAA6']},
  ];
  return <Svg width="100%" height="100%" viewBox="0 0 340 350" accessibilityLabel="Illustration of a colorful cube with a turn arrow">
    <G>{faces.map((face,f)=>face.colors.map((color,i)=>{
      const c=i%3,r=Math.floor(i/3),pad=.035;
      const coords=[[c/3+pad,r/3+pad],[(c+1)/3-pad,r/3+pad],[(c+1)/3-pad,(r+1)/3-pad],[c/3+pad,(r+1)/3-pad]];
      return <Polygon key={`${f}-${i}`} fill={color} points={coords.map(([u,v])=>{const p=projectOnQuad(face.q,u!,v!);return `${p.x},${p.y}`;}).join(' ')}/>;
    }))}</G>
    <Path d="M 63 67 C 83 7 225 0 287 48" stroke="#D1F58A" strokeWidth="6" strokeLinecap="round" fill="none"/>
    <Path d="M 265 48 L 291 51 L 283 26" stroke="#D1F58A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </Svg>;
}

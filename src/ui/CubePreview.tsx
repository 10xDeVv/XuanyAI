import React,{useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import Svg,{Ellipse,Path,Polygon} from 'react-native-svg';
import {CameraView,cubeSurfaces,previewArrow,projectSurfaces,viewForMove,zoomView} from '../core/cubePreview';
import {CubeColor,CubeState,Face,Move,Point} from '../core/types';
import {FACE_NAMES} from '../photo/model';
import CubeViewport from './CubeViewport';

const materials:Record<CubeColor,string>={white:'#F4F6FA',yellow:'#FFDA32',orange:'#FF8A25',red:'#F5484F',green:'#25C879',blue:'#387BF2'};
const shade=(hex:string,light:number)=>'#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*light)).toString(16).padStart(2,'0')).join('');
const path=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
function roundedPolygon(points:Point[]):string {
  return points.map((p,i)=>{
    const before=points[(i+points.length-1)%points.length]!,after=points[(i+1)%points.length]!;
    const a={x:p.x+(before.x-p.x)*.12,y:p.y+(before.y-p.y)*.12},b={x:p.x+(after.x-p.x)*.12,y:p.y+(after.y-p.y)*.12};
    return `${i?'L':'M'}${a.x},${a.y} Q${p.x},${p.y} ${b.x},${b.y}`;
  }).join(' ')+' Z';
}
function Tool({label,text,onPress}:{label:string;text:string;onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.tool,pressed&&{backgroundColor:'#394C45'}]}><Text style={s.toolText}>{text}</Text></Pressable>;
}

/** A freely orbitable 3D scene. View gestures never turn cube layers. */
export function CubePreview({state,move,progress=0,animating=false}:{state:CubeState;move?:Move;progress?:number;animating?:boolean}){
  const {height,width}=useWindowDimensions();
  const [view,setView]=useState<CameraView>(()=>({...viewForMove(move),zoom:1.08}));
  const surfaces=useMemo(()=>projectSurfaces(cubeSurfaces(state,move,progress),view),[state.facelets,state.centers,move,progress,view]);
  const activeFace=move?.[0] as Face|undefined;
  const faceVisible=activeFace&&surfaces.some(p=>p.face===activeFace&&p.sticker!==undefined&&p.sticker%9===4);
  const arrow=move&&faceVisible&&!animating?previewArrow(move,view):null;
  const end=arrow?.[arrow.length-1],prev=arrow?.[arrow.length-4],angle=end&&prev?Math.atan2(end.y-prev.y,end.x-prev.x):0;
  const head=end?`${end.x},${end.y} ${end.x-11*Math.cos(angle-.5)},${end.y-11*Math.sin(angle-.5)} ${end.x-11*Math.cos(angle+.5)},${end.y-11*Math.sin(angle+.5)}`:'';
  const centers=surfaces.filter(p=>p.sticker!==undefined&&p.sticker%9===4).map(p=>p.face!);
  const sceneHeight=width<600?Math.min(290,Math.max(200,height*.32)):360;
  const focus=()=>setView({...viewForMove(move),zoom:1.08});
  return <View style={s.scene}>
    <View style={s.top}><Text style={s.eyebrow}>DRAG TO EXPLORE</Text><View style={s.tools}><Tool label="Zoom out" text="−" onPress={()=>setView(v=>zoomView(v,.9))}/><Tool label="Zoom in" text="+" onPress={()=>setView(v=>zoomView(v,1.1))}/><Tool label="Reset cube view" text="Reset" onPress={focus}/></View></View>
    <CubeViewport view={view} onChange={setView} height={sceneHeight}>
      <Svg width="100%" height="100%" viewBox="0 0 320 320" accessibilityLabel="Your scanned cube with the current turn highlighted">
        <Ellipse cx={160+(view.panX??0)} cy={294+(view.panY??0)} rx={83*(view.zoom??1)} ry={13} fill="#000" opacity={.26}/>
        {surfaces.map(p=>p.color?<Path key={p.id} d={roundedPolygon(p.points)} fill={shade(materials[p.color],(p.light+.14)*(move&&!p.active ? .86 : 1))}
          stroke={p.active?'#E6FFB7':'#FFFFFF20'} strokeWidth={p.active?1.9:.65} strokeLinejoin="round"/>
          :<Polygon key={p.id} points={p.points.map(v=>`${v.x},${v.y}`).join(' ')} fill={shade('#29302F',p.light)} stroke="#101716" strokeWidth={.55} strokeLinejoin="round"/>)}
        {arrow&&<><Path d={path(arrow)} fill="none" stroke="#071310" strokeWidth={7} strokeLinecap="round"/><Path d={path(arrow)} fill="none" stroke="#E6FFB7" strokeWidth={3.5} strokeLinecap="round"/><Polygon points={head} fill="#E6FFB7" stroke="#071310" strokeWidth={1}/></>}
      </Svg>
    </CubeViewport>
    <View style={s.centers}>{centers.map(face=><View key={face} style={s.center}><View style={[s.swatch,{backgroundColor:materials[state.centers[face]]}]}/><Text style={s.centerText}>{FACE_NAMES[face]}</Text></View>)}</View>
    <View style={s.bottom}><Text style={s.hint}>{move&&!faceVisible?'The turning face is behind this view.':'Pinch / scroll to zoom · Two fingers / Shift-drag to pan'}</Text><Tool label="Show highlighted turn" text="Show turn ↗" onPress={focus}/></View>
  </View>;
}
const s=StyleSheet.create({
  scene:{width:'100%',backgroundColor:'#182722',borderRadius:20,overflow:'hidden'},top:{paddingLeft:18,paddingRight:10,paddingTop:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{fontSize:9,letterSpacing:1.3,color:'#B2C2B6',fontWeight:'600'},tools:{flexDirection:'row',gap:2},tool:{minWidth:42,minHeight:44,paddingHorizontal:9,alignItems:'center',justifyContent:'center',borderRadius:9},toolText:{fontSize:12,color:'#E6F5DE',fontWeight:'600'},
  centers:{flexDirection:'row',gap:18,justifyContent:'center',height:24,alignItems:'center'},center:{flexDirection:'row',gap:5,alignItems:'center'},swatch:{width:8,height:8,borderRadius:2},centerText:{fontSize:10,color:'#C4D2C8'},bottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12,paddingBottom:5,gap:6},hint:{fontSize:9,lineHeight:14,color:'#A5B8AC',flex:1},
});

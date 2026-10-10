import {useEffect,useRef} from 'react';
import {Animated,Platform,StyleSheet} from 'react-native';
import Svg,{Polygon,Path,Text as SvgText} from 'react-native-svg';
import {CubeObservation,FacePose,Move,Quad} from '../core/types';
import {toPreview,turnArrow} from '../core/geometry';
import {arrangeDiagram} from '../photo/DiagramScanner';
export function GuidanceOverlay({observation,poses,move,panels=false}:{observation?:CubeObservation;poses:FacePose[];move?:Move;panels?:boolean}){
  const opacity=useRef(new Animated.Value(1)).current;
  useEffect(()=>{const pulse=Animated.loop(Animated.sequence([Animated.timing(opacity,{toValue:.65,duration:650,useNativeDriver:Platform.OS!=='web'}),Animated.timing(opacity,{toValue:1,duration:650,useNativeDriver:Platform.OS!=='web'})]));pulse.start();return()=>pulse.stop();},[opacity]);
  if(!observation)return null;
  const target=poses.find(p=>p.face===move?.[0]);
  const quad=target?.quad.map(p=>toPreview(p,observation.transform)) as Quad|undefined;
  const arrow=quad&&move?turnArrow(quad,move.endsWith("'")):undefined;
  const ordered=panels?arrangeDiagram(observation.faces):null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{opacity}]}>
    <Svg width="100%" height="100%">
      {observation.faces.map((f,i)=><Polygon key={i} points={f.quad.map(p=>{const v=toPreview(p,observation.transform);return `${v.x},${v.y}`;}).join(' ')} stroke="#D1F58A" strokeWidth={1.5} fill="none" opacity={.4}/>)}
      {ordered?.faces.map((f,i)=>{const p=toPreview(f.quad[0],observation.transform);return <SvgText key={`panel-${i}`} x={p.x+5} y={p.y+18} fill="#D1F58A" stroke="#17271F" strokeWidth={.6} fontSize={18} fontWeight="bold">{i+1}</SvgText>;})}
      {quad&&<Polygon points={quad.map(p=>`${p.x},${p.y}`).join(' ')} fill="#D1F58A" fillOpacity={.12} stroke="#D1F58A" strokeWidth={3}/>}
      {arrow&&<><Path d={arrow.path} fill="none" stroke="#12201A" strokeWidth={12} strokeLinecap="round"/><Path d={arrow.path} fill="none" stroke="#D1F58A" strokeWidth={7} strokeLinecap="round"/><Polygon points={arrow.head} fill="#D1F58A" stroke="#12201A" strokeWidth={1}/></>}
    </Svg>
  </Animated.View>;
}

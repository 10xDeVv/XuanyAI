import React,{useEffect,useRef} from 'react';
import {Animated,Platform,StyleSheet} from 'react-native';
import Svg,{Circle,Polygon,Path,Text as SvgText} from 'react-native-svg';
import {CubeColor,CubeObservation,FacePose,Move,Quad} from '../core/types';
import {projectOnQuad,toPreview,turnArrow} from '../core/geometry';
import {arrangeDiagram} from '../photo/DiagramScanner';
export function GuidanceOverlay({observation,poses,move,panels=false,scan}:{observation?:CubeObservation;poses:FacePose[];move?:Move;panels?:boolean;scan?:{captured:CubeColor[];rechecking?:CubeColor[]}}){
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
      {scan&&!panels&&observation.faces.map((f,i)=>{
        const q=f.quad.map(p=>toPreview(p,observation.transform)),color=f.colors[4];
        const saved=scan.captured.includes(color)&&!scan.rechecking?.includes(color);
        const x=q.reduce((n,p)=>n+p.x,0)/4,y=q.reduce((n,p)=>n+p.y,0)/4;
        return <React.Fragment key={`scan-${i}`}>
          <Polygon points={q.map(p=>`${p.x},${p.y}`).join(' ')} stroke={saved?'#D1F58A':'#FFC873'} strokeWidth={saved?3:1.5} fill="none"/>
          {!saved&&f.confidence.map((confidence,k)=>{if(confidence>=.65)return null;const p=toPreview(projectOnQuad(f.quad,(k%3+.5)/3,(Math.floor(k/3)+.5)/3),observation.transform);return <Circle key={k} cx={p.x} cy={p.y} r={5} fill="none" stroke="#FFC873" strokeWidth={2}/>;})}
          {saved&&<><Circle cx={x} cy={y} r={9} fill="#17271F" fillOpacity={.9}/><SvgText x={x} y={y+4} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#D1F58A">✓</SvgText></>}
        </React.Fragment>;
      })}
      {ordered?.faces.map((f,i)=>{const p=toPreview(f.quad[0],observation.transform);return <SvgText key={`panel-${i}`} x={p.x+5} y={p.y+18} fill="#D1F58A" stroke="#17271F" strokeWidth={.6} fontSize={18} fontWeight="bold">{ordered.layout==='net'?ordered.labels[i]:i+1}</SvgText>;})}
      {quad&&<Polygon points={quad.map(p=>`${p.x},${p.y}`).join(' ')} fill="#D1F58A" fillOpacity={.12} stroke="#D1F58A" strokeWidth={3}/>}
      {arrow&&<><Path d={arrow.path} fill="none" stroke="#12201A" strokeWidth={12} strokeLinecap="round"/><Path d={arrow.path} fill="none" stroke="#D1F58A" strokeWidth={7} strokeLinecap="round"/><Polygon points={arrow.head} fill="#D1F58A" stroke="#12201A" strokeWidth={1}/></>}
    </Svg>
  </Animated.View>;
}

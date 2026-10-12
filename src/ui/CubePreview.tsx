import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import Svg,{Ellipse,Path,Polygon} from 'react-native-svg';
import {CameraView,cubeSurfaces,previewArrow,projectSurfaces,viewForMove} from '../core/cubePreview';
import {COLOR_HEX,CubeState,Face,Move,Point} from '../core/types';
import {FACE_NAMES} from '../photo/model';

type Phase='before'|'turning'|'after';
const shade=(hex:string,light:number)=>'#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*light)).toString(16).padStart(2,'0')).join('');
const path=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
function roundedPolygon(points:Point[]):string {
  return points.map((p,i)=>{
    const before=points[(i+points.length-1)%points.length]!,after=points[(i+1)%points.length]!;
    const a={x:p.x+(before.x-p.x)*.10,y:p.y+(before.y-p.y)*.10},b={x:p.x+(after.x-p.x)*.10,y:p.y+(after.y-p.y)*.10};
    return `${i?'L':'M'}${a.x},${a.y} Q${p.x},${p.y} ${b.x},${b.y}`;
  }).join(' ')+' Z';
}
function Control({label,onPress,selected=false,disabled=false,small=false}:{label:string;onPress:()=>void;selected?:boolean;disabled?:boolean;small?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[s.control,small&&s.smallControl,selected&&s.selected,pressed&&{opacity:.7},disabled&&{opacity:.4}]}>
    <Text style={[s.controlText,small&&s.smallText]}>{label}</Text>
  </Pressable>;
}

/** Preview animation never advances the real solution or verifies a camera turn. */
export function CubePreview({state,move,compact=false,autoPlay=true}:{state:CubeState;move?:Move;compact?:boolean;autoPlay?:boolean}) {
  const key=`${state.facelets}:${Object.values(state.centers).join(',')}:${move??''}`;
  const [frame,setFrame]=useState<{key:string;progress:number;phase:Phase}>({key,progress:0,phase:'before'});
  const [orbit,setOrbit]=useState<{key:string;view:CameraView}>({key,view:viewForMove(move)});
  const [reduced,setReduced]=useState(true);
  const raf=useRef<number|undefined>(undefined),delay=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const cancel=useCallback(()=>{if(raf.current!==undefined)cancelAnimationFrame(raf.current);clearTimeout(delay.current);raf.current=undefined;},[]);
  const show=useCallback((phase:'before'|'after')=>{cancel();setFrame({key,progress:phase==='after'?1:0,phase});},[cancel,key]);
  const play=useCallback(()=>{
    cancel();if(!move)return;
    if(reduced){setFrame({key,progress:1,phase:'after'});return;}
    setFrame({key,progress:0,phase:'before'});
    delay.current=setTimeout(()=>{
      let start:number|undefined,last=-Infinity;
      const tick=(now:number)=>{
        start??=now;const t=Math.min(1,(now-start)/(move.endsWith('2')?1800:1250));
        if(now-last>=30||t===1){last=now;setFrame({key,progress:t*t*(3-2*t),phase:t===1?'after':'turning'});}
        if(t<1)raf.current=requestAnimationFrame(tick);
      };
      raf.current=requestAnimationFrame(tick);
    },350);
  },[cancel,key,move,reduced]);
  useEffect(()=>{
    let alive=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value);}).catch(()=>{});
    const change=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{alive=false;change.remove();};
  },[]);
  useEffect(()=>{
    show('before');setOrbit({key,view:viewForMove(move)});
    if(autoPlay&&!reduced)play();
    return cancel;
  },[key,move,autoPlay,reduced,play,show,cancel]);
  useEffect(()=>{const change=AppState.addEventListener('change',status=>{if(status!=='active')show('before');});return()=>change.remove();},[show]);
  const progress=frame.key===key?frame.progress:0,phase=frame.key===key?frame.phase:'before';
  const view=orbit.key===key?orbit.view:viewForMove(move);
  const surfaces=useMemo(()=>projectSurfaces(cubeSurfaces(state,move,progress),view),[key,progress,view]);
  const activeFace=move?.[0] as Face|undefined;
  const faceVisible=activeFace&&surfaces.some(p=>p.sticker!==undefined&&p.face===activeFace&&p.sticker%9===4);
  const arrow=move&&faceVisible&&phase!=='turning'?previewArrow(move,view):null;
  const arrowEnd=arrow?.[arrow.length-1],arrowPrev=arrow?.[arrow.length-4];
  const angle=arrowEnd&&arrowPrev?Math.atan2(arrowEnd.y-arrowPrev.y,arrowEnd.x-arrowPrev.x):0;
  const arrowHead=arrowEnd?`${arrowEnd.x},${arrowEnd.y} ${arrowEnd.x-12*Math.cos(angle-.5)},${arrowEnd.y-12*Math.sin(angle-.5)} ${arrowEnd.x-12*Math.cos(angle+.5)},${arrowEnd.y-12*Math.sin(angle+.5)}`:'';
  const visibleCenters=surfaces.filter(p=>p.sticker!==undefined&&p.sticker%9===4).map(p=>p.face!);
  const orbitBy=(yaw:number,pitch=0)=>setOrbit({key,view:{yaw:view.yaw+yaw,pitch:pitch? -view.pitch:view.pitch}});
  const phaseLabel=!move?'YOUR CUBE':phase==='before'?'BEFORE THIS TURN':phase==='turning'?'TURN PREVIEW':'AFTER THIS TURN';
  return <View style={[s.card,compact&&s.compact]}>
    <View style={s.header}><Text style={s.eyebrow}>YOUR CUBE · 3D</Text><Text accessibilityLiveRegion="polite" style={s.phase}>{phaseLabel}</Text></View>
    <View accessible accessibilityRole="image" accessibilityLabel={`3D replica of your cube. ${phaseLabel.toLowerCase()}${move&&activeFace?`. ${FACE_NAMES[activeFace]} face, ${move.endsWith("'")?'counterclockwise':'clockwise'}`:''}.`} style={{width:'100%',height:compact?220:290}}>
      <Svg width="100%" height="100%" viewBox="0 0 320 320">
        <Ellipse cx={160} cy={289} rx={81} ry={12} fill="#17271F" opacity={.08}/>
        {surfaces.map(p=>p.color?<Path key={p.id} d={roundedPolygon(p.points)} fill={shade(COLOR_HEX[p.color],p.light+.15)}
          stroke={p.active?'#D1F58A':'#17231E'} strokeWidth={p.active?2.3:.65} strokeLinejoin="round"/>
          :<Polygon key={p.id} points={p.points.map(v=>`${v.x},${v.y}`).join(' ')} fill={p.active?'#2D4032':'#18251E'} stroke="#111C16" strokeWidth={.5} strokeLinejoin="round"/>)}
        {arrow&&<><Path d={path(arrow)} fill="none" stroke="#17271F" strokeWidth={8} strokeLinecap="round"/><Path d={path(arrow)} fill="none" stroke="#E3FFAB" strokeWidth={4.5} strokeLinecap="round"/><Polygon points={arrowHead} fill="#E3FFAB" stroke="#17271F" strokeWidth={1.3}/></>}
      </Svg>
    </View>
    <View style={s.centers}>{visibleCenters.map(face=><View key={face} style={s.center}><View style={[s.swatch,{backgroundColor:COLOR_HEX[state.centers[face]]}]}/><Text style={s.centerText}>{FACE_NAMES[face]}</Text></View>)}</View>
    {move&&<View style={s.controls}>
      <Control label="Before" selected={phase==='before'} onPress={()=>show('before')}/>
      <Control label={reduced?'Show result':'Replay turn'} selected={phase==='turning'} onPress={play}/>
      <Control label="After" selected={phase==='after'} onPress={()=>show('after')}/>
    </View>}
    <View style={s.controls}>
      <Control small label="View left" onPress={()=>orbitBy(-Math.PI/2)}/>
      <Control small label="View right" onPress={()=>orbitBy(Math.PI/2)}/>
      <Control small label={view.pitch>=0?'View below':'View above'} onPress={()=>orbitBy(0,1)}/>
      <Control small label="Reset view" onPress={()=>setOrbit({key,view:viewForMove(move)})}/>
    </View>
    {!compact&&<Text style={s.note}>{move?'The outlined layer moves. The preview shows how your cube should look after this turn.':'Every square reflects the current solution state.'}</Text>}
  </View>;
}
const s=StyleSheet.create({
  card:{width:'100%',backgroundColor:'#F0F3E9',borderWidth:1,borderColor:'#DCE4D2',borderRadius:18,padding:14,gap:10},compact:{borderWidth:0,borderRadius:0,padding:12,gap:5},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},eyebrow:{fontSize:9,letterSpacing:1.2,fontWeight:'700',color:'#667760'},phase:{fontSize:9,fontWeight:'700',color:'#3F6138'},
  centers:{flexDirection:'row',gap:14,justifyContent:'center',flexWrap:'wrap',marginBottom:4},center:{flexDirection:'row',gap:5,alignItems:'center'},swatch:{width:9,height:9,borderRadius:3,borderWidth:.5,borderColor:'#17271F55'},centerText:{fontSize:10,color:'#53604E'},
  controls:{flexDirection:'row',gap:6},control:{flex:1,minHeight:44,borderRadius:9,backgroundColor:'#E0E7D6',alignItems:'center',justifyContent:'center',paddingHorizontal:4},selected:{backgroundColor:'#D1F58A'},controlText:{fontSize:12,fontWeight:'600',color:'#263A27'},smallControl:{backgroundColor:'transparent',minHeight:44},smallText:{fontSize:9,fontWeight:'500'},note:{fontSize:11,lineHeight:17,textAlign:'center',color:'#697662'},
});

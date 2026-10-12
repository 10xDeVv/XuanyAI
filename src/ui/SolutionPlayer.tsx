import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import {inverseMove} from '../core/cube';
import {stateAtStep} from '../core/cubePreview';
import {COLOR_HEX,CubeState,Face,Move,SolutionPlan} from '../core/types';
import {FACE_NAMES} from '../photo/model';
import {CubePreview} from './CubePreview';

type Playback={from:number;move:Move;progress:number;kind:'next'|'previous'|'replay'};
function Button({label,onPress,disabled=false,primary=false}:{label:string;onPress:()=>void;disabled?:boolean;primary?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={({pressed})=>[s.button,primary&&s.primary,disabled&&{opacity:.35},pressed&&{opacity:.75}]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
/** Manual steps are a solution model, never camera confirmations of real turns. */
export function SolutionPlayer({plan,onCamera,onStateChange}:{plan:SolutionPlan;onCamera:(state:CubeState)=>void;onStateChange?:(state:CubeState)=>void}){
  const [step,setStep]=useState(0),[playback,setPlayback]=useState<Playback|null>(null),[reduced,setReduced]=useState(true);
  const raf=useRef<number|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),running=useRef(false);
  const current=useMemo(()=>stateAtStep(plan.state,plan.moves,step),[plan,step]);
  const display=useMemo(()=>playback?stateAtStep(plan.state,plan.moves,playback.from):current,[plan,current,playback?.from]);
  const nextMove=plan.moves[step],move=playback?.move??nextMove,face=move?.[0] as Face|undefined;
  const cancel=useCallback(()=>{if(raf.current!==undefined)cancelAnimationFrame(raf.current);clearTimeout(timer.current);raf.current=undefined;running.current=false;},[]);
  useEffect(()=>{onStateChange?.(current);},[current,onStateChange]);
  useEffect(()=>{
    let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduced(v);}).catch(()=>{});
    const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive=false;sub.remove();};
  },[]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active'){cancel();setPlayback(null);}});return()=>{cancel();sub.remove();};},[cancel]);
  useEffect(()=>{if(reduced){cancel();setPlayback(null);}},[reduced,cancel]);
  const play=(kind:Playback['kind'])=>{
    if(running.current)return;
    const turn=kind==='previous'?(step>0?inverseMove(plan.moves[step-1]!):undefined):nextMove;if(!turn)return;
    cancel();running.current=true;
    const from=step;
    const finish=()=>{
      if(kind==='replay'){timer.current=setTimeout(()=>{running.current=false;setPlayback(null);},650);}
      else{setStep(from+(kind==='next'?1:-1));setPlayback(null);running.current=false;}
    };
    if(reduced){setPlayback({from,move:turn,progress:1,kind});finish();return;}
    setPlayback({from,move:turn,progress:0,kind});
    let start:number|undefined,last=-Infinity;
    const tick=(time:number)=>{
      start??=time;const t=Math.min(1,(time-start)/(kind==='replay'?1100:650));
      if(time-last>=24||t===1){last=time;setPlayback({from,move:turn,progress:t*t*(3-2*t),kind});}
      if(t<1)raf.current=requestAnimationFrame(tick);else finish();
    };
    raf.current=requestAnimationFrame(tick);
  };
  const busy=!!playback,finished=step===plan.moves.length;
  return <View style={s.player}>
    <View style={s.heading}><Text style={s.kicker}>{finished?'STEPS COMPLETE':`STEP ${step+1} OF ${plan.moves.length}`}</Text><Text style={s.count}>{step} / {plan.moves.length} turns</Text></View>
    <View style={s.track}><View style={[s.fill,{width:`${plan.moves.length?step/plan.moves.length*100:100}%`}]}/></View>
    <View style={s.instruction}>
      {face?<><View style={[s.swatch,{backgroundColor:COLOR_HEX[plan.state.centers[face]]}]}/><View style={{flex:1}}><Text accessibilityRole="header" style={s.title}>{FACE_NAMES[face]} face · {move!.endsWith("'")?'counterclockwise':'clockwise'}</Text><Text style={s.subtitle}>{plan.state.centers[face]} center · {move!.endsWith('2')?'half turn':'quarter turn'} · {playback?.kind==='previous'?'returning to the previous step':playback?.kind==='replay'?'preview only':busy?'moving to the next step':'highlighted on your cube'}</Text></View></>:<View><Text accessibilityRole="header" style={s.title}>Your model is solved.</Text><Text style={s.subtitle}>Check that your real cube matches on every side.</Text></View>}
    </View>
    <CubePreview state={display} move={move} progress={playback?.progress??0} animating={busy}/>
    <View style={s.navigation}>
      <Button label="Previous step" disabled={step===0||busy} onPress={()=>play('previous')}/>
      <Button label="Replay turn" disabled={finished||busy} onPress={()=>play('replay')}/>
      <Button label="Next step" disabled={finished||busy} primary onPress={()=>play('next')}/>
    </View>
    <Text style={s.note}>{finished?'Drag to inspect every side, or go back through the steps.':'Make the highlighted turn on your cube, then tap Next step. Previous returns the model one step.'}</Text>
    <View style={s.reference}><Text style={s.referenceText}>Start with <Text style={s.bold}>{plan.state.centers.U} on top</Text> and <Text style={s.bold}>{plan.state.centers.F} facing you</Text>. Dragging only changes your view.</Text></View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>onCamera(current)} style={[s.camera,busy&&{opacity:.4}]}><Text style={s.cameraText}>{finished?'Check my cube with camera':'Use camera guidance instead'} ↗</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({
  player:{width:'100%',gap:12},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},kicker:{fontSize:10,fontWeight:'700',letterSpacing:1.4,color:'#506549'},count:{fontSize:11,color:'#738071'},track:{height:4,borderRadius:4,backgroundColor:'#E4EBDD',overflow:'hidden'},fill:{height:'100%',backgroundColor:'#7B9C52'},instruction:{flexDirection:'row',alignItems:'center',gap:12,minHeight:57},swatch:{width:32,height:32,borderRadius:9,borderWidth:1,borderColor:'#243C2520'},title:{fontSize:20,lineHeight:25,fontWeight:'600',letterSpacing:-.4,color:'#17271F'},subtitle:{fontSize:11,lineHeight:17,color:'#667762',marginTop:3},
  navigation:{flexDirection:'row',gap:7},button:{flex:1,minHeight:50,justifyContent:'center',alignItems:'center',paddingHorizontal:5,borderRadius:11,backgroundColor:'#E7ECDD'},primary:{backgroundColor:'#D1F58A'},buttonText:{fontSize:12,fontWeight:'600',color:'#20321F'},note:{fontSize:11,lineHeight:17,color:'#657560'},reference:{padding:12,borderRadius:12,backgroundColor:'#EDF1E7'},referenceText:{fontSize:11,lineHeight:18,color:'#596A54'},bold:{fontWeight:'700',color:'#233A21'},camera:{minHeight:44,justifyContent:'center',alignItems:'center'},cameraText:{fontSize:12,color:'#526B45',fontWeight:'600'},
});

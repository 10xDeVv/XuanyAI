import React,{useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ActivityIndicator,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg,{Path,Rect} from 'react-native-svg';
import CameraSurface from '../camera/CameraSurface';
import {CubeObservation,COLORS,COLOR_HEX,Face} from '../core/types';
import {createSolver} from '../solver/createSolver';
import {Session,SessionView} from '../session/Session';
import {CubeArt} from './CubeArt';
import {GuidanceOverlay} from './GuidanceOverlay';
import {PhotoImport} from './PhotoImport';
import {CubeState} from '../core/types';

const ink='#17271F',muted='#738077',lime='#D1F58A';
function Mark(){return <View style={s.mark}>{Array.from({length:9},(_,i)=><View key={i} style={[s.markCell,i===2&&{opacity:.25}]}/>)}</View>;}
function CameraIcon(){return <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M8 5 9.5 3h5L16 5h4v15H4V5Z" fill="none" stroke={ink} strokeWidth={1.7}/><Path d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0" fill="none" stroke={ink} strokeWidth={1.7}/></Svg>;}
function Action({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({pressed})=>[s.action,secondary&&s.secondary,pressed&&{opacity:.8},disabled&&{opacity:.5}]}>{!secondary&&<CameraIcon/>}<Text style={[s.actionText,secondary&&{color:ink}]}>{label}</Text><Text style={s.actionArrow}>↗</Text></Pressable>;}
const empty:SessionView={stage:'setup',message:'Your cube. One turn at a time.',captured:[],poses:[],movesDone:0,movesRemaining:0,corrections:0,confirmedAt:0,startedAt:0,elapsedMs:0};
const noopSubscribe=()=>()=>{};

export default function SolverScreen(){
  const {width,height}=useWindowDimensions(),wide=width>=900;
  const scroll=useRef<ScrollView>(null);
  const [session,setSession]=useState<Session|null>(null),sessionRef=useRef<Session|null>(null);
  const view=useSyncExternalStore(session?.subscribe??noopSubscribe,session?.getSnapshot??(()=>empty),()=>empty);
  const [facing,setFacing]=useState<'front'|'back'>('front'),[status,setStatus]=useState('Camera is off'),[help,setHelp]=useState(false),[paused,setPaused]=useState(false);
  const [localError,setLocalError]=useState<string|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [saveFrameRequest,setSaveFrameRequest]=useState(0);
  const [photo,setPhoto]=useState(false);
  useEffect(()=>()=>sessionRef.current?.dispose(),[]);
  useEffect(()=>{if(!view.confirmedAt)return;setConfirmed(true);const timeout=setTimeout(()=>setConfirmed(false),850);return()=>clearTimeout(timeout);},[view.confirmedAt]);
  const start=(mode:'auto'|'diagram'='auto')=>{
    try{
      let next=sessionRef.current;
      if(!next||next.getSnapshot().stage==='error'){next?.dispose();next=new Session(createSolver());sessionRef.current=next;setSession(next);}
      setLocalError(null);setPaused(false);setPhoto(false);if(mode==='diagram')setFacing('back');setStatus('Opening camera');next.start(mode);scroll.current?.scrollTo({y:0,animated:false});
    }
    catch(e){setLocalError(e instanceof Error?e.message:'The camera could not start.');}
  };
  const observe=useCallback((o:CubeObservation)=>sessionRef.current?.observe(o),[]);
  const guidePhoto=(cube:CubeState)=>{
    try{sessionRef.current?.dispose();const next=new Session(createSolver());sessionRef.current=next;setSession(next);setLocalError(null);setPaused(false);setPhoto(false);setStatus('Opening camera');next.startFromPhoto(cube);scroll.current?.scrollTo({y:0,animated:false});}
    catch(e){setLocalError(e instanceof Error?e.message:'The camera guide could not start.');}
  };
  const onError=useCallback((message:string)=>{sessionRef.current?.cameraError(message);setStatus('Camera paused');},[]);
  const suspend=useCallback(()=>sessionRef.current?.suspend(),[]);
  const closePicture=()=>{sessionRef.current?.dispose();sessionRef.current=null;setSession(null);setPhoto(false);setStatus('Camera is off');};
  const stage=view.stage,setup=stage==='setup',error=stage==='error'||!!localError,solved=stage==='solved';
  const active=!!session&&!setup&&!solved&&!error&&!paused&&stage!=='picture'&&!photo;
  const diagram=view.diagramCount!==undefined;
  const compact=!wide&&!setup&&!solved;
  const target=view.nextMove?.[0] as Face|undefined;
  const targetVisible=target&&view.poses.some(p=>p.face===target);
  const hidden=stage==='guiding'&&target&&!targetVisible;
  const message=localError??(hidden?'Rotate the whole cube to show this center.':view.message);
  const phase=error?'Let’s try that again':setup?'Ready when you are':solved?'Every side. Solved.':stage==='scanning'?(diagram?'Point at the whole picture.':'Getting to know your cube'):stage==='planning'?'A little thinking…':stage==='recovering'?'Let’s get a clearer view':stage==='verifying'?'The finishing touch':hidden?'Bring the next face into view':'One turn closer.';
  const minutes=Math.floor(view.elapsedMs/60000),seconds=Math.floor(view.elapsedMs/1000)%60;
  return <SafeAreaView style={s.page}>
    <ScrollView ref={scroll} contentContainerStyle={[s.shell,wide&&{paddingHorizontal:56},compact&&{paddingHorizontal:14}]}>
      <View style={[s.nav,compact&&{height:62,marginBottom:10}]}>
        <View style={s.brand}><Mark/><Text style={s.brandText}>point<Text style={{color:'#719241'}}>.</Text></Text>{width>=600&&<><View style={s.brandDivider}/><Text style={s.brandDescriptor}>YOUR CUBE, SOLVED.</Text></>}</View>
        <View style={s.navLinks}>{width>=600&&<View style={s.activeNav}><Text style={s.navText}>Solver</Text></View>}<Pressable accessibilityRole="button" onPress={()=>setHelp(true)} style={s.helpButton}><Text style={s.helpNav}>{wide?'How it works':'Help'}</Text><Text style={s.helpNav}>↗</Text></Pressable></View>
      </View>
      {!compact&&<View style={[s.headingRow,!wide&&{marginTop:28}]}>
        <View style={{flex:1}}><Text style={s.eyebrow}>A FRESH WAY TO FIGURE IT OUT</Text><Text style={[s.title,!wide&&{fontSize:36,lineHeight:41}]}>A scrambled cube.{wide?'\n':'\n'}A clear next move<Text style={{color:'#8AA454'}}>.</Text></Text></View>
        {wide&&<View style={s.headingNote}><Text style={s.noteText}>No notation to learn. No colors to enter.{'\n'}Just your cube, your camera, and a little guidance.</Text><View style={s.privacy}><View style={s.dot}/><Text style={s.privacyText}>Everything stays on your device</Text></View></View>}
      </View>}
      <View style={[s.main,wide&&{flexDirection:'row'},compact&&{gap:0}]}>
        <View style={[s.viewerColumn,wide&&{flex:1.5}]}>
          <View style={[s.viewer,{height:wide?490:compact?Math.max(230,Math.min(380,height*.42)):320}]}>
            {active&&<CameraSurface active={active} facing={facing} saveFrameRequest={saveFrameRequest} onObservation={observe} onError={onError} onStatus={setStatus} onSuspend={suspend}/>}
            {(!active||setup)&&<View style={s.illustration}><View style={s.orbit}/><View style={s.orbitInner}/><View style={{width:285,height:300}}><CubeArt/></View></View>}
            {active&&!paused&&<GuidanceOverlay observation={view.observation} poses={view.poses} move={view.nextMove} panels={diagram}/>}
            <View style={s.viewerTop}><View style={s.liveChip}><View style={[s.dot,{backgroundColor:active?lime:'#7A887E'}]}/><Text style={s.liveText}>{active?'LIVE GUIDE':solved?'NICE WORK':'CAMERA PREVIEW'}</Text></View><Text style={s.viewerTag}>3 × 3</Text></View>
            {active&&stage==='scanning'&&!diagram&&<View pointerEvents="none" style={s.reticle}><View style={s.reticleCorner}/><View style={[s.reticleCorner,{right:0,transform:[{rotate:'90deg'}]}]}/><View style={[s.reticleCorner,{bottom:0,transform:[{rotate:'-90deg'}]}]}/><View style={[s.reticleCorner,{right:0,bottom:0,transform:[{rotate:'180deg'}]}]}/></View>}
            {confirmed&&active&&<View style={s.confirmation}><Text style={s.confirmText}>✓  Got it</Text></View>}
            <View pointerEvents="none" style={s.viewerBottom}>
              <Text style={s.viewerCaption}>{setup?'A little guidance goes a long way.':paused?'Take your time. We’ll be right here.':solved?'Look what you just did.':stage==='planning'?'Finding a way from here.':status}</Text>
              <Text style={s.viewerSub}>{setup?'Your real cube. Your next turn.':active?(diagram?'Paper or screen · All six grids in view':'Keep the cube in view · Pause between turns'):'POINT. SCAN. SOLVE.'}</Text>
            </View>
          </View>
          <View style={s.viewerToolbar}><View style={s.privacy}><Text style={{fontSize:14,color:muted}}>◈</Text><Text style={s.toolbarLabel}>{active?'Unmirrored view':'Camera starts only when you’re ready'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Switch camera" style={s.switchButton} onPress={()=>{suspend();setFacing(f=>f==='front'?'back':'front');}}><Text style={s.switchText}>↻  {facing==='front'?'Front':'Back'} camera</Text></Pressable></View>
        </View>
        <View style={[s.side,wide&&{flex:1},!wide&&{minHeight:0,marginBottom:20},compact&&{padding:16}]}>
          {!compact&&<View style={s.sideTop}><Text style={s.eyebrow}>{setup?'LET’S MAKE IT CLICK':solved?'THAT WAS ALL YOU':error?'CAMERA CHECK':`YOUR ${stage==='scanning'?'SCAN':'SOLVE'}`}</Text><View style={s.stepChip}><Text style={s.stepChipText}>{setup?'01':stage==='scanning'?'01':solved?'✓':'02'} / 03</Text></View></View>}
          <Text accessibilityRole="header" style={[s.panelTitle,compact&&{fontSize:22,lineHeight:27,marginTop:0}]}>{paused?'Paused. Take your time.':phase}</Text>
          <Text accessibilityLiveRegion="polite" style={[s.panelBody,compact&&{marginTop:6}]}>{error?message:setup?'Prop up your phone, grab your cube, and let’s untangle it together. We’ll show you exactly what to turn.':paused?'Resume when you’re ready. We’ll take a fresh look at your cube.':message}</Text>
          {hidden&&view.cube&&target&&<View style={s.reveal}><View style={[s.centerSwatch,{backgroundColor:COLOR_HEX[view.cube.centers[target]]}]}/><View><Text style={s.revealTitle}>Show this center</Text><Text style={s.revealBody}>Move the whole cube, keeping layers still.</Text></View></View>}
          {(setup||stage==='scanning')&&<View style={[s.scanProgress,compact&&{marginTop:12,paddingTop:12}]}><View style={s.progressHeader}><Text style={s.progressLabel}>{diagram?'CLEAR PANELS IN VIEW':'FACES CAPTURED'}</Text><Text style={s.progressCount}>{diagram?view.diagramCount:view.captured.length}<Text style={{color:'#A1A99D'}}> / 6</Text></Text></View>{diagram?<Text style={s.scanHint}>Hold the picture upright. Capture happens automatically after a short pause.</Text>:<><View style={[s.faces,compact&&{marginTop:10}]}>{COLORS.map(c=><View key={c} accessibilityLabel={`${c} face ${view.captured.includes(c)?'captured':'not captured'}`} style={[s.faceDot,compact&&{width:25,height:25,borderRadius:6},{backgroundColor:COLOR_HEX[c],opacity:view.captured.includes(c)?1:.28}]}>{view.captured.includes(c)&&<Text style={s.faceCheck}>✓</Text>}</View>)}</View>{!compact&&<Text style={s.scanHint}>{setup?'We’ll pick these up as you rotate.':'Any order works. No need to tap.'}</Text>}</>}</View>}
          {stage==='planning'&&<View style={s.thinking}><ActivityIndicator color={ink}/><Text style={s.scanHint}>Working on your device</Text></View>}
          {!compact&&!setup&&!['scanning','error','planning'].includes(stage)&&<View style={s.stats}><View><Text style={s.statValue}>{solved?`${minutes}:${String(seconds).padStart(2,'0')}`:String(view.movesDone).padStart(2,'0')}</Text><Text style={s.statLabel}>{solved?'YOUR SOLVE TIME':'TURNS MADE'}</Text></View><View style={s.statDivider}/><View><Text style={s.statValue}>{solved?view.movesDone:view.movesRemaining}</Text><Text style={s.statLabel}>{solved?'TURNS TAKEN':'TURNS TO GO'}</Text></View></View>}
          <View style={{flex:1,minHeight:16}}/>
          {(setup||error||solved)?<Action label={error?'Try again':solved?'Solve another cube':'Let’s solve your cube'} onPress={()=>start()}/>:<Action label={paused?'Resume camera':'Pause for a moment'} secondary onPress={()=>{suspend();setPaused(p=>!p);}}/>}
          {!setup&&!error&&!solved&&<Pressable accessibilityRole="button" onPress={()=>session?.rescan()} style={s.rescan}><Text style={s.rescanText}>Start a fresh scan</Text></Pressable>}
          {setup&&<Text style={s.permissionNote}>We’ll ask for camera access. No account needed.</Text>}
          {(setup||error||solved||stage==='scanning')&&<View style={{marginTop:14}}><Action label={diagram?'Scan a physical cube':'Point camera at a picture'} secondary onPress={()=>start(diagram?'auto':'diagram')}/></View>}
          {(setup||error||solved)&&<Pressable accessibilityRole="button" style={s.rescan} onPress={()=>setPhoto(true)}><Text style={s.rescanText}>Or choose a saved picture</Text></Pressable>}
          {solved&&<Text style={s.permissionNote}>{view.corrections?`${view.corrections} detour${view.corrections===1?'':'s'}. Still got there.`:'One cube. A very good feeling.'}</Text>}
        </View>
      </View>
      {!compact&&<View style={[s.steps,!wide&&{flexDirection:'column',gap:22}]}>{[
        ['01','Give us a little spin','Rotate your whole cube. We’ll find every face.'],
        ['02','Follow your next move','The arrow shows you what to turn, right on your cube.'],
        ['03','Find your happy ending','Wrong turn? We’ll find a new way from where you are.'],
      ].map(([n,title,body])=><View key={n} style={s.step}><Text style={s.stepNumber}>{n}</Text><View style={{flex:1}}><Text style={s.stepTitle}>{title}</Text><Text style={s.stepBody}>{body}</Text></View></View>)}</View>}
      {!compact&&<View style={s.footer}><Text style={s.footerText}>A little patience. A little point.</Text><Text style={s.footerText}>MADE FOR YOUR FIRST SOLVE  ↗</Text></View>}
    </ScrollView>
    <Modal visible={help} transparent animationType="fade" onRequestClose={()=>setHelp(false)}><View style={s.modalShade}><ScrollView style={{width:'100%',maxWidth:470,maxHeight:'95%',backgroundColor:'#FCFDF8',borderRadius:22}} contentContainerStyle={s.modal}><Text style={s.panelTitle}>Set yourself up for a solve.</Text><Text style={s.panelBody}>1. Prop up your phone with the screen facing you. The front camera gives you both hands back.{ '\n\n'}2. Use a regular six-color 3×3 in bright, even light. Keep fingers near the edges.{ '\n\n'}3. Start with one complete face in view and pause until it is captured. Then turn the whole cube a little, pause, and show neighboring faces together. Keep the layers still.{ '\n\n'}4. Follow one arrow, then pause. If the view gets unclear, tilt the cube so we can catch up.{ '\n\n'}Camera images are processed on your device and aren’t uploaded.</Text>{Platform.OS==='web'&&active&&<View style={{gap:10}}><Text style={s.panelBody}>Scan stuck at zero? Try the back camera in even light. You can save a camera photo to help diagnose it. The photo stays on your device; nothing is uploaded.</Text><Action label="Save a camera photo" secondary onPress={()=>{setSaveFrameRequest(n=>n+1);setHelp(false);}}/></View>}<Action label="Got it" secondary onPress={()=>setHelp(false)}/></ScrollView></View></Modal>
    {photo&&<PhotoImport onClose={()=>setPhoto(false)} onGuide={guidePhoto} onScan={()=>{setPhoto(false);start();}}/>}
    {stage==='picture'&&view.picture&&<PhotoImport cameraRead={view.picture} onClose={closePicture} onRetake={()=>start('diagram')} onGuide={guidePhoto} onScan={()=>start()}/>}
  </SafeAreaView>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#F5F6F0'},shell:{width:'100%',maxWidth:1440,alignSelf:'center',paddingHorizontal:22,paddingBottom:24},
  nav:{height:88,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#E0E5DA'},brand:{flexDirection:'row',alignItems:'center',gap:12},mark:{width:30,height:30,flexDirection:'row',flexWrap:'wrap',gap:3},markCell:{width:8,height:8,backgroundColor:ink,borderRadius:1.5},brandText:{fontSize:30,fontWeight:'800',letterSpacing:-1.6,color:ink},brandDivider:{height:20,width:1,backgroundColor:'#CDD5C8',marginHorizontal:4},brandDescriptor:{fontSize:9,fontWeight:'600',letterSpacing:1.5,color:muted},navLinks:{flexDirection:'row',alignItems:'center',gap:22},activeNav:{paddingVertical:10,borderBottomWidth:2,borderColor:ink},navText:{fontSize:12,fontWeight:'600',color:ink},helpButton:{flexDirection:'row',gap:8,paddingVertical:12},helpNav:{color:muted,fontSize:12},
  headingRow:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:42,marginBottom:32,gap:24},eyebrow:{fontSize:9,fontWeight:'700',letterSpacing:1.65,color:muted},title:{fontSize:48,lineHeight:53,fontWeight:'600',letterSpacing:-2,color:ink,marginTop:13},headingNote:{paddingBottom:5},noteText:{color:muted,fontSize:13,lineHeight:22},privacy:{flexDirection:'row',gap:7,alignItems:'center'},privacyText:{color:ink,fontSize:10,marginTop:13},dot:{width:6,height:6,borderRadius:3,backgroundColor:'#759C4D'},
  main:{gap:24},viewerColumn:{minWidth:0},viewer:{backgroundColor:'#17211C',borderRadius:22,overflow:'hidden',position:'relative'},illustration:{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,alignItems:'center',justifyContent:'center',paddingTop:16},orbit:{position:'absolute',width:365,height:365,borderWidth:1,borderColor:'#2B382F',borderRadius:183},orbitInner:{position:'absolute',width:290,height:290,borderWidth:1,borderColor:'#27342B',borderRadius:145},viewerTop:{position:'absolute',top:22,left:22,right:22,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},liveChip:{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:11,paddingVertical:8,borderRadius:20,backgroundColor:'#233228E6'},liveText:{fontSize:8,letterSpacing:1.4,color:'#D6E5D8',fontWeight:'600'},viewerTag:{color:'#9CAA9E',fontSize:10,letterSpacing:2},viewerBottom:{position:'absolute',bottom:22,left:20,right:20,alignItems:'center',padding:12,borderRadius:15,backgroundColor:'#17211CD9'},viewerCaption:{color:'#E6EBE0',fontSize:13,fontWeight:'500'},viewerSub:{color:'#95A297',fontSize:9,letterSpacing:.5,marginTop:7},viewerToolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:16,gap:8},toolbarLabel:{fontSize:9,color:muted},switchButton:{minHeight:44,justifyContent:'center',paddingVertical:8,paddingHorizontal:10},switchText:{color:ink,fontSize:10,fontWeight:'500'},reticle:{position:'absolute',top:'25%',left:'25%',width:'50%',height:'50%'},reticleCorner:{position:'absolute',width:20,height:20,borderLeftWidth:2,borderTopWidth:2,borderColor:'#D1F58A70'},confirmation:{position:'absolute',top:70,alignSelf:'center',backgroundColor:lime,paddingVertical:10,paddingHorizontal:19,borderRadius:22},confirmText:{fontSize:15,fontWeight:'700',color:ink},
  side:{backgroundColor:'#FCFDF8',borderWidth:1,borderColor:'#DFE5D7',borderRadius:22,padding:28,minHeight:490,marginBottom:50},sideTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},stepChip:{borderRadius:20,backgroundColor:'#EEF2E7',paddingHorizontal:10,paddingVertical:6},stepChipText:{color:muted,fontSize:9,letterSpacing:1},panelTitle:{fontSize:29,lineHeight:35,fontWeight:'600',letterSpacing:-1,color:ink,marginTop:22},panelBody:{fontSize:13,lineHeight:22,color:muted,marginTop:14},scanProgress:{marginTop:29,paddingTop:21,borderTopWidth:1,borderColor:'#E5E9DF'},progressHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},progressLabel:{fontSize:8,letterSpacing:1.6,color:muted,fontWeight:'600'},progressCount:{fontSize:12,fontWeight:'600',color:ink},faces:{flexDirection:'row',justifyContent:'space-between',marginTop:17,gap:10},faceDot:{width:34,height:34,borderRadius:8,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#14241A15'},faceCheck:{color:ink,fontSize:18,fontWeight:'700'},scanHint:{fontSize:10,color:muted,marginTop:12},action:{backgroundColor:lime,minHeight:54,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:17},secondary:{backgroundColor:'#EDF1E6',borderWidth:1,borderColor:'#D9E1CE'},actionText:{color:ink,fontSize:13,fontWeight:'600',flex:1},actionArrow:{fontSize:21,color:ink},permissionNote:{fontSize:9,color:muted,textAlign:'center',marginTop:13,lineHeight:16},rescan:{padding:13,alignItems:'center'},rescanText:{fontSize:11,color:muted},thinking:{flexDirection:'row',alignItems:'center',gap:12,marginTop:25},reveal:{flexDirection:'row',alignItems:'center',gap:13,marginTop:25},centerSwatch:{width:36,height:36,borderRadius:8},revealTitle:{fontSize:13,color:ink,fontWeight:'600'},revealBody:{fontSize:10,color:muted,marginTop:5},stats:{marginTop:32,paddingVertical:23,flexDirection:'row',gap:32,borderTopWidth:1,borderBottomWidth:1,borderColor:'#E5E9DF'},statValue:{fontSize:31,color:ink,fontWeight:'600',letterSpacing:-1},statLabel:{fontSize:8,color:muted,letterSpacing:1.1,marginTop:7},statDivider:{width:1,backgroundColor:'#E5E9DF'},
  steps:{flexDirection:'row',gap:38,marginTop:1,paddingVertical:28,borderTopWidth:1,borderColor:'#E0E5DA'},step:{flex:1,flexDirection:'row',gap:15},stepNumber:{fontSize:11,color:'#7A8B6E',paddingTop:4},stepTitle:{fontSize:13,fontWeight:'600',color:ink},stepBody:{fontSize:11,lineHeight:18,color:muted,marginTop:7},footer:{flexDirection:'row',justifyContent:'space-between',paddingTop:20,borderTopWidth:1,borderColor:'#E0E5DA',gap:10},footerText:{fontSize:8,color:'#8B9688',letterSpacing:.6},modalShade:{flex:1,backgroundColor:'#101B17B0',alignItems:'center',justifyContent:'center',padding:24},modal:{backgroundColor:'#FCFDF8',padding:28,borderRadius:22,maxWidth:470,width:'100%',gap:22},
});



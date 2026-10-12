import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {rotateGrid} from '../core/cube';
import {stateAtStep} from '../core/cubePreview';
import {COLOR_HEX,CubeState,Face,FACES,Move,SolverAdapter} from '../core/types';
import {assemblePhoto,FACE_NAMES,PANEL_LABELS,PhotoLayout,PhotoRead} from '../photo/model';
import {readPhoto} from '../photo/readPhoto';
import {createSolver} from '../solver/createSolver';
import {CubePreview} from './CubePreview';

function Button({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:.45}]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
export function PhotoImport({onClose,onGuide,onScan,cameraRead,onRetake}:{onClose:()=>void;onGuide:(state:CubeState)=>void;onScan:()=>void;cameraRead?:PhotoRead;onRetake?:()=>void}){
  const compact=useWindowDimensions().width<600;
  const [asset,setAsset]=useState<ImagePicker.ImagePickerAsset|null>(null),[layout,setLayout]=useState<PhotoLayout>(3);
  const [read,setRead]=useState<PhotoRead|null>(cameraRead??null),[labels,setLabels]=useState([...(cameraRead?.labels??PANEL_LABELS)]),[turns,setTurns]=useState([0,0,0,0,0,0]);
  const [busy,setBusy]=useState(false),[picking,setPicking]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<number|null>(null);
  const [solution,setSolution]=useState<{state:CubeState;moves:Move[]}|null>(null),[step,setStep]=useState(0);
  const request=useRef(0),controller=useRef<AbortController|null>(null),solver=useRef<SolverAdapter|null>(null),alive=useRef(true),uri=useRef('');
  const scroll=useRef<ScrollView>(null);
  const release=(value:string)=>{if(value.startsWith('blob:')&&typeof URL!=='undefined')URL.revokeObjectURL(value);};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;controller.current?.abort();solver.current?.dispose();release(uri.current);};},[]);
  const resetSolution=()=>{request.current++;solver.current?.dispose();solver.current=null;setSolution(null);setStep(0);};
  const analyze=async(next:ImagePicker.ImagePickerAsset,columns:PhotoLayout)=>{
    resetSolution();controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const id=request.current;setBusy(true);setError('');setRead(null);setEditing(null);setTurns([0,0,0,0,0,0]);setLabels([...PANEL_LABELS]);
    try{const result=await readPhoto(next.uri,columns,abort.signal);if(id===request.current&&alive.current)setRead(result);}
    catch(e){if(!abort.signal.aborted&&id===request.current&&alive.current)setError(e instanceof Error?e.message:'This picture could not be read.');}
    finally{if(id===request.current&&alive.current)setBusy(false);}
  };
  const choose=async()=>{
    if(picking)return;setPicking(true);
    try{
      // Invoke the system picker directly from the tap, including on mobile web.
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,allowsMultipleSelection:false,quality:1});
      if(!alive.current){if(!result.canceled)release(result.assets[0]!.uri);return;}
      if(result.canceled)return;
      const next=result.assets[0]!;
      if((next.fileSize??0)>25*1024*1024||next.width*next.height>36_000_000){release(next.uri);throw new Error('Choose a picture smaller than 25 MB and 36 megapixels.');}
      if(!next.width||!next.height){release(next.uri);throw new Error('This image format could not be opened. Try a JPEG or PNG.');}
      release(uri.current);uri.current=next.uri;setAsset(next);await analyze(next,layout);
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'The photo picker could not open. Try again.');}
    finally{if(alive.current)setPicking(false);}
  };
  const changeLayout=(columns:PhotoLayout)=>{if(columns===layout)return;setLayout(columns);if(asset)void analyze(asset,columns);};
  const validation=read?assemblePhoto(read.panels,labels,turns):null;
  const solve=async()=>{
    if(!validation?.valid)return;
    resetSolution();const id=request.current;setBusy(true);setError('');
    try{const adapter=createSolver();solver.current=adapter;const result=await adapter.solve(validation.state);
      if(id===request.current&&alive.current){setSolution({state:validation.state,moves:result.moves});setStep(0);scroll.current?.scrollTo({y:0,animated:false});}
    }catch(e){if(id===request.current&&alive.current)setError(e instanceof Error?e.message:'The solver could not start.');}
    finally{if(id===request.current&&alive.current){setBusy(false);solver.current?.dispose();solver.current=null;}}
  };
  const move=solution?.moves[step],face=move?.[0] as Face|undefined;
  const stepState=useMemo(()=>solution?stateAtStep(solution.state,solution.moves,step):null,[solution,step]);
  const guide=()=>{
    if(stepState){onGuide(stepState);}
    else if(validation?.valid)onGuide(validation.state);
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={s.page}>
    <View style={s.nav}><Text style={s.brand}>point. <Text style={s.small}>/ {cameraRead?'CAMERA PICTURE':'PHOTO SOLVER'}</Text></Text><Button label="Close" secondary onPress={onClose}/></View>
    <ScrollView ref={scroll} contentContainerStyle={s.content}>
      <Text style={s.kicker}>{solution?'YOUR CUBE IN 3D':cameraRead?'SIX PANELS CAPTURED':'FROM PICTURE TO PLAN'}</Text>
      <Text accessibilityRole="header" style={s.title}>{solution?'One turn at a time.':cameraRead?'Picture captured.':'Solve from a picture.'}</Text>
      {!solution&&<>
        {cameraRead?<><Text style={s.body}>{cameraRead.layout==='net'?'Unfolded cube captured. Face names come from the layout: Up above Front, Left–Front–Right–Back across, and Down below Front. Check the colors and orientation before solving.':'The camera read all six grids. Panels below follow your picture from left to right, then top to bottom. Check their names before solving.'}</Text><Button label="Scan picture again" secondary onPress={onRetake??onClose}/></>:<>
        <Text style={s.body}>Choose a picture showing all six faces in separate, evenly spaced panels. We’ll read the colors on your device.</Text>
        <View style={s.section}><Text style={s.label}>PICTURE LAYOUT</Text><View style={s.row}>
          <Button label="3 across · 2 rows" secondary={layout!==3} disabled={busy||picking} onPress={()=>changeLayout(3)}/>
          <Button label="2 across · 3 rows" secondary={layout!==2} disabled={busy||picking} onPress={()=>changeLayout(2)}/>
        </View><Text style={s.note}>Panels are read left to right, then top to bottom. A single view of a cube cannot show all six faces.</Text></View>
        <Button label={asset?'Choose another picture':'Choose cube picture'} onPress={()=>void choose()} disabled={busy||picking}/>
        </>}
        {asset&&<View style={s.preview}><Image source={{uri:asset.uri}} accessibilityLabel="Selected six-face cube picture" style={{width:'100%',aspectRatio:asset.width/asset.height}} resizeMode="contain"/>{Array.from({length:6},(_,i)=><View key={i} style={[s.number,{left:`${(i%layout)*100/layout}%`,top:`${Math.floor(i/layout)*100/(6/layout)}%`}]}><Text style={s.numberText}>{i+1}</Text></View>)}</View>}
        {read&&<>
          <Text style={s.label}>CHECK THE SIX FACES</Text>
          <Text style={s.body}>Match these grids to your picture. Check each name against the picture’s labels and use ↻ if a face needs rotating. Text labels aren’t read automatically.</Text>
          <View style={s.cards}>{read.panels.map((panel,i)=><View key={i} style={s.card}>
            <Text style={s.panelNumber}>PANEL {i+1}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Change panel ${i+1} face name, currently ${FACE_NAMES[labels[i]!]}`} disabled={busy} onPress={()=>setEditing(editing===i?null:i)} style={s.nameButton}><Text style={s.faceName}>{FACE_NAMES[labels[i]!]} ▾</Text></Pressable>
            {panel.face?<View style={s.grid} accessibilityLabel={`Panel ${i+1} colors: ${rotateGrid(panel.face.colors,turns[i]!).join(', ')}`}>{rotateGrid(panel.face.colors,turns[i]!).map((color,j)=><View key={j} style={[s.square,{backgroundColor:COLOR_HEX[color]}]}/>)}</View>:<Text style={s.body}>Face not detected</Text>}
            {panel.face&&<Button label={`↻ Rotate ${FACE_NAMES[labels[i]!]}`} secondary disabled={busy} onPress={()=>{resetSolution();setTurns(t=>t.map((v,j)=>j===i?(v+1)%4:v));}}/>}
            {panel.issue&&<Text style={s.issue}>{panel.issue}</Text>}
            {editing===i&&<View style={s.names}>{FACES.map(f=><Button key={f} label={FACE_NAMES[f]} secondary={f!==labels[i]} onPress={()=>{resetSolution();setLabels(l=>l.map((v,j)=>j===i?f:v));setEditing(null);}}/>)}</View>}
          </View>)}</View>
          <Text style={s.note}>View each face from outside the cube. Front, Right, Left and Back have Up above them. Up has Back above it; Down has Front above it.</Text>
          {validation&&!validation.valid&&<View accessibilityRole="alert" style={s.problem}><Text style={s.problemTitle}>This picture needs a check</Text><Text style={s.body}>{validation.reason}</Text></View>}
          {validation?.valid&&<View style={s.valid}><Text style={s.problemTitle}>✓ All 54 squares form a valid cube</Text><Text style={s.body}>Face names and rotations look right? Get your steps or bring the matching cube into the camera.</Text></View>}
          <Button label="Get solution steps" disabled={busy||!validation?.valid} onPress={()=>void solve()}/>
          <Button label="Guide this cube with camera" secondary disabled={busy||!validation?.valid} onPress={guide}/>
        </>}
      </>}
      {solution&&<>
        <Text style={s.body}>Keep the <Text style={s.bold}>{solution.state.centers.U} center on top</Text> and the <Text style={s.bold}>{solution.state.centers.F} center facing you</Text>. Keep that orientation between turns.</Text>
        <View style={[s.turnCard,compact&&{padding:12,gap:12}]}>
          <Text style={s.label}>{move?`TURN ${step+1} OF ${solution.moves.length}`:solution.moves.length?'INSTRUCTIONS COMPLETE':'PICTURE ALREADY SOLVED'}</Text>
          {move&&face?<><View style={s.center}><View style={[s.swatch,{backgroundColor:COLOR_HEX[solution.state.centers[face]]}]}/><Text style={s.faceName}>{FACE_NAMES[face]} face · {move.endsWith("'")?'counterclockwise':'clockwise'}</Text></View><Text style={s.note}>Turn only this layer, one quarter turn. The model shows the motion from outside that face.</Text></>:<Text style={s.turnText}>{solution.moves.length?'You’ve reached the end of the steps. Use the camera to check your physical cube.':'The six faces in this picture are solved.'}</Text>}
          {stepState&&<CubePreview state={stepState} move={move} compact={compact}/>}
        </View>
        <Text style={s.note}>Match your cube to Before, then make the highlighted turn. The model updates when you advance. Going back shows an earlier state; it does not undo your physical turn.</Text>
        <View style={s.row}><Button label="Previous" secondary disabled={step===0} onPress={()=>setStep(n=>n-1)}/>{move&&<Button label="I made this turn →" onPress={()=>setStep(n=>n+1)}/>}</View>
        {move?<Button label="Continue with camera" secondary onPress={guide}/>:<Button label="Check my cube with camera" onPress={onScan}/>}
        <View style={s.section}><Text style={s.label}>ALL TURNS · OPTIONAL NOTATION</Text><Text selectable style={s.notation}>{solution.moves.join('  ')||'No turns needed.'}</Text></View>
        <Button label="Back to picture" secondary onPress={resetSolution}/>
      </>}
      {busy&&<View accessibilityLiveRegion="polite" style={s.loading}><ActivityIndicator color="#17271F"/><Text style={s.body}>{read?'Finding and verifying your solution…':'Reading the six panels…'}</Text></View>}
      {!!error&&<View accessibilityRole="alert" style={s.problem}><Text style={s.body}>{error}</Text>{asset&&!busy&&<Button label="Read this picture again" secondary onPress={()=>void analyze(asset,layout)}/>}</View>}
      <Text style={s.privacy}>LOCAL PROCESSING · YOUR PICTURE ISN’T UPLOADED</Text>
    </ScrollView>
  </SafeAreaView></Modal>;
}
const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#F5F6F0'},nav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:10,borderBottomWidth:1,borderColor:'#DEE5D7'},brand:{fontSize:25,fontWeight:'700',color:'#17271F'},small:{fontSize:9,letterSpacing:1.3,color:'#67756A'},content:{width:'100%',maxWidth:760,alignSelf:'center',padding:22,gap:16,paddingBottom:44},kicker:{fontSize:10,letterSpacing:1.6,color:'#64745C',marginTop:10},title:{fontSize:34,lineHeight:39,letterSpacing:-1.3,fontWeight:'600',color:'#17271F'},body:{fontSize:14,lineHeight:22,color:'#526155'},bold:{fontWeight:'700',color:'#17271F'},label:{fontSize:10,fontWeight:'700',letterSpacing:1.2,color:'#526155'},section:{gap:12,paddingVertical:10},row:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{minHeight:46,justifyContent:'center',alignItems:'center',backgroundColor:'#D1F58A',borderRadius:10,paddingVertical:11,paddingHorizontal:15},buttonText:{fontSize:13,fontWeight:'600',color:'#17271F'},secondary:{backgroundColor:'#E8EEDF',borderWidth:1,borderColor:'#D7DFCE'},note:{fontSize:12,lineHeight:19,color:'#667466'},preview:{borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:'#D7DFCE',backgroundColor:'#FFF'},number:{position:'absolute',margin:4,width:22,height:22,borderRadius:7,backgroundColor:'#17271F',alignItems:'center',justifyContent:'center'},numberText:{fontSize:11,color:'white',fontWeight:'700'},cards:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:14},card:{width:'48%',borderWidth:1,borderColor:'#DCE3D3',backgroundColor:'#FCFDF8',borderRadius:14,padding:12,gap:10},panelNumber:{fontSize:9,letterSpacing:1.3,color:'#74816E'},nameButton:{minHeight:44,justifyContent:'center'},faceName:{fontSize:18,fontWeight:'600',color:'#17271F'},grid:{width:104,height:104,flexDirection:'row',flexWrap:'wrap',gap:4,backgroundColor:'#17271F',padding:4,borderRadius:7,alignSelf:'center'},square:{width:29.3,height:29.3,borderRadius:3},issue:{fontSize:12,lineHeight:18,color:'#8D3B23'},names:{gap:6},problem:{backgroundColor:'#FFF0E7',padding:16,borderWidth:1,borderColor:'#E7C4AE',borderRadius:13,gap:8},problemTitle:{fontSize:15,fontWeight:'600',color:'#17271F'},valid:{backgroundColor:'#E9F3DC',borderRadius:13,padding:16,gap:8},loading:{gap:8,alignItems:'center',padding:18},privacy:{fontSize:9,letterSpacing:1.1,textAlign:'center',color:'#73806C',marginTop:12},turnCard:{padding:26,backgroundColor:'#FCFDF8',borderRadius:20,borderWidth:1,borderColor:'#DCE3D3',gap:20,alignItems:'center'},arrow:{fontSize:110,lineHeight:125,color:'#47723D'},center:{flexDirection:'row',gap:10,alignItems:'center'},swatch:{height:26,width:26,borderRadius:6,borderWidth:1,borderColor:'#18271930'},turnText:{fontSize:22,lineHeight:30,color:'#17271F',textAlign:'center'},notation:{fontSize:16,lineHeight:28,color:'#17271F'},
});

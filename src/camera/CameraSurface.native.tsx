import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,StyleSheet,View} from 'react-native';
import {Camera,useCameraDevice,useCameraPermission,useFrameOutput,useAsyncRunner} from 'react-native-vision-camera';
import {scheduleOnRN} from 'react-native-worklets';
import {createCubeVision} from '../../modules/cube-vision/src';
import {CameraSurfaceProps} from './types';
import {CubeObservation} from '../core/types';

// Stable object identities keep VisionCamera from rebuilding its output on each observation.
const CUBE_RESOLUTION={width:960,height:720},PICTURE_RESOLUTION={width:1280,height:960};

export default function CameraSurface(props:CameraSurfaceProps){
  const callbacks=useRef(props);callbacks.current=props;
  const {hasPermission,requestPermission}=useCameraPermission();
  const device=useCameraDevice(props.facing),runner=useAsyncRunner();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const layout=useRef({width:1,height:1});
  const detector=useMemo(()=>createCubeVision(),[]);
  const epoch=useRef({key:'',value:0});
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current.value++;};},[]);
  const key=`${props.facing}:${props.active}:${foreground}:${!!props.picture}`;
  if(epoch.current.key!==key)epoch.current={key,value:epoch.current.value+1};
  const currentEpoch=epoch.current.value;
  const picture=!!props.picture;
  useEffect(()=>{
    if(props.active&&!hasPermission)void requestPermission().then(ok=>{if(!ok)callbacks.current.onError('Camera access is off. Enable it in Settings, then try again.');}).catch(e=>callbacks.current.onError(String(e)));
  },[props.active,hasPermission,requestPermission]);
  useEffect(()=>{const sub=AppState.addEventListener('change',s=>{callbacks.current.onSuspend();setForeground(s==='active');});return()=>sub.remove();},[]);
  const receive=useCallback((json:string,timestamp:number,requestEpoch:number)=>{
    if(!mounted.current||requestEpoch!==epoch.current.value||!callbacks.current.active||AppState.currentState!=='active'||Date.now()-timestamp>(callbacks.current.picture?2000:1000))return;
    const result=JSON.parse(json);
    callbacks.current.onObservation({...result,timestamp,transform:{frameWidth:result.width,frameHeight:result.height,previewWidth:layout.current.width,previewHeight:layout.current.height,rotation:0,mirrored:false,fit:'contain'}} as CubeObservation);
  },[]);
  const fail=useCallback((message:string,requestEpoch?:number)=>{if(mounted.current&&(requestEpoch===undefined||requestEpoch===epoch.current.value))callbacks.current.onError(message);},[]);
  const output=useFrameOutput({
    targetResolution:props.picture?PICTURE_RESOLUTION:CUBE_RESOLUTION,pixelFormat:'rgb',enablePhysicalBufferRotation:true,enablePreviewSizedOutputBuffers:false,
    onFrame(frame){
      'worklet';
      const capturedAt=Date.now();
      const accepted=runner.runAsync(()=>{
        'worklet';
        try{
          if(!frame.hasPixelBuffer)throw new Error('This camera did not provide readable pixels.');
          const format=frame.pixelFormat;
          if(format!=='rgb-bgra-8-bit'&&format!=='rgb-rgba-8-bit')throw new Error('Unsupported camera pixel format: '+format);
          const rotation=frame.orientation==='right'?270:frame.orientation==='left'?90:frame.orientation==='down'?180:0;
          const json=detector.detect(frame.getPixelBuffer(),frame.width,frame.height,frame.bytesPerRow,format==='rgb-bgra-8-bit',rotation,frame.isMirrored,picture);
          scheduleOnRN(receive,json,capturedAt,currentEpoch);
        }catch(e){scheduleOnRN(fail,String(e),currentEpoch);}finally{frame.dispose();}
      });
      if(!accepted)frame.dispose();
    },
  });
  const outputs=useMemo(()=>[output],[output]);
  useEffect(()=>{if(props.active&&hasPermission&&!device)props.onError('This camera is unavailable. Try the other camera.');},[props.active,hasPermission,device]);
  if(!hasPermission||!device)return <View style={StyleSheet.absoluteFill}/>;
  return <Camera style={StyleSheet.absoluteFill} device={device} isActive={props.active&&foreground} outputs={outputs} mirrorMode="off" orientationSource="interface" resizeMode="contain"
    onLayout={e=>{layout.current=e.nativeEvent.layout;}} onPreviewStarted={()=>callbacks.current.onStatus('Camera ready')} onError={e=>fail(e.message)}/>;
}

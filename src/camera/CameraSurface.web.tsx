import React,{useEffect,useRef} from 'react';
import { CameraSurfaceProps } from './types';
import { CubeObservation } from '../core/types';
import { reliableFace } from '../core/scanner';
import { VISION_VERSION } from './visionVersion';

export default function CameraSurface(props:CameraSurfaceProps){
  const video=useRef<HTMLVideoElement>(null),callbacks=useRef(props);callbacks.current=props;
  const savedRequest=useRef(props.saveFrameRequest);
  useEffect(()=>{
    if(!props.saveFrameRequest||savedRequest.current===props.saveFrameRequest)return;
    savedRequest.current=props.saveFrameRequest;
    const element=video.current;
    if(!element?.videoWidth||element.readyState<2){callbacks.current.onStatus('Wait for the camera before saving a photo.');return;}
    const snapshot=document.createElement('canvas');snapshot.width=element.videoWidth;snapshot.height=element.videoHeight;
    snapshot.getContext('2d')!.drawImage(element,0,0);
    snapshot.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`point-scan-${Date.now()}.jpg`;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    },'image/jpeg',.95);
  },[props.saveFrameRequest]);
  useEffect(()=>{
    if(!props.active)return;
    let cancelled=false,stream:MediaStream|undefined,worker:Worker|undefined,busy=false,ready=false,timer:ReturnType<typeof setInterval>|undefined;
    let sequence=0,pending=0,lastFrame=-1,frameEpoch=0,pendingEpoch=0,watchdog:ReturnType<typeof setTimeout>|undefined;
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    const fail=(message:string)=>{if(!cancelled)callbacks.current.onError(message);};
    const release=()=>{stream?.getTracks().forEach(t=>t.stop());stream=undefined;};
    const init=async()=>{
      try{
        if(!window.isSecureContext)throw new Error('Camera access needs a secure connection. Open the HTTPS link.');
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('This browser does not provide camera access. Try Chrome or Safari.');
        callbacks.current.onStatus('Waiting for camera permission');
        watchdog=setTimeout(()=>fail('Camera permission is still pending. Allow the camera in your browser, then try again.'),30000);
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:props.facing==='front'?'user':'environment'},width:{ideal:1280},height:{ideal:960}}});
        clearTimeout(watchdog);
        if(cancelled){release();return;}
        const element=video.current;if(!element)return;
        element.srcObject=stream;await element.play();
        if(cancelled){release();return;}
        for(const track of stream.getVideoTracks())track.onended=()=>fail('The camera disconnected. Reconnect it and try again.');
        callbacks.current.onStatus('Preparing the cube detector');
        worker=new Worker('/vision.worker.js?v='+VISION_VERSION);
        watchdog=setTimeout(()=>fail('The cube detector could not load. Check the connection and try again.'),45000);
        worker.onmessage=({data})=>{
          if(cancelled)return;
          if(data.type==='ready'){clearTimeout(watchdog);ready=true;callbacks.current.onStatus('Looking for a 3 × 3 face');return;}
          if(data.type==='error'){busy=false;fail('Cube detector: '+data.message);return;}
          if(data.type==='observation'&&data.id===pending){
            busy=false;clearTimeout(watchdog);
            if(document.hidden||pendingEpoch!==frameEpoch)return;
            if(performance.now()-data.timestamp>1000){callbacks.current.onStatus('Scanning is too slow. Try the back camera with a plain background.');return;}
            const rect=element.getBoundingClientRect();
            const count=data.faces.filter(reliableFace).length;
            callbacks.current.onStatus(count?`${count} face${count===1?'':'s'} in view · Hold still`:data.faces.length?'Grid found · Adjust the light':'Looking for a 3 × 3 face');
            callbacks.current.onObservation({...data,transform:{frameWidth:canvas.width,frameHeight:canvas.height,previewWidth:rect.width,previewHeight:rect.height,rotation:0,mirrored:false,fit:'contain'}} as CubeObservation);
          }
        };
        worker.onerror=()=>fail('The cube detector is unavailable. Reload the app and try again.');
        worker.postMessage({type:'init'});
        timer=setInterval(()=>{
          if(!ready||busy||document.hidden||!context||element.readyState<2||!element.videoWidth)return;
          if(element.currentTime===lastFrame)return;lastFrame=element.currentTime;
          const factor=Math.min(1,640/Math.max(element.videoWidth,element.videoHeight));
          const width=Math.round(element.videoWidth*factor),height=Math.round(element.videoHeight*factor);
          if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
          try{
            context.drawImage(element,0,0,width,height);
            const data=context.getImageData(0,0,width,height),id=++sequence;
            pending=id;pendingEpoch=frameEpoch;busy=true;
            watchdog=setTimeout(()=>fail('Camera processing stopped responding. Try again.'),10000);
            worker!.postMessage({type:'frame',id,width,height,timestamp:performance.now(),buffer:data.data.buffer},[data.data.buffer]);
          }catch(error){busy=false;clearTimeout(watchdog);fail('Could not read camera frames. Restart the camera or try Safari.');}
        },100);
      }catch(error){
        release();const e=error as Error;
        fail(e.name==='NotAllowedError'?'Camera access is off. Allow camera access in your browser settings, then try again.':e.name==='NotFoundError'?'No camera was found. Connect a camera and try again.':e.message);
      }
    };
    const visibility=()=>{frameEpoch++;callbacks.current.onSuspend();if(!document.hidden)callbacks.current.onStatus('Camera ready');};
    document.addEventListener('visibilitychange',visibility);void init();
    return()=>{cancelled=true;clearInterval(timer);clearTimeout(watchdog);worker?.terminate();release();if(video.current)video.current.srcObject=null;document.removeEventListener('visibilitychange',visibility);};
  },[props.active,props.facing]);
  return <video ref={video} autoPlay playsInline muted aria-label="Live unmirrored cube camera" style={{width:'100%',height:'100%',position:'absolute',inset:0,objectFit:'contain',transform:'none'}}/>;
}

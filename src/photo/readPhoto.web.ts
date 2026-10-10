import {VISION_VERSION} from '../camera/visionVersion';
import {PhotoLayout,PhotoRead,reviewPanel} from './model';
import {ObservedFace} from '../core/types';

export async function readPhoto(uri:string,columns:PhotoLayout,signal:AbortSignal):Promise<PhotoRead> {
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('The image took too long to open. Try a smaller JPEG or PNG.')),15000);
    const abort=()=>finish(new Error('Photo reading cancelled.'));
    const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;error?reject(error):resolve();};
    image.onload=()=>finish();image.onerror=()=>finish(new Error('This image could not be opened. Try a JPEG or PNG.'));
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}image.src=uri;
  });
  if(signal.aborted)throw new Error('Photo reading cancelled.');
  const scale=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  if(!canvas.width||!canvas.height)throw new Error('The image is empty.');
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image reading is unavailable in this browser.');
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  return new Promise<PhotoRead>((resolve,reject)=>{
    const worker=new Worker('/vision.worker.js?v='+VISION_VERSION);
    const timer=setTimeout(()=>finish(new Error('Photo reading took too long. Try a smaller picture.')),45000);
    const abort=()=>finish(new Error('Photo reading cancelled.'));
    const finish=(error?:Error,result?:PhotoRead)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result!);};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    worker.onerror=()=>finish(new Error('The photo detector could not load. Check your connection and try again.'));
    worker.onmessage=({data})=>{
      if(data.type==='ready')worker.postMessage({type:'photo',width:canvas.width,height:canvas.height,columns,buffer:pixels.data.buffer},[pixels.data.buffer]);
      if(data.type==='photo')finish(undefined,{panels:data.panels.map((faces:ObservedFace[])=>reviewPanel(faces)),processingMs:data.processingMs});
      if(data.type==='error')finish(new Error(data.message));
    };
    worker.postMessage({type:'init'});
  });
}

import {Images} from 'react-native-nitro-image';
import {createWorkletRuntime,scheduleOnRuntime,scheduleOnRN} from 'react-native-worklets';
import {createCubeVision} from '@point-scan-solve/cube-vision';
import {PhotoLayout,PhotoRead,reviewPanel} from './model';
import {ObservedFace} from '../core/types';

export async function readPhoto(uri:string,columns:PhotoLayout,signal:AbortSignal):Promise<PhotoRead> {
  const started=Date.now();
  const original=await Images.loadFromFileAsync(decodeURI(uri.replace(/^file:\/\//,'')));
  const scale=Math.min(1,1920/Math.max(original.width,original.height));
  // Render even at 1×: iOS crops raw CGImage pixels and would otherwise ignore EXIF orientation.
  const resized=await original.resizeAsync(Math.round(original.width*scale),Math.round(original.height*scale));
  const background=await Images.createBlankImageAsync(resized.width,resized.height,false,{r:1,g:1,b:1});
  const image=await background.renderIntoAsync(resized,0,0,resized.width,resized.height);
  const runtime=createWorkletRuntime({name:'Cube photo detector'}),detector=createCubeVision();
  const panels=[];
  for(let i=0;i<6;i++){
    if(signal.aborted)throw new Error('Photo reading cancelled.');
    const rows=6/columns,x=i%columns,y=Math.floor(i/columns);
    let tile=await image.cropAsync(Math.round(x*image.width/columns),Math.round(y*image.height/rows),Math.round((x+1)*image.width/columns),Math.round((y+1)*image.height/rows));
    const ratio=Math.min(1,640/Math.max(tile.width,tile.height));
    if(ratio<1)tile=await tile.resizeAsync(Math.round(tile.width*ratio),Math.round(tile.height*ratio));
    const pixels=await tile.toRawPixelDataAsync();
    if(pixels.pixelFormat!=='RGBA'&&pixels.pixelFormat!=='BGRA')throw new Error('This image format cannot be read. Save it as a JPEG or PNG and try again.');
    const faces=await new Promise<ObservedFace[]>((resolve,reject)=>{
      const timer=setTimeout(()=>finish('', 'The photo detector took too long. Try again.'),15000);
      const abort=()=>finish('', 'Photo reading cancelled.');
      const finish=(json:string,error?:string)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)reject(new Error(error));else{try{resolve(JSON.parse(json).faces);}catch{reject(new Error('The photo detector returned an unreadable result.'));}}};
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
      scheduleOnRuntime(runtime,()=>{
        'worklet';
        try{scheduleOnRN(finish,detector.detect(pixels.buffer,pixels.width,pixels.height,pixels.width*4,pixels.pixelFormat==='BGRA',0,false,false));}
        catch(e){scheduleOnRN(finish,'',String(e));}
      });
    });
    panels.push(reviewPanel(faces));
  }
  return {panels,processingMs:Date.now()-started};
}

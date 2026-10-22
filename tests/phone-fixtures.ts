import {Face} from '../src/core/types';
import {cameraDetailRegion,cameraFrameSize} from '../src/camera/frameSize';
import {projected} from './fixtures';
import {renderObservation} from './pixels';
import {laptopCube,sampleWebcam} from './laptop-fixtures';

export const phoneCube=laptopCube;
export const phoneViews:Face[][]=[['F','R','U'],['R','B','D'],['F','L','U'],['L','B','D']];
/** Labeled generated camera pixels, not a recording of the reported phone. */
export function phoneSource(faces:Face[],width=960,height=1280){
  const o=projected(phoneCube,faces,0),scale=width/1200;
  o.transform={...o.transform,frameWidth:width,frameHeight:height};
  o.faces.forEach(f=>f.quad=f.quad.map(p=>({x:width/2+(p.x-320)*scale,y:height/2+(p.y-240)*scale})) as typeof f.quad);
  return {observation:o,pixels:renderObservation(o,{inset:.025,rounded:.20}),width,height};
}
export function phoneRequest(source:ReturnType<typeof phoneSource>,limit=480){
  const {width,height}=cameraFrameSize(source.width,source.height,false,limit);
  const r=cameraDetailRegion(source.width,source.height,false,limit)!;
  return {type:'frame',id:1,timestamp:0,width,height,
    buffer:sampleWebcam(source.pixels,0,0,source.width,source.height,width,height,source.width).buffer,
    detail:{buffer:sampleWebcam(source.pixels,r.x,r.y,r.size,r.size,r.width,r.height,source.width).buffer,width:r.width,height:r.height,
      x:r.x*width/source.width,y:r.y*height/source.height,scaleX:r.size/r.width*width/source.width,scaleY:r.size/r.height*height/source.height}};
}

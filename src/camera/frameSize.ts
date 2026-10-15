/** Keep small physical sticker seams visible in portrait camera frames.
 * Preserve source detail; upscaling cannot restore missing sticker boundaries. */
export function cameraFrameSize(sourceWidth:number,sourceHeight:number,picture=false){
  const scale=Math.min(1,(picture?1280:960)/Math.max(sourceWidth,sourceHeight));
  return {width:Math.round(sourceWidth*scale),height:Math.round(sourceHeight*scale)};
}

/** A second view of the center of a landscape webcam frame, sampled directly
 * from the video. Cropping the already reduced frame would add no detail.
 * Full-frame detection always runs first, preserving pictures and edge views.
 */
export function cameraDetailRegion(sourceWidth:number,sourceHeight:number,picture=false){
  if(picture||sourceWidth<sourceHeight*1.2||sourceHeight<32)return undefined;
  const size=Math.min(sourceWidth,sourceHeight),{width,height}=cameraFrameSize(size,size);
  return {x:Math.floor((sourceWidth-size)/2),y:0,size,width,height};
}

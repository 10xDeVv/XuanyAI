/** Keep small physical sticker seams visible in portrait camera frames.
 * Preserve source detail; upscaling cannot restore missing sticker boundaries. */
export function cameraFrameSize(sourceWidth:number,sourceHeight:number,picture=false,physicalLimit=960){
  const scale=Math.min(1,(picture?1280:physicalLimit)/Math.max(sourceWidth,sourceHeight));
  return {width:Math.round(sourceWidth*scale),height:Math.round(sourceHeight*scale)};
}

/** A second view of the center of a landscape webcam frame, sampled directly
 * from the video. Cropping the already reduced frame would add no detail.
 * Full-frame detection always runs first, preserving pictures and edge views.
 */
export function cameraDetailRegion(sourceWidth:number,sourceHeight:number,picture=false,physicalLimit=960){
  if(picture||sourceWidth<sourceHeight*1.2||sourceHeight<32)return undefined;
  const size=Math.min(sourceWidth,sourceHeight),{width,height}=cameraFrameSize(size,size,false,physicalLimit);
  return {x:Math.floor((sourceWidth-size)/2),y:0,size,width,height};
}

/** Reduce work after a slow physical frame instead of discarding the same
 * expensive request forever. Never extend the freshness deadline. Keep the
 * chosen limit for this camera session to avoid resolution/count oscillation. */
export class CameraProcessingBudget {
  limit=960;
  observe(elapsedMs:number,picture=false){
    if(!picture&&Number.isFinite(elapsedMs)&&elapsedMs>700){
      this.limit=this.limit>640?640:480;
    }
  }
}

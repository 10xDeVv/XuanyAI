/** Keep small physical sticker seams visible in portrait camera frames.
 * Preserve source detail; upscaling cannot restore missing sticker boundaries. */
export function cameraFrameSize(sourceWidth:number,sourceHeight:number,picture=false,physicalLimit=960){
  const scale=Math.min(1,(picture?1280:physicalLimit)/Math.max(sourceWidth,sourceHeight));
  return {width:Math.round(sourceWidth*scale),height:Math.round(sourceHeight*scale)};
}

/** Preserve native sticker pixels in a bounded center region on phones and
 * laptops. A slower device gets a smaller search area, not smaller stickers.
 * The full view still runs first, retaining pictures and off-center cubes. */
export function cameraDetailRegion(sourceWidth:number,sourceHeight:number,picture=false,physicalLimit=960){
  if(picture||Math.min(sourceWidth,sourceHeight)<32)return undefined;
  const size=Math.min(sourceWidth,sourceHeight,physicalLimit,640);
  return {x:Math.floor((sourceWidth-size)/2),y:Math.floor((sourceHeight-size)/2),size,width:size,height:size};
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

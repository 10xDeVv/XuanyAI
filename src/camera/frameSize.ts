/** Keep small physical sticker seams visible in portrait camera frames.
 * Preserve source detail; upscaling cannot restore missing sticker boundaries. */
export function cameraFrameSize(sourceWidth:number,sourceHeight:number,picture=false){
  const scale=Math.min(1,(picture?1280:960)/Math.max(sourceWidth,sourceHeight));
  return {width:Math.round(sourceWidth*scale),height:Math.round(sourceHeight*scale)};
}

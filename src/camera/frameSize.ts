/** A six-face sheet needs more pixels than the one-to-three faces of a cube.
 * Preserve source detail; upscaling cannot restore missing sticker boundaries. */
export function cameraFrameSize(sourceWidth:number,sourceHeight:number,picture=false){
  const scale=Math.min(1,(picture?1280:640)/Math.max(sourceWidth,sourceHeight));
  return {width:Math.round(sourceWidth*scale),height:Math.round(sourceHeight*scale)};
}

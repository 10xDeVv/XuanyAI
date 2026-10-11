/** Camera results older than one second are discarded before physical tracking.
 * A single in-flight detector can nevertheless deliver consecutive usable frames
 * more than 800 ms apart. Allow its measured work plus scheduling margin, while
 * retaining the short dropout deadline for fast detectors. */
export function physicalFrameGapMs(processingMs:number,previousProcessingMs=0):number {
  const duration=Math.max(...[processingMs,previousProcessingMs].map(ms=>Number.isFinite(ms)&&ms>0?ms:0));
  return Math.max(800,Math.min(1200,duration+200));
}

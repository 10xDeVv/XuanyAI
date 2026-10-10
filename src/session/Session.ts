import { CubeScanner, reliableFace } from '../core/scanner';
import { CubeTracker, matchObservation } from '../core/tracker';
import { SOLVED,validateCube } from '../core/cube';
import { CubeObservation,CubeState,Move,FacePose,CubeColor,SolverAdapter,FACES,COLORS } from '../core/types';
import {DiagramScanner} from '../photo/DiagramScanner';
import {PhotoRead} from '../photo/model';

export type Stage='setup'|'scanning'|'picture'|'planning'|'guiding'|'recovering'|'verifying'|'solved'|'error';
export type SessionView={
  stage:Stage; message:string; captured:CubeColor[]; cube?:CubeState;
  nextMove?:Move; poses:FacePose[]; observation?:CubeObservation;
  movesDone:number; movesRemaining:number; corrections:number;
  confirmedAt:number; startedAt:number; elapsedMs:number;
  picture?:PhotoRead; diagramCount?:number;
};
const initial=():SessionView=>({stage:'setup',message:'Your cube. One turn at a time.',captured:[],poses:[],movesDone:0,movesRemaining:0,corrections:0,confirmedAt:0,startedAt:0,elapsedMs:0});
export class Session {
  private view=initial();
  private scanner=new CubeScanner();
  private diagram=new DiagramScanner();
  private captureMode:'auto'|'diagram'='auto';
  private tracker=new CubeTracker();
  private queue:Move[]=[];
  private epoch=0;
  private listeners=new Set<()=>void>();
  private lostSince:number|null=null;
  private verified=new Set<CubeColor>();
  private verificationCounts=new Map<CubeColor,{count:number;since:number;last:number}>();
  private lastObserved=-Infinity;
  constructor(private solver:SolverAdapter){}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.view;
  private update(patch:Partial<SessionView>){this.view={...this.view,...patch};for(const listener of this.listeners)listener();}
  start(mode:'auto'|'diagram'='auto'){this.captureMode=mode;this.epoch++;this.scanner.reset();this.diagram.reset();this.tracker.reset();this.queue=[];this.verified.clear();this.verificationCounts.clear();this.lastObserved=-Infinity;this.lostSince=null;this.view=initial();this.update({stage:'scanning',message:mode==='diagram'?'Point at a picture with all six panels. Keep the text upright and hold still.':'Rotate the whole cube slowly. Keep each layer in place.',startedAt:Date.now(),...(mode==='diagram'?{diagramCount:0}:{})});}
  rescan(){const {movesDone,corrections,startedAt}=this.view;this.start(this.captureMode);this.update({movesDone,corrections,startedAt});}
  startFromPhoto(cube:CubeState){
    const validity=validateCube(cube.facelets);
    if(!validity.valid)throw new Error(validity.reason);
    if(new Set(FACES.map(f=>cube.centers[f])).size!==6||FACES.some(f=>!COLORS.includes(cube.centers[f])))throw new Error('The photo needs six different center colors.');
    this.start();this.update({captured:FACES.map(f=>cube.centers[f])});void this.plan(cube);
  }
  suspend(){
    this.tracker.reset();this.verificationCounts.clear();this.verified.clear();this.lastObserved=-Infinity;
    // The user may turn unseen layers while the camera is paused or the app is backgrounded.
    if(!['setup','error','solved'].includes(this.view.stage))this.rescan();
    else this.update({poses:[],nextMove:undefined});
  }
  cameraError(message:string){this.epoch++;this.update({stage:'error',message,poses:[],nextMove:undefined});}
  observe(o:CubeObservation){
    if(o.timestamp<=this.lastObserved)return;const gap=o.timestamp-this.lastObserved;this.lastObserved=o.timestamp;
    if(['setup','picture','solved','error'].includes(this.view.stage))return;
    this.update({observation:o});
    if(this.view.stage==='scanning') {
      const diagram=this.diagram.observe(o);
      if(diagram.read){this.update({stage:'picture',picture:diagram.read,diagramCount:6,captured:[],poses:[],nextMove:undefined,message:'Picture captured. Check the six face names and colors.'});return;}
      if(this.captureMode==='diagram'||o.faces.length>3||o.largerGrid){
        // Keep picture resolution after discovering a sheet, even if a later
        // frame loses a few grids. Switching resolutions each frame loses detail.
        this.captureMode='diagram';
        this.scanner.reset();this.update({captured:[],diagramCount:diagram.count,message:diagram.message??(diagram.layout?'Six panels found. Hold still for a moment.':`Picture scan: ${diagram.count}/6 clear grids. Show a complete unfolded net or six panels in two or three columns. Keep the top of the picture upright.`)});return;
      }
      this.update({diagramCount:undefined});
      const scan=this.scanner.observe(o);this.update({captured:scan.captured,message:scan.message});
      if(scan.state)void this.plan(scan.state);
      return;
    }
    if(this.view.stage==='planning')return;
    // A diagram is input for a plan, never evidence that physical turns happened.
    if(o.faces.length>3||o.largerGrid){this.tracker.reset();this.verified.clear();this.verificationCounts.clear();this.update({poses:[],nextMove:undefined,message:'Bring your physical 3 × 3 cube into view to verify turns. Use picture scanning to read a diagram.'});return;}
    const cube=this.view.cube;if(!cube)return;
    if(this.view.stage==='verifying') {
      if(gap>=800||o.quality!=='good'){this.verificationCounts.clear();this.verified.clear();this.tracker.reset();}
      if(o.quality!=='good'){this.update({poses:[],message:'Keep two sides visible while we check the whole cube.'});return;}
      const poses=matchObservation(cube,o);
      if(!poses){if(o.faces.some(reliableFace))this.rescan();return;}
      // A uniform face alone cannot reveal a turn of that same face. Keep the
      // final check subject to the same distinguishing evidence as guidance.
      const tracking=this.tracker.observe(cube,o);
      if(tracking.status==='ambiguous'||tracking.status==='lost'||tracking.status==='move'){
        this.verificationCounts.clear();this.verified.clear();
        this.update({poses:[],message:'Tilt the cube to show two sides together. Then rotate slowly.'});return;
      }
      for(const color of this.verificationCounts.keys())if(!poses.some(p=>cube.centers[p.face]===color))this.verificationCounts.delete(color);
      for(const pose of poses) {
        const color=cube.centers[pose.face],old=this.verificationCounts.get(color);
        const current=old&&o.timestamp-old.last<800?{...old,count:old.count+1,last:o.timestamp}:{count:1,since:o.timestamp,last:o.timestamp};
        this.verificationCounts.set(color,current);
        if(current.count>=3&&o.timestamp-current.since>=220)this.verified.add(color);
      }
      if(this.verified.size===6&&tracking.status==='unchanged')this.update({stage:'solved',poses:[],message:'You did it. Every side, solved.',elapsedMs:Date.now()-this.view.startedAt});
      else this.update({message:`Looking good. Rotate once more to check every side (${this.verified.size}/6).`,poses});
      return;
    }
    const result=this.tracker.observe(cube,o);
    if(result.status==='lost'||result.status==='ambiguous') {
      this.lostSince??=o.timestamp;
      this.update({stage:'recovering',poses:[],nextMove:undefined,message:result.status==='ambiguous'?'Tilt the cube to show another side.':'Hold still and uncover the squares.'});
      if(o.timestamp-this.lostSince>5000&&o.faces.filter(reliableFace).length>=2)this.rescan();
      return;
    }
    this.lostSince=null;
    if(result.status==='settling'){this.update({poses:[],nextMove:undefined,message:'Hold for a moment…'});return;}
    if(result.status==='unchanged'){this.update({stage:'guiding',poses:result.poses,nextMove:this.queue[0],message:'Follow the arrow. Then pause.'});return;}
    if(result.status==='move'&&result.state&&result.move) {
      const correct=result.move===this.queue[0];
      this.update({cube:result.state,poses:[],nextMove:undefined,movesDone:this.view.movesDone+1,...(correct?{confirmedAt:Date.now()}:{})});
      if(correct){this.queue.shift();this.update({movesRemaining:this.queue.length});if(!this.queue.length)this.finishOrReplan(result.state);}
      else{this.update({corrections:this.view.corrections+1,message:'Different turn? That’s okay. Finding a new way.'});void this.plan(result.state);}
    }
  }
  private finishOrReplan(cube:CubeState){
    if(cube.facelets!==SOLVED){void this.plan(cube);return;}
    this.verified.clear();this.verificationCounts.clear();this.tracker.reset();this.update({stage:'verifying',nextMove:undefined,poses:[],message:'One last look. Keep two sides visible as you rotate to check every side.'});
  }
  private async plan(cube:CubeState){
    const epoch=++this.epoch;this.update({cube,stage:'planning',poses:[],nextMove:undefined,message:this.view.corrections?'Finding your new route…':'Finding your first move…'});
    try {
      const result=await this.solver.solve(cube);
      if(epoch!==this.epoch||result.revision!==this.view.cube?.revision)return;
      this.queue=result.moves;this.tracker.reset();this.update({movesRemaining:this.queue.length});
      if(!this.queue.length)this.finishOrReplan(cube);
      else this.update({stage:'guiding',message:'Hold the cube still, with two sides visible.'});
    } catch(e){if(epoch===this.epoch)this.cameraError(e instanceof Error?e.message:'The solver could not start.');}
  }
  dispose(){this.epoch++;this.solver.dispose();this.listeners.clear();}
}

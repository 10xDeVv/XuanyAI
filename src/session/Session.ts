import { CubeScanner, reliableFace } from '../core/scanner';
import { CubeTracker, matchObservation } from '../core/tracker';
import { SOLVED } from '../core/cube';
import { CubeObservation,CubeState,Move,FacePose,CubeColor,SolverAdapter,FACES } from '../core/types';

export type Stage='setup'|'scanning'|'planning'|'guiding'|'recovering'|'verifying'|'solved'|'error';
export type SessionView={
  stage:Stage; message:string; captured:CubeColor[]; cube?:CubeState;
  nextMove?:Move; poses:FacePose[]; observation?:CubeObservation;
  movesDone:number; movesRemaining:number; corrections:number;
  confirmedAt:number; startedAt:number; elapsedMs:number;
};
const initial=():SessionView=>({stage:'setup',message:'Your cube. One turn at a time.',captured:[],poses:[],movesDone:0,movesRemaining:0,corrections:0,confirmedAt:0,startedAt:0,elapsedMs:0});
export class Session {
  private view=initial();
  private scanner=new CubeScanner();
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
  start(){this.epoch++;this.scanner.reset();this.tracker.reset();this.queue=[];this.verified.clear();this.verificationCounts.clear();this.lastObserved=-Infinity;this.lostSince=null;this.view=initial();this.update({stage:'scanning',message:'Rotate the whole cube slowly. Keep each layer in place.',startedAt:Date.now()});}
  rescan(){const {movesDone,corrections,startedAt}=this.view;this.start();this.update({movesDone,corrections,startedAt,message:'Let’s take another look. Rotate the whole cube slowly.'});}
  suspend(){
    this.tracker.reset();this.verificationCounts.clear();this.verified.clear();this.lastObserved=-Infinity;
    // The user may turn unseen layers while the camera is paused or the app is backgrounded.
    if(!['setup','error','solved'].includes(this.view.stage))this.rescan();
    else this.update({poses:[],nextMove:undefined});
  }
  cameraError(message:string){this.epoch++;this.update({stage:'error',message,poses:[],nextMove:undefined});}
  observe(o:CubeObservation){
    if(o.timestamp<=this.lastObserved)return;this.lastObserved=o.timestamp;
    if(['setup','solved','error'].includes(this.view.stage))return;
    this.update({observation:o});
    if(this.view.stage==='scanning') {
      const scan=this.scanner.observe(o);this.update({captured:scan.captured,message:scan.message});
      if(scan.state)void this.plan(scan.state);
      return;
    }
    if(this.view.stage==='planning')return;
    const cube=this.view.cube;if(!cube)return;
    if(this.view.stage==='verifying') {
      if(o.quality!=='good'){this.verificationCounts.clear();return;}
      const poses=matchObservation(cube,o);
      if(!poses){if(o.faces.some(reliableFace))this.rescan();return;}
      for(const color of this.verificationCounts.keys())if(!poses.some(p=>cube.centers[p.face]===color))this.verificationCounts.delete(color);
      for(const pose of poses) {
        const color=cube.centers[pose.face],old=this.verificationCounts.get(color);
        const current=old&&o.timestamp-old.last<800?{...old,count:old.count+1,last:o.timestamp}:{count:1,since:o.timestamp,last:o.timestamp};
        this.verificationCounts.set(color,current);
        if(current.count>=3&&o.timestamp-current.since>=220)this.verified.add(color);
      }
      if(this.verified.size===6)this.update({stage:'solved',poses:[],message:'You did it. Every side, solved.',elapsedMs:Date.now()-this.view.startedAt});
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
    this.verified.clear();this.verificationCounts.clear();this.update({stage:'verifying',nextMove:undefined,poses:[],message:'One last look. Rotate the cube to check every side.'});
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

import {createWorkletRuntime,scheduleOnRuntime,scheduleOnRN} from 'react-native-worklets';
import {CubeState,Move,SolverAdapter,SolverResult} from '../core/types';
import {SOLVER_RUNTIME} from './generated';
export function createSolver():SolverAdapter {
  let disposed=false,counter=0;
  const pending=new Map<number,{resolve:(v:SolverResult)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  let readyResolve:()=>void,readyReject:(e:Error)=>void;
  const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});void ready.catch(()=>{});
  const initialized=(error?:string)=>{clearTimeout(initialTimeout);if(disposed)return;if(error)readyReject(new Error(error));else readyResolve();};
  const initialTimeout=setTimeout(()=>readyReject(new Error('The solver took too long to initialize.')),45000);
  const completed=(id:number,revision:number,moves:Move[],error?:string)=>{
    if(disposed)return;const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);
    if(error)p.reject(new Error(error));else p.resolve({revision,moves});
  };
  const runtime=createWorkletRuntime({name:'Cube solver'});
  scheduleOnRuntime(runtime,()=>{
    'worklet';
    try {
      // This is the locally bundled, pinned solver source, never user or network input.
      (0,eval)(SOLVER_RUNTIME);scheduleOnRN(initialized);
    }catch(e){scheduleOnRN(initialized,String(e));}
  });
  return {
    ready:()=>ready,
    async solve(state:CubeState){
      await ready;if(disposed)throw new Error('Solver closed.');const id=++counter;
      return new Promise<SolverResult>((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error('The solution took too long. Try again.'));},30000);
        pending.set(id,{resolve,reject,timer});
        scheduleOnRuntime(runtime,(requestId:number,revision:number,facelets:string)=>{
          'worklet';
          try{const moves=(globalThis as unknown as {__solveCube:(s:string)=>Move[]}).__solveCube(facelets);scheduleOnRN(completed,requestId,revision,moves);}
          catch(e){scheduleOnRN(completed,requestId,revision,[],String(e));}
        },id,state.revision,state.facelets);
      });
    },
    dispose(){disposed=true;clearTimeout(initialTimeout);readyReject(new Error('Solver closed.'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Solver closed.'));}pending.clear();},
  };
}

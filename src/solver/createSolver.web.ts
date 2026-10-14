import { CubeState,SolverAdapter,SolverResult } from '../core/types';
import {AssemblyInput,ScanAssembly} from '../core/assembleScan';
import {SOLVER_VERSION} from './workerVersion';
export function createSolver():SolverAdapter {
  const worker=new Worker(`/solver.worker.js?v=${SOLVER_VERSION}`);
  let disposed=false,counter=0;
  const pending=new Map<number,{resolve:(r:SolverResult|ScanAssembly)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  let onReady:()=>void,onFail:(e:Error)=>void;
  const ready=new Promise<void>((resolve,reject)=>{onReady=resolve;onFail=reject;});
  // An initialization error is retained for ready()/solve() without an unhandled rejection.
  void ready.catch(()=>{});
  const timeout=setTimeout(()=>onFail(new Error('The solver took too long to initialize. Try again.')),45000);
  worker.onmessage=({data})=>{
    if(disposed)return;
    if(data.type==='ready'){clearTimeout(timeout);onReady();return;}
    if(data.type==='error'&&data.id===undefined){clearTimeout(timeout);onFail(new Error(data.message));return;}
    const request=pending.get(data.id);if(!request)return;
    clearTimeout(request.timer);pending.delete(data.id);
    if(data.type==='error')request.reject(new Error(data.message));else request.resolve(data.type==='assembled'?data.result:{revision:data.revision,moves:data.moves});
  };
  worker.onerror=()=>{const error=new Error('The solver could not start. Reload and try again.');onFail(error);for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};
  worker.postMessage({type:'init'});
  const request=async<T extends SolverResult|ScanAssembly>(message:object):Promise<T>=>{
    await ready;if(disposed)throw new Error('Solver closed.');
    const id=++counter;
    return new Promise<T>((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('The cube check took too long. Try scanning again.'));},30000);
      pending.set(id,{resolve:r=>resolve(r as T),reject,timer});worker.postMessage({...message,id});
    });
  };
  return {
    ready:()=>ready,
    assemble:(input:AssemblyInput)=>request<ScanAssembly>({type:'assemble',input}),
    solve:(state:CubeState)=>request<SolverResult>({type:'solve',...state}),
    dispose(){disposed=true;clearTimeout(timeout);worker.terminate();onFail(new Error('Solver closed.'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Solver closed.'));}pending.clear();},
  };
}

import { initializeSolver,solveFacelets } from './solve';
import {reconstructScan} from '../core/assembleScan';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(v:unknown)=>void};
scope.onmessage=({data})=>{
  try {
    if(data.type==='init'){initializeSolver();scope.postMessage({type:'ready'});}
    else if(data.type==='assemble')scope.postMessage({type:'assembled',id:data.id,result:reconstructScan(data.input)});
    else if(data.type==='solve')scope.postMessage({type:'solution',id:data.id,revision:data.revision,moves:solveFacelets(data.facelets)});
  } catch(error){scope.postMessage({type:'error',id:data.id,message:error instanceof Error?error.message:String(error)});}
};

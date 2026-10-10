import { CubeObservation } from '../core/types';
export type CameraSurfaceProps={
  active:boolean; facing:'front'|'back';
  picture?:boolean;
  saveFrameRequest?:number;
  onObservation:(o:CubeObservation)=>void;
  onError:(message:string)=>void;
  onStatus:(status:string)=>void;
  onSuspend:()=>void;
};

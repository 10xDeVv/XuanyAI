import {HybridObject} from 'react-native-nitro-modules';
export interface CubeVision extends HybridObject<{ios:'c++';android:'c++'}> {
  detect(buffer:ArrayBuffer,width:number,height:number,stride:number,bgra:boolean,rotation:number,mirrored:boolean):string;
}

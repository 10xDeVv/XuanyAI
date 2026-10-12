import {ReactNode} from 'react';
import {CameraView} from '../core/cubePreview';
export type CubeViewportProps={view:CameraView;onChange:(view:CameraView)=>void;height:number;children:ReactNode};

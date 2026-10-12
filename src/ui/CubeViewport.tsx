import React,{useMemo,useRef} from 'react';
import {PanResponder,View} from 'react-native';
import {orbitView,panView,zoomView} from '../core/cubePreview';
import {CubeViewportProps} from './CubeViewport.types';

export default function CubeViewport({view,onChange,height,children}:CubeViewportProps){
  const latest=useRef({view,onChange,height});latest.current={view,onChange,height};
  const width=useRef(320),last=useRef<{x:number;y:number;distance:number;count:number}|null>(null);
  const responder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:()=>{last.current=null;},
    onPanResponderMove:e=>{
      const touches=e.nativeEvent.touches;if(!touches.length)return;
      const first=touches[0]!,second=touches[1];
      const current={x:second?(first.pageX+second.pageX)/2:first.pageX,y:second?(first.pageY+second.pageY)/2:first.pageY,
        distance:second?Math.hypot(first.pageX-second.pageX,first.pageY-second.pageY):0,count:touches.length};
      const before=last.current,{view,onChange,height}=latest.current;
      if(before&&before.count===current.count){
        const next=(second?panView:orbitView)(view,current.x-before.x,current.y-before.y,Math.min(width.current,height));
        onChange(second?zoomView(next,before.distance>8?current.distance/before.distance:1):next);
      }
      last.current=current;
    },
    onPanResponderRelease:()=>{last.current=null;},onPanResponderTerminate:()=>{last.current=null;},onPanResponderTerminationRequest:()=>false,
  }),[]);
  return <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Interactive 3D cube. Drag to rotate. Pinch to zoom. Two fingers to pan."
    accessibilityActions={[{name:'increment',label:'Rotate right'},{name:'decrement',label:'Rotate left'}]}
    onAccessibilityAction={e=>onChange(orbitView(view,e.nativeEvent.actionName==='increment'?30:-30,0))}
    onLayout={e=>{width.current=e.nativeEvent.layout.width;}} style={{width:'100%',height}}><View pointerEvents="none" style={{width:'100%',height:'100%'}}>{children}</View></View>;
}

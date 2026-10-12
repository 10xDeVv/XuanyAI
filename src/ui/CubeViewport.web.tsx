import React,{useEffect,useRef,useState} from 'react';
import {orbitView,panView,zoomView} from '../core/cubePreview';
import {CubeViewportProps} from './CubeViewport.types';

export default function CubeViewport({view,onChange,height,children}:CubeViewportProps){
  const root=useRef<HTMLDivElement>(null),latest=useRef({view,onChange});latest.current={view,onChange};
  const pointers=useRef(new Map<number,{x:number;y:number}>()),[dragging,setDragging]=useState(false);
  const pan=useRef(false);
  const span=()=>Math.min(root.current?.clientWidth??320,height);
  useEffect(()=>{
    const element=root.current;if(!element)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const {view,onChange}=latest.current;onChange(zoomView(view,Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.002)));};
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[]);
  const release=(id:number)=>{pointers.current.delete(id);setDragging(pointers.current.size>0);};
  return <div ref={root} role="group" aria-label="Interactive 3D cube. Drag to rotate; pinch or scroll to zoom; two fingers or Shift-drag to pan." tabIndex={0}
    style={{width:'100%',height,touchAction:'none',cursor:dragging?'grabbing':'grab',userSelect:'none',outlineOffset:-3}}
    onContextMenu={e=>e.preventDefault()}
    onPointerDown={e=>{if(e.button!==0&&e.button!==2)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});pan.current=e.shiftKey||e.button===2;setDragging(true);}}
    onPointerMove={e=>{
      const before=pointers.current.get(e.pointerId);if(!before)return;
      const others=[...pointers.current.entries()].filter(([id])=>id!==e.pointerId),next={x:e.clientX,y:e.clientY};
      const {view,onChange}=latest.current;
      if(others.length){
        const other=others[0]![1],oldDistance=Math.hypot(before.x-other.x,before.y-other.y),newDistance=Math.hypot(next.x-other.x,next.y-other.y);
        onChange(zoomView(panView(view,(next.x-before.x)/2,(next.y-before.y)/2,span()),oldDistance>8?newDistance/oldDistance:1));
      }else onChange((pan.current||e.shiftKey?panView:orbitView)(view,next.x-before.x,next.y-before.y,span()));
      pointers.current.set(e.pointerId,next);
    }}
    onPointerUp={e=>release(e.pointerId)} onPointerCancel={e=>release(e.pointerId)} onLostPointerCapture={e=>release(e.pointerId)}
    onKeyDown={e=>{
      const key=e.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(key))return;e.preventDefault();
      const {view,onChange}=latest.current;
      if(['+','=','-'].includes(key))onChange(zoomView(view,key==='-'?.9:1.1));
      else onChange((e.shiftKey?panView:orbitView)(view,key==='ArrowLeft'?-24:key==='ArrowRight'?24:0,key==='ArrowUp'?-24:key==='ArrowDown'?24:0));
    }}><div style={{width:'100%',height:'100%',pointerEvents:'none'}}>{children}</div></div>;
}

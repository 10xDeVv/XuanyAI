import {useEffect,useRef,useState} from 'react';
import {ReadableMessage} from '../core/readableMessage';

/** Context changes (start, error, or a new move) bypass the presentation delay. */
export function useReadableMessage(value:string,context:string):string {
  const gate=useRef(new ReadableMessage());
  const prior=useRef(context);
  const [shown,setShown]=useState({context,text:value});
  useEffect(()=>{
    if(prior.current!==context){prior.current=context;setShown({context,text:gate.current.reset(value,Date.now())});return;}
    const result=gate.current.update(value,Date.now());setShown({context,text:result.text});
    if(!result.wait)return;
    const timer=setTimeout(()=>setShown({context,text:gate.current.update(value,Date.now()).text}),result.wait+1);
    return()=>clearTimeout(timer);
  },[value,context]);
  return shown.context===context?shown.text:value;
}

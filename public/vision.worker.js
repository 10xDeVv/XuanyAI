/* Shared C++ detector. Never receives a frame until WASM initialization completes. */
let engine=null,ptr=0,capacity=0;
const version=new URL(self.location.href).searchParams.get('v');
const asset=name=>'/vision/'+name+(version?'?v='+encodeURIComponent(version):'');
self.onmessage=async({data})=>{
  try {
    if(data.type==='init') {
      importScripts(asset('cube-vision.js'));
      engine=await createCubeVision({locateFile:asset});
      self.postMessage({type:'ready'});return;
    }
    if(!engine)return;
    if(data.type==='photo') {
      if(![2,3].includes(data.columns)||data.width<1||data.height<1||data.width>1920||data.height>1920||data.buffer.byteLength!==data.width*data.height*4)throw new Error('Invalid photo size or layout.');
      const started=performance.now(),source=new Uint8Array(data.buffer),panels=[],rows=6/data.columns;
      for(let i=0;i<6;i++){
        const col=i%data.columns,row=Math.floor(i/data.columns);
        const x0=Math.round(col*data.width/data.columns),x1=Math.round((col+1)*data.width/data.columns),y0=Math.round(row*data.height/rows),y1=Math.round((row+1)*data.height/rows);
        const scale=Math.min(1,640/Math.max(x1-x0,y1-y0)),width=Math.round((x1-x0)*scale),height=Math.round((y1-y0)*scale),bytes=new Uint8Array(width*height*4);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const from=(Math.min(y1-1,y0+Math.floor((y+.5)/scale))*data.width+Math.min(x1-1,x0+Math.floor((x+.5)/scale)))*4,to=(y*width+x)*4;
          bytes.set(source.subarray(from,from+4),to);
        }
        if(bytes.length>capacity){if(ptr)engine._free(ptr);capacity=bytes.length;ptr=engine._malloc(capacity);if(!ptr)throw new Error('Not enough memory to read the photo.');}
        engine.HEAPU8.set(bytes,ptr);
        panels.push(JSON.parse(engine.detectRGBA(ptr,width,height,width*4)).faces);
      }
      self.postMessage({type:'photo',panels,processingMs:performance.now()-started});return;
    }
    if(data.type!=='frame')return;
    const bytes=new Uint8Array(data.buffer);
    if(bytes.length>capacity){if(ptr)engine._free(ptr);capacity=bytes.length;ptr=engine._malloc(capacity);if(!ptr)throw new Error('Not enough memory for camera processing.');}
    engine.HEAPU8.set(bytes,ptr);
    const started=performance.now();
    const result=JSON.parse((data.picture?engine.detectPictureRGBA:engine.detectRGBA)(ptr,data.width,data.height,data.width*4));
    result.processingMs=performance.now()-started;
    self.postMessage({type:'observation',id:data.id,timestamp:data.timestamp,...result});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};

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
    if(data.type!=='frame'||!engine)return;
    const bytes=new Uint8Array(data.buffer);
    if(bytes.length>capacity){if(ptr)engine._free(ptr);capacity=bytes.length;ptr=engine._malloc(capacity);if(!ptr)throw new Error('Not enough memory for camera processing.');}
    engine.HEAPU8.set(bytes,ptr);
    const result=JSON.parse(engine.detectRGBA(ptr,data.width,data.height,data.width*4));
    self.postMessage({type:'observation',id:data.id,timestamp:data.timestamp,...result});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};

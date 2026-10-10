import {access} from 'node:fs/promises';
for(const file of ['public/vision/cube-vision.js','public/vision/cube-vision.wasm']){
  try{await access(file);}catch{throw new Error(`${file} is missing. Run npm run build:vision before exporting the camera app.`);}
}

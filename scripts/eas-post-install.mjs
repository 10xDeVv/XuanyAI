import {spawnSync} from 'node:child_process';
const run=(command,args,options={})=>{const result=spawnSync(command,args,{stdio:'inherit',...options});if(result.status!==0)process.exit(result.status??1);};
run(process.execPath,['scripts/build-workers.mjs']);
run(process.execPath,['../../node_modules/nitrogen/lib/index.js'],{cwd:'modules/cube-vision'});
run(process.platform==='win32'?'python':'python3',['scripts/prepare-native.py']);

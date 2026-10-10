import https from 'node:https';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

// Use a certificate trusted by the test phones (for example one issued by your
// development CA). This server never changes certificate trust or disables TLS.
const root=path.resolve('dist');
const cert=process.env.TLS_CERT,key=process.env.TLS_KEY;
if(!cert||!key)throw new Error('Set TLS_CERT and TLS_KEY to your trusted certificate and private-key paths. See README.md.');
await stat(path.join(root,'index.html'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf'};
https.createServer({cert:await readFile(cert),key:await readFile(key)},async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'https://localhost').pathname);
    let file=path.resolve(root,'.'+pathname);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}
    catch{if(path.extname(file))throw new Error('missing');file=path.join(root,'index.html');}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(self), microphone=()'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT||8443),process.env.HOST||'127.0.0.1',()=>console.log(`HTTPS preview ready on ${process.env.HOST||'127.0.0.1'}:${process.env.PORT||8443}`));

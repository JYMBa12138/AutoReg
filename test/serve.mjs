import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
http.createServer((req,res)=>{
  if(req.method==='POST'&&req.url.startsWith('/api/fake-register')){
    let b='';req.on('data',c=>b+=c);req.on('end',()=>{
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({code:0,message:'success',got:JSON.parse(b||'{}')}));
    });return;
  }
  const f=path.join(dir, req.url==='/'?'fake-signup.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type': f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(d);});
}).listen(3999,'127.0.0.1',()=>console.log('fake server 3999'));

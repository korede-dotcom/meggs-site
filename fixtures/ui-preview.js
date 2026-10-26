// Isolated UI test fixture: never use this server for deployment.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const {initial}=await import('../backend/seed-data.js');
http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/store'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...initial,paymentsEnabled:false}))}let file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/')&&file!==root){res.statusCode=403;return res.end()}try{const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.PNG':'image/png'})[path.extname(file)]||'text/html');res.end(data)}catch{if(path.extname(file)){res.statusCode=404;return res.end()}res.setHeader('Content-Type','text/html');res.end(await readFile(root+'/index.html'))}}).listen(3400,'127.0.0.1',()=>console.log('UI preview ready on 3400'));

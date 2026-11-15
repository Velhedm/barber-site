'use strict';
const {createApp}=require('./app');
const {startupError}=require('./startup-error');
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL)throw new Error('Production requires a restricted PostgreSQL connection');
if(process.env.DB_PATH)throw new Error('Custom local database paths are not supported during migration');
async function main(){
if(process.env.REDIRECT_ORIGIN){
 const destination=new URL(process.env.REDIRECT_ORIGIN);
 if(destination.origin!=='https://ilker-sevim-barbers.onrender.com')throw new Error('Unsupported redirect destination');
 const http=require('node:http');
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const path=new URL(req.url,'http://localhost');
  res.writeHead(307,{Location:destination.origin+path.pathname+path.search});res.end();
 });
 server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Branded address redirect started'));
 const stop=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),15000).unref();};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);return;
}
const runtime=await createApp({preMigrated:Boolean(process.env.DATABASE_URL),verifyIsolation:Boolean(process.env.DATABASE_URL)});const server=runtime.app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('İlker Sevim server started'));
const timer=process.env.PUSH_WORKER_ENABLED==='false'?null:setInterval(()=>runtime.drainOutbox().catch(()=>console.error('Outbox processing failed')),5000);if(timer){timer.unref();runtime.drainOutbox().catch(()=>console.error('Outbox processing failed'));}
function stop(){clearInterval(timer);server.close(()=>{runtime.close().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

}
main().catch(error=>{console.error(startupError(error));process.exit(1);});

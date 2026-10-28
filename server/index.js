'use strict';
const {createApp}=require('./app');
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL&&!process.env.DB_PATH?.startsWith('/data/'))throw new Error('Production requires DB_PATH on the persistent /data disk');
async function main(){
const runtime=await createApp();const server=runtime.app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Ruslan True server started'));
const timer=setInterval(()=>runtime.drainOutbox().catch(()=>console.error('Outbox processing failed')),5000);timer.unref();runtime.drainOutbox().catch(()=>console.error('Outbox processing failed'));
function stop(){clearInterval(timer);server.close(()=>{runtime.close().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

}
main().catch(()=>{console.error('Server startup failed. Check database and environment settings.');process.exit(1);});

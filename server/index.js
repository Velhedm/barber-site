'use strict';
const {createApp}=require('./app');
const {startupError}=require('./startup-error');
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL)throw new Error('Production requires a restricted PostgreSQL connection');
if(process.env.DB_PATH)throw new Error('Custom local database paths are not supported during migration');
async function main(){
const runtime=await createApp({preMigrated:Boolean(process.env.DATABASE_URL),verifyIsolation:Boolean(process.env.DATABASE_URL)});const server=runtime.app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('İlker Sevim server started'));
const timer=setInterval(()=>runtime.drainOutbox().catch(()=>console.error('Outbox processing failed')),5000);timer.unref();runtime.drainOutbox().catch(()=>console.error('Outbox processing failed'));
function stop(){clearInterval(timer);server.close(()=>{runtime.close().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

}
main().catch(error=>{console.error(startupError(error));process.exit(1);});

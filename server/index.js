'use strict';
const {createApp}=require('./app');
if(process.env.NODE_ENV==='production'&&!process.env.DB_PATH?.startsWith('/data/'))throw new Error('Production requires DB_PATH on the persistent /data disk');
const runtime=createApp();const server=runtime.app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Ruslan True server started'));
const timer=setInterval(()=>runtime.drainOutbox().catch(()=>console.error('Outbox processing failed')),10000);timer.unref();runtime.drainOutbox();
function stop(){clearInterval(timer);server.close(()=>{runtime.close();process.exit(0);});setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

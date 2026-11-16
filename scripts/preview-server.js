'use strict';
// Isolated, disposable preview only. This script ALWAYS uses in-memory SQLite,
// never DATABASE_URL or the production entrypoint. No real client data belongs here.
const express=require('express'),helmet=require('helmet'),{createApp}=require('../server/app'),{hashPassword}=require('../server/access-store');
const {readFile}=require('node:fs/promises'),path=require('node:path');
async function main(){
 const password=process.env.ILKER_PREVIEW_PASSWORD,origin=process.env.ILKER_PREVIEW_ORIGIN;
 if(typeof password!=='string'||password.length<24||password.length>200)throw new Error('A separate preview password of 24–200 characters is required');
 let parsed;try{parsed=new URL(origin);}catch{throw new Error('Explicit HTTPS preview origin is required');}
 if(parsed.origin!==origin||parsed.protocol!=='https:'||parsed.hostname==='ilker-sevim.onrender.com'||parsed.hostname==='ilker-sevim-barbers.onrender.com')throw new Error('A separate HTTPS preview origin is required');
 const vapid={subject:process.env.ILKER_PREVIEW_VAPID_SUBJECT,publicKey:process.env.ILKER_PREVIEW_VAPID_PUBLIC,privateKey:process.env.ILKER_PREVIEW_VAPID_PRIVATE};
 if(!vapid.subject||!vapid.publicKey||!vapid.privateKey)throw new Error('Separate preview VAPID keys are required');
 if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PUBLIC_KEY===vapid.publicKey)throw new Error('Production and preview Push keys must differ');
 const runtime=await createApp({databaseUrl:'',databasePath:':memory:',bootstrapLegacy:true,management:true,migrateManagement:true,production:true,adminHash:await hashPassword(password),origin,vapid,recoveryKey:'',emailProvider:{configured:false,send:async()=>{throw new Error('Preview email disabled');}}});
 const service=(await runtime.shop.services()).find(s=>!s.archived);if(!service)throw new Error('No preview service');
 for(const category of ['zal','vip'])await runtime.shop.setDuration(service.id,category,60);
 const master=(await runtime.shop.masters())[0];await runtime.shop.saveMaster({id:master.id,revision:master.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:[service.id],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 const front=express();front.disable('x-powered-by');front.use(helmet({contentSecurityPolicy:false}));front.use((req,res,next)=>{res.set('X-Robots-Tag','noindex, nofollow, noarchive');next();});
 // The notice is part of the HTML (not injected script or CSS), and makes it
 // clear to staff that visits here are fictional and will be discarded.
 for(const route of ['/','/admin.html'])front.get(route,async(req,res,next)=>{try{const file=path.join(__dirname,'../dist',route==='/'?'index.html':'admin.html'),html=await readFile(file,'utf8');res.set({'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self'"});res.type('html').send(html.replace('<body>','<body><aside role="note">TEST / SINAQ / ТЕСТ — Synthetic data only. No real bookings. / Yalnız sınaq məlumatları. / Только тестовые данные.</aside>'));}catch(error){next(error);}});
 front.use(runtime.app);const server=front.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Isolated preview started'));
 const timer=setInterval(()=>runtime.drainOutbox().catch(()=>console.error('Preview push processing failed')),5000);timer.unref();
 function stop(){clearInterval(timer);server.close(()=>runtime.close().then(()=>process.exit(0)));setTimeout(()=>process.exit(1),15000).unref();}process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
main().catch(()=>{console.error('Isolated preview configuration failed');process.exitCode=1;});

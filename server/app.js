'use strict';
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const {createDatabase}=require('./database');
const {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash}=require('node:crypto');
const path=require('node:path');
const webpush=require('web-push');
const {prepareIlkerStore}=require('./ilker-store');
const {catalog}=require('./ilker-services');
const {createManagementStore}=require('./management-store');
const {migrateManagement}=require('./management-migration');

const sha=value=>createHash('sha256').update(value).digest('hex');
function verifyPassword(password,hash){try{const [salt,key]=hash.split(':');const expected=Buffer.from(key,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}
async function createApp(options={}){
 const rawdb=await createDatabase({...options,bootstrapLegacy:options.preMigrated?false:options.bootstrapLegacy});
 if(options.verifyIsolation){
  try{
   const result=await rawdb.prepare("SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('slots','sessions','closed_days','push_subscriptions','push_events','push_deliveries') AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS legacy_access").get();
   if(result.legacy_access)throw new Error('Database role can access legacy records');
  }catch(error){await rawdb.close();throw error;}
 }
 // The previous owner's tables are never queried by these handlers. The live entrypoint
 // remains fail-closed until PostgreSQL privilege separation and migration are verified.
 const names={slots:'ilker_appointments',closed_days:'ilker_closed_days',sessions:'ilker_sessions',push_subscriptions:'ilker_push_subscriptions',push_events:'ilker_push_events',push_deliveries:'ilker_push_deliveries'};
 const scope=sql=>sql.replace(/\b(push_subscriptions|push_deliveries|push_events|closed_days|sessions|slots)\b/g,name=>names[name]);
 const db={...rawdb,prepare:sql=>rawdb.prepare(scope(sql))};
 const production=options.production??(process.env.NODE_ENV==='production');
 const vapid=options.vapid||{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY};
 const pushEnabled=Boolean(vapid.subject&&vapid.publicKey&&vapid.privateKey);
 if(pushEnabled)webpush.setVapidDetails(vapid.subject,vapid.publicKey,vapid.privateKey);
 const pushSend=options.pushSend||((subscription,payload)=>webpush.sendNotification(subscription,payload,{vapidDetails:vapid,TTL:86400,urgency:'high',timeout:10000}));
 const ownerPassword=process.env.ADMIN_PASSWORD;
 if(ownerPassword&&(ownerPassword.length<12||ownerPassword.length>200))throw new Error('ADMIN_PASSWORD must contain 12 to 200 characters');
 const salt=ownerPassword?randomBytes(16).toString('hex'):null;
 const adminHash=options.adminHash??(ownerPassword?salt+':'+scryptSync(ownerPassword,salt,64).toString('hex'):process.env.ADMIN_PASSWORD_HASH);
 const origin=options.origin||process.env.APP_ORIGIN||(process.env.RENDER_EXTERNAL_URL);
 const now=options.now||(()=>Date.now());

 const management=options.management??(process.env.MANAGEMENT_ENABLED==='true');
 const onBooked=async bookingId=>{
  const eventId=randomUUID();await db.prepare('INSERT INTO push_events(id,booking_id,created_at) VALUES(?,?,?)').run(eventId,bookingId,now());
  const subscriptions=await db.prepare('SELECT id FROM push_subscriptions').all();
  for(const sub of subscriptions)await db.prepare('INSERT INTO push_deliveries(id,event_id,subscription_id) VALUES(?,?,?)').run(randomUUID(),eventId,sub.id);
 };
 let shop=await prepareIlkerStore(db,{now,bootstrap:!options.preMigrated,sharedCapacity:!management,onBooked});
 if(management){
  if(options.migrateManagement&&!options.preMigrated)await migrateManagement(db);
  shop=await createManagementStore(db,shop,{now,onBooked});
 }
 if(!options.preMigrated)await db.exec(`
 CREATE TABLE IF NOT EXISTS ilker_sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS ilker_push_subscriptions(id TEXT PRIMARY KEY,endpoint TEXT UNIQUE NOT NULL,subscription TEXT NOT NULL,created_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS ilker_push_events(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES ilker_appointments(id) ON DELETE CASCADE,created_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS ilker_push_deliveries(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES ilker_push_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES ilker_push_subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,last_error TEXT,UNIQUE(event_id,subscription_id));
 `);
 const hours=Array.from({length:12},(_,i)=>String(9+i).padStart(2,'0')+':00');
 const horizon=365;
 function today(){return new Date(now()+4*3600000).toISOString().slice(0,10);}
 function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date&&date>=today()&&date<=new Date(now()+4*3600000+horizon*86400000).toISOString().slice(0,10);}
 function validTime(date,time){return validDate(date)&&hours.includes(time)&&Date.parse(date+'T'+time+':00+04:00')>now();}
 const transaction=fn=>db.transaction(fn);
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 if(production&&(!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(adminHash||'')||!origin||!pushEnabled))throw new Error('Production requires ADMIN_PASSWORD_HASH, APP_ORIGIN and valid VAPID settings');
 const app=express();app.disable('x-powered-by');if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'",'https://fonts.googleapis.com','https://cdnjs.cloudflare.com'],fontSrc:["'self'",'https://fonts.gstatic.com','https://cdnjs.cloudflare.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"],upgradeInsecureRequests:production?[]:null}}}));
 app.use('/api',express.json({limit:'8kb'}),async(req,res,next)=>{res.set('Cache-Control','no-store');if(req.method!=='GET'&&req.method!=='HEAD'){
  if(!req.is('application/json'))return res.status(415).json({error:'Ожидается JSON'});
  if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')return res.status(400).json({error:'Некорректный JSON'});
  if(req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Недопустимый источник запроса'});
  const allowed=origin||`${req.protocol}://${req.get('host')}`;
  if(req.get('origin')&&req.get('origin')!==allowed)return res.status(403).json({error:'Недопустимый источник запроса'});
 }next();});
 const limiter=(limit,windowMs=60000)=>rateLimit({windowMs,limit,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много запросов. Попробуй позже.'}});
 app.use('/api',limiter(180));
 app.get('/healthz',async(req,res)=>{(await db.prepare('SELECT 1').get());res.json({ok:true});});
 app.get('/api/meta',async(req,res)=>{
  const rows=await shop.settings();const durations=Object.fromEntries(rows.map(row=>[row.id,row.duration_minutes]));
  const services=management?await shop.services():catalog.categories.flatMap(group=>group.services.map(item=>({id:item.id,name:item.name,translations:item.translations,group:group.id,groupName:group.name,groupTranslations:group.translations,prices:{zal:item.zal,vip:item.vip},durations:{zal:durations[item.id+':zal'],vip:durations[item.id+':vip']},zalNote:item.zal_note||null})));
  res.json({management,brand:catalog.brand,serverTime:now(),timezone:'Asia/Baku',hours,services,notificationsEnabled:pushEnabled,maxDaysAhead:horizon});
 });
 app.get('/api/availability',async(req,res)=>{
  const ids=typeof req.query.serviceIds==='string'?req.query.serviceIds.split(','):undefined;
  const data=await shop.availability(req.query.date,req.query.serviceId,req.query.room,ids,req.query.masterId);res.json(data);
 });
 app.post('/api/bookings',limiter(options.bookingLimit||12,10*60000),async(req,res)=>{
  const booking=await shop.book(req.body);res.status(201).json({id:booking.id,date:booking.date,time:booking.time,serviceId:booking.service_id,room:booking.room,durationMinutes:booking.duration_minutes,status:'confirmed',...(management?{masterId:booking.master_id,masterName:booking.master_name,priceMin:booking.price_min,priceMax:booking.price_max,items:booking.items}: {})});
 });
 async function auth(req,res,next){const cookie=req.get('cookie')||'';const sessionToken=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('rt_session='))?.slice(11);
  const session=sessionToken&&(await db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(sha(sessionToken),now()));
  if(!session)return res.status(401).json({error:'Нужен вход владельца'});
  if(req.method!=='GET'&&req.get('x-csrf-token')!==session.csrf)return res.status(403).json({error:'Неверный CSRF-токен'});req.session=session;next();
 }
 app.post('/api/admin/login',limiter(5,15*60000),async(req,res)=>{
  if(!adminHash)return res.status(503).json({error:'Настрой ADMIN_PASSWORD_HASH'});
  const password=req.body.password;if(typeof password!=='string'||password.length>200||!verifyPassword(password,adminHash))return res.status(401).json({error:'Неверный пароль'});
  (await db.prepare('DELETE FROM sessions WHERE expires<=?').run(now()));const raw=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');(await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(raw),csrf,now()+8*3600000));
  res.cookie('rt_session',raw,{httpOnly:true,sameSite:'strict',secure:production,maxAge:8*3600000,path:'/api/admin'}).json({csrf});
 });
 app.get('/api/admin/session',auth,async(req,res)=>res.json({csrf:req.session.csrf}));
 app.post('/api/admin/logout',auth,async(req,res)=>{if(typeof req.body.endpoint==='string')(await db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(req.body.endpoint));(await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash));res.clearCookie('rt_session',{path:'/api/admin',httpOnly:true,sameSite:'strict',secure:production}).json({ok:true});});
 app.get('/api/admin/day',auth,async(req,res)=>{
  if(!validDate(req.query.date))return res.status(400).json({error:'Некорректная дата'});
  const rows=await db.prepare("SELECT * FROM slots WHERE date=? AND status='active' ORDER BY time").all(req.query.date);
  const itemMap=await shop.itemsFor(rows.filter(row=>row.kind==='booking').map(row=>row.id));const slots=await Promise.all(rows.map(async({request_key,...safe})=>management?{...await shop.publicResult(safe),request_key:undefined}:{...safe,items:itemMap.get(safe.id)||[]}));
  res.json({date:req.query.date,closed:Boolean((await db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(req.query.date))),notificationsEnabled:pushEnabled,slots});
 });
 if(management){
  app.get('/api/masters',async(req,res)=>res.json({masters:await shop.eligible({serviceIds:typeof req.query.serviceIds==='string'?req.query.serviceIds.split(','):[],room:req.query.room})}));
  app.get('/api/admin/management',auth,async(req,res)=>res.json({masters:await shop.masters(true),rooms:await shop.rooms(),services:await shop.services(true)}));
  app.post('/api/admin/masters',auth,async(req,res)=>res.json(await shop.saveMaster(req.body)));
  app.post('/api/admin/rooms',auth,async(req,res)=>res.json(await shop.saveRoom(req.body)));
  app.post('/api/admin/catalog',auth,async(req,res)=>res.json(await shop.saveService(req.body)));
  app.post('/api/admin/master-exception',auth,async(req,res)=>res.json(await shop.setException(req.body)));
  app.post('/api/admin/master-block',auth,async(req,res)=>res.json(await shop.setBlock(req.body)));
  app.get('/api/admin/master-day',auth,async(req,res)=>res.json(await shop.dayDetails(req.query.masterId,req.query.date)));
  app.get('/api/admin/master-history',auth,async(req,res)=>res.json(await shop.history(req.query.masterId,Number(req.query.offset||0))));
 }
 app.post('/api/admin/slot',auth,async(req,res)=>res.json(await shop.setSlot(req.body.date,req.body.time,req.body.blocked,req.body.masterId)));
 app.post('/api/admin/day',auth,async(req,res)=>res.json(await shop.setDay(req.body.date,req.body.closed,req.body.masterId)));
 app.post('/api/admin/cancel',auth,async(req,res)=>res.json(await shop.cancel(req.body.id)));
 app.get('/api/admin/services',auth,async(req,res)=>res.json({services:await shop.settings()}));
 app.post('/api/admin/duration',auth,async(req,res)=>res.json(await shop.setDuration(req.body.serviceId,req.body.room,req.body.minutes)));
 app.post('/api/admin/price',auth,async(req,res)=>res.json(await shop.setActualPrice(req.body.id,req.body.price)));
 app.post('/api/admin/complete',auth,async(req,res)=>res.json(await shop.complete(req.body.id)));
 app.get('/api/admin/revenue',auth,async(req,res)=>res.json(await shop.revenue()));
 function validSubscription(subscription){
  try{const url=new URL(subscription.endpoint);const host=url.hostname.toLowerCase();
   const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
   return allowed&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&subscription.endpoint.length<2048&&/^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth||'');
  }catch{return false;}
 }
 app.get('/api/admin/push/config',auth,async(req,res)=>res.json({enabled:pushEnabled,publicKey:pushEnabled?vapid.publicKey:null,deviceCount:(await db.prepare('SELECT count(*) AS n FROM push_subscriptions').get()).n}));
 app.post('/api/admin/push/subscribe',auth,async(req,res)=>{
  if(!pushEnabled)return res.status(503).json({error:'Настрой VAPID на сервере'});
  if(!validSubscription(req.body.subscription))return res.status(400).json({error:'Недопустимая Push-подписка'});
  const subscription=req.body.subscription;
  const safe={endpoint:subscription.endpoint,expirationTime:subscription.expirationTime||null,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}};
  if(safe.expirationTime&&(!Number.isFinite(safe.expirationTime)||safe.expirationTime<now()))return res.status(400).json({error:'Подписка истекла'});
  if(!(await db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint=?').get(safe.endpoint))&&(await db.prepare('SELECT count(*) AS n FROM push_subscriptions').get()).n>=20)return res.status(409).json({error:'Достигнут лимит 20 устройств'});
  (await db.prepare('INSERT INTO push_subscriptions(id,endpoint,subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription').run(randomUUID(),safe.endpoint,JSON.stringify(safe),now()));
  res.json({ok:true});
 });
 app.post('/api/admin/push/unsubscribe',auth,async(req,res)=>{if(typeof req.body.endpoint!=='string')return res.status(400).json({error:'Нужна подписка'});(await db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(req.body.endpoint));res.json({ok:true});});
 app.post('/api/admin/push/test',auth,limiter(3,60000),async(req,res)=>{
  const row=(await db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').get(typeof req.body.endpoint==='string'?req.body.endpoint:''));
  if(!pushEnabled||!row)return res.status(400).json({error:'Сначала включи Push на этом устройстве'});
  try{await pushSend(JSON.parse(row.subscription),JSON.stringify({title:'İlker Sevim Barber Club',body:'Проверка Push-уведомлений',tag:'rt-test',url:'/admin.html'}));res.json({ok:true});}
  catch(e){if([404,410].includes(e.statusCode))(await db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id));res.status(502).json({error:'Push-сервис не принял сообщение. Проверь подписку и настройки.'});}
 });
 app.get('/api/admin/bookings',auth,async(req,res)=>{
  const status=['active','cancelled','completed','all'].includes(req.query.status)?req.query.status:'active';
  const offset=Math.max(0,Math.min(1000000,Math.trunc(Number(req.query.offset)||0)));
  const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,80):'';
  const digits=q.replace(/\D/g,'');
  const compactPhone="REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'+',''),' ',''),'-',''),'(',''),')','')";
  const condition=`kind='booking' AND (?='all' OR status=?) AND (?='' OR instr(name,?)>0 OR instr(phone,?)>0 OR (?<>'' AND ${compactPhone} LIKE ?))`;
  const args=[status,status,q,q,q,digits,`%${digits}%`];
  const rows=(await db.prepare(`SELECT id,date,time,status,name,phone,service_id,service_name,room,price_min,price_max,actual_price,duration_minutes,sessions_count,created_at FROM slots WHERE ${condition} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`).all(...args,offset));
  const count=(await db.prepare(`SELECT count(*) AS n FROM slots WHERE ${condition}`).get(...args)).n;
  const itemMap=await shop.itemsFor(rows.map(row=>row.id));res.json({rows:await Promise.all(rows.map(async row=>management?shop.publicResult(row):({...row,items:itemMap.get(row.id)||[]}))),count,offset});
 });
 app.get('/api/admin/booking/:id',auth,async(req,res)=>{
  const row=(await db.prepare("SELECT id,date,time,status,name,phone,service_id,service_name,room,price_min,price_max,actual_price,duration_minutes,sessions_count,created_at FROM slots WHERE id=? AND kind='booking'").get(req.params.id));
  if(!row)return res.status(404).json({error:'Запись не найдена'});res.json(management?await shop.publicResult(row):{...row,items:await shop.items(row.id)});
 });
 app.post('/api/admin/delete',auth,async(req,res)=>res.json(await shop.remove(req.body.id)));
 let draining=false;
 async function drainOutbox(){if(draining||!pushEnabled)return;draining=true;try{
  const jobs=(await db.prepare("SELECT d.id AS delivery_id,d.attempts,p.subscription,p.id AS subscription_id,s.id AS booking_id,s.date,s.time,s.duration_minutes FROM push_deliveries d JOIN push_events e ON e.id=d.event_id JOIN slots s ON s.id=e.booking_id JOIN push_subscriptions p ON p.id=d.subscription_id WHERE d.sent_at IS NULL AND d.next_attempt<=? AND s.status='active' ORDER BY d.id LIMIT 20").all(now()));
  for(const job of jobs){
   if(!(await db.prepare('SELECT 1 FROM push_subscriptions WHERE id=?').get(job.subscription_id))||!(await db.prepare("SELECT 1 FROM slots WHERE id=? AND status='active'").get(job.booking_id)))continue;
   try{
    const minutes=Number(job.time.slice(0,2))*60+Number(job.time.slice(3))+job.duration_minutes;const end=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
    const payload={title:'Новая запись · İlker Sevim Barber Club',body:`${job.date}, ${job.time}–${end} · Баку. Открой панель для деталей.`,tag:'booking-'+job.booking_id,url:'/admin.html?booking='+job.booking_id};
    await pushSend(JSON.parse(job.subscription),JSON.stringify(payload));
    (await db.prepare('UPDATE push_deliveries SET sent_at=?,last_error=NULL WHERE id=?').run(now(),job.delivery_id));
   }catch(e){if([404,410].includes(e.statusCode)){(await db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(job.subscription_id));continue;}
    const attempts=job.attempts+1;(await db.prepare('UPDATE push_deliveries SET attempts=?,next_attempt=?,last_error=? WHERE id=?').run(attempts,now()+Math.min(3600000,10000*2**Math.min(attempts,8)),'push_unavailable',job.delivery_id));
   }
  }
 }finally{draining=false;}}
 // Always revalidate the worker and private UI. APIs and private records never enter a Service Worker cache.
 app.get('/sw.js',async(req,res)=>{res.set({'Cache-Control':'no-cache','Service-Worker-Allowed':'/'}).sendFile(path.join(__dirname,'../dist/sw.js'));});
 app.use(['/admin.html','/admin.js','/admin.css'],async(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/presentation{/:rest}',async(req,res)=>res.redirect('/'+(req.path.endsWith('/')?'':'')));
 app.use(express.static(path.join(__dirname,'../dist'),{index:'index.html'}));
 app.use((error,req,res,next)=>{if(error.status===400&&error.type==='entity.parse.failed')return res.status(400).json({error:'Некорректный JSON'});res.status(error.status||500).json({error:error.status?error.message:'Ошибка сервера. Повтори запрос с теми же данными.'});});
 return {app,db,shop,drainOutbox,close:()=>db.close()};
}
module.exports={createApp,verifyPassword};

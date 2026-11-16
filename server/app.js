'use strict';
const express=require('express');
const {AsyncLocalStorage}=require('node:async_hooks');
const {createAccessStore}=require('./access-store');
const {migrateAccess}=require('./access-migration');
const {migratePush}=require('./push-migration');
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
const {migrateReception}=require('./reception-migration');
const {createReceptionStore}=require('./reception-store');

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
 const requestAccess=new AsyncLocalStorage();
 const db={...rawdb,prepare:sql=>rawdb.prepare(scope(sql)),transaction:fn=>rawdb.transaction(async()=>{
  const guard=requestAccess.getStore();
  if(guard){const live=await rawdb.prepare('SELECT u.role FROM ilker_users u JOIN ilker_account_sessions a ON a.user_id=u.id JOIN ilker_sessions s ON s.token_hash=a.token_hash WHERE u.id=? AND u.active=1 AND a.token_hash=? AND s.expires>?').get(guard.userId,guard.token,now());if(!live||live.role!==guard.role)throw Object.assign(new Error('Сессия завершена. Войдите снова.'),{status:401});}
  return fn();
 })};
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
 let reception=null;
 const onBooked=async (bookingId,context)=>{
  if(reception)await reception.linkCreated(bookingId,context);
  const eventId=randomUUID();await db.prepare('INSERT INTO push_events(id,booking_id,created_at) VALUES(?,?,?)').run(eventId,bookingId,now());
  const subscriptions=await db.prepare('SELECT id FROM push_subscriptions').all();
  for(const sub of subscriptions)await db.prepare('INSERT INTO push_deliveries(id,event_id,subscription_id) VALUES(?,?,?)').run(randomUUID(),eventId,sub.id);
 };
 let shop=await prepareIlkerStore(db,{now,bootstrap:!options.preMigrated,sharedCapacity:!management,onBooked});
 if(management){
  if(options.migrateManagement&&!options.preMigrated){await migrateManagement(db);await migrateReception(db);}
  shop=await createManagementStore(db,shop,{now,onBooked});
  reception=await createReceptionStore(db,shop,{now});shop=reception;
 }
 if(!options.preMigrated)await db.exec(`
 CREATE TABLE IF NOT EXISTS ilker_sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS ilker_push_subscriptions(id TEXT PRIMARY KEY,endpoint TEXT UNIQUE NOT NULL,subscription TEXT NOT NULL,created_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS ilker_push_events(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES ilker_appointments(id) ON DELETE CASCADE,created_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS ilker_push_deliveries(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES ilker_push_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES ilker_push_subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,last_error TEXT,UNIQUE(event_id,subscription_id));
 `);
 let access=null;
 if(management){if(options.migrateManagement&&!options.preMigrated){await migrateAccess(db);await migratePush(db);}if(!await db.prepare('SELECT version FROM ilker_management_versions WHERE version=4').get())throw new Error('Push migration required');access=await createAccessStore(db,{now,bootstrapHash:adminHash,audit:shop.audit});}
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
 const receptionRoutes=new Set([
  'GET /api/admin/session','POST /api/admin/logout','GET /api/admin/day','POST /api/admin/day','POST /api/admin/slot',
  'POST /api/admin/availability','POST /api/admin/bookings/create','POST /api/admin/bookings/reschedule','POST /api/admin/bookings/status','POST /api/admin/bookings/comment',
  'GET /api/admin/dashboard','GET /api/admin/clients','POST /api/admin/clients/save','GET /api/admin/management',
  'POST /api/admin/master-exception','POST /api/admin/master-block','GET /api/admin/master-day','POST /api/admin/cancel',
  'GET /api/admin/services','POST /api/admin/price','POST /api/admin/complete','GET /api/admin/bookings',
  'GET /api/admin/push/config','POST /api/admin/push/subscribe','POST /api/admin/push/unsubscribe','POST /api/admin/push/test',
  'GET /api/admin/account','GET /api/admin/account/sessions','POST /api/admin/account/password','POST /api/admin/account/preferences','POST /api/admin/account/revoke'
 ]);
 async function auth(req,res,next){const cookie=req.get('cookie')||'';const sessionToken=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('rt_session='))?.slice(11);
  const session=access?await access.session(sessionToken):sessionToken&&(await db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(sha(sessionToken),now()));
  if(!session)return res.status(401).json({error:'Нужен вход владельца'});
  if(req.method!=='GET'&&req.get('x-csrf-token')!==session.csrf)return res.status(403).json({error:'Неверный CSRF-токен'});
  req.session=session;req.user=session.user||{id:'owner',role:'owner'};
  if(access&&req.user.role!=='owner'&&!receptionRoutes.has(req.method+' '+req.path)&&!(req.method==='GET'&&/^\/api\/admin\/booking\/[^/]+$/.test(req.path)))return res.status(403).json({error:'Недостаточно прав.'});
  if(access)return requestAccess.run({userId:req.user.id,role:req.user.role,token:session.token_hash},next);next();
 }
 const cookieOptions={httpOnly:true,sameSite:'strict',secure:production,path:'/api/admin'};
 app.post('/api/admin/login',limiter(access?30:5,15*60000),async(req,res)=>{
  if(access){const result=await access.login(req.body,req.ip,req.get('user-agent'));return res.cookie('rt_session',result.raw,{...cookieOptions,maxAge:8*3600000}).json({csrf:result.csrf,user:result.user});}
  if(!adminHash)return res.status(503).json({error:'Настрой ADMIN_PASSWORD_HASH'});
  const password=req.body.password;if(typeof password!=='string'||password.length>200||!verifyPassword(password,adminHash))return res.status(401).json({error:'Неверный пароль'});
  await db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());const raw=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(raw),csrf,now()+8*3600000);
  res.cookie('rt_session',raw,{...cookieOptions,maxAge:8*3600000}).json({csrf});
 });
 app.get('/api/admin/session',auth,async(req,res)=>res.json({csrf:req.session.csrf,...(access?{user:req.user}:{})}));
 app.post('/api/admin/logout',auth,async(req,res)=>{
  if(access){const result=await access.logout(req.user.id,req.session.token_hash,req.body.endpoint);return res.clearCookie('rt_session',cookieOptions).json(result);}
  if(typeof req.body.endpoint==='string')await db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(req.body.endpoint);
  await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);res.clearCookie('rt_session',cookieOptions).json({ok:true});
 });
 if(access){
  const sensitive=limiter(30,15*60000);
  app.get('/api/admin/account',auth,async(req,res)=>res.json({user:req.user}));
  app.get('/api/admin/account/sessions',auth,async(req,res)=>res.json({rows:await access.devices(req.user.id,req.session.token_hash)}));
  app.post('/api/admin/account/password',auth,sensitive,async(req,res)=>{const result=await access.changePassword(req.user.id,req.body);res.clearCookie('rt_session',cookieOptions).json(result);});
  app.post('/api/admin/account/preferences',auth,async(req,res)=>res.json({user:await access.preferences(req.user.id,req.body)}));
  app.post('/api/admin/account/revoke',auth,sensitive,async(req,res)=>{const result=await access.endSessions(req.user.id,req.body,req.session.token_hash);if(result.signInRequired)res.clearCookie('rt_session',cookieOptions);res.json(result);});
  app.get('/api/admin/users',auth,async(req,res)=>res.json({rows:await access.users(req.user.id)}));
  app.post('/api/admin/users',auth,sensitive,async(req,res)=>res.json(await access.saveUser(req.user.id,req.body)));
  app.get('/api/admin/audit',auth,limiter(20),async(req,res)=>res.json({rows:await access.events(req.user.id,req.query.offset)}));
 }
 app.get('/api/admin/day',auth,async(req,res)=>{
  if(!validDate(req.query.date))return res.status(400).json({error:'Некорректная дата'});
  const rows=await db.prepare(management?"SELECT * FROM slots WHERE date=? AND status IN ('active','arrived') ORDER BY time":"SELECT * FROM slots WHERE date=? AND status='active' ORDER BY time").all(req.query.date);
  const itemMap=await shop.itemsFor(rows.filter(row=>row.kind==='booking').map(row=>row.id));const slots=await Promise.all(rows.map(async({request_key,...safe})=>management?{...await shop.publicResult(safe),request_key:undefined}:{...safe,items:itemMap.get(safe.id)||[]}));
  res.json({date:req.query.date,closed:Boolean((await db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(req.query.date))),notificationsEnabled:pushEnabled,slots});
 });
 if(management){
  // All reception operations inherit the same authentication, CSRF and origin checks.
  app.post('/api/admin/availability',auth,async(req,res)=>res.json(await shop.adminAvailability(req.body)));
  app.post('/api/admin/bookings/create',auth,async(req,res)=>res.status(201).json(await shop.book(req.body,{internal:true,actor:req.user.id})));
  app.post('/api/admin/bookings/reschedule',auth,async(req,res)=>res.json(await shop.reschedule(req.body,req.user.id)));
  app.post('/api/admin/bookings/status',auth,async(req,res)=>res.json(await shop.setStatus(req.body,req.user.id)));
  app.post('/api/admin/bookings/comment',auth,async(req,res)=>res.json(await shop.comment(req.body,req.user.id)));
  app.get('/api/admin/dashboard',auth,async(req,res)=>{const data=await shop.dashboard(req.query.date);if(req.user.role!=='owner')delete data.revenueMinor;res.json(data);});
  app.get('/api/admin/clients',auth,limiter(40),async(req,res)=>res.json(await shop.clients(req.query)));
  app.post('/api/admin/clients/save',auth,async(req,res)=>res.json(await shop.saveClient(req.body,req.user.id)));
  app.post('/api/admin/clients/anonymize',auth,async(req,res)=>res.json(await shop.anonymizeClient(req.body,req.user.id)));
  app.get('/api/admin/finance',auth,async(req,res)=>res.json(await shop.finance(req.query)));
  app.post('/api/admin/finance/adjust',auth,async(req,res)=>res.json(await shop.adjustFinance(req.body,req.user.id)));
  app.get('/api/admin/finance/history/:id',auth,async(req,res)=>res.json({rows:await shop.ledgerHistory(req.params.id)}));
  app.get('/api/masters',async(req,res)=>res.json({masters:await shop.eligible({serviceIds:typeof req.query.serviceIds==='string'?req.query.serviceIds.split(','):[],room:req.query.room})}));
  app.get('/api/admin/management',auth,async(req,res)=>res.json({masters:await shop.masters(true),rooms:await shop.rooms(),services:await shop.services(true)}));
  app.post('/api/admin/masters',auth,async(req,res)=>res.json(await shop.saveMaster(req.body,req.user.id)));
  app.post('/api/admin/rooms',auth,async(req,res)=>res.json(await shop.saveRoom(req.body,req.user.id)));
  app.post('/api/admin/catalog',auth,async(req,res)=>res.json(await shop.saveService(req.body,req.user.id)));
  app.post('/api/admin/master-exception',auth,async(req,res)=>res.json(await shop.setException(req.body,req.user.id)));
  app.post('/api/admin/master-block',auth,async(req,res)=>res.json(await shop.setBlock(req.body,req.user.id)));
  app.get('/api/admin/master-day',auth,async(req,res)=>res.json(await shop.dayDetails(req.query.masterId,req.query.date)));
  app.get('/api/admin/master-history',auth,async(req,res)=>res.json(await shop.history(req.query.masterId,Number(req.query.offset||0))));
 }
 app.post('/api/admin/slot',auth,async(req,res)=>res.json(await shop.setSlot(req.body.date,req.body.time,req.body.blocked,req.body.masterId,req.user.id)));
 app.post('/api/admin/day',auth,async(req,res)=>res.json(await shop.setDay(req.body.date,req.body.closed,req.body.masterId,req.user.id)));
 app.post('/api/admin/cancel',auth,async(req,res)=>res.json(await shop.cancel(req.body.id,req.user.id)));
 app.get('/api/admin/services',auth,async(req,res)=>res.json({services:await shop.settings()}));
 app.post('/api/admin/duration',auth,async(req,res)=>res.json(await shop.setDuration(req.body.serviceId,req.body.room,req.body.minutes,req.user.id)));
 app.post('/api/admin/price',auth,async(req,res)=>res.json(await shop.setActualPrice(req.body.id,req.body.price,req.user.id)));
 app.post('/api/admin/complete',auth,async(req,res)=>res.json(await shop.complete(req.body.id,req.user.id)));
 app.get('/api/admin/revenue',auth,async(req,res)=>res.json(await shop.revenue()));
 function validSubscription(subscription){
  try{const url=new URL(subscription.endpoint);const host=url.hostname.toLowerCase();
   const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
   return allowed&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&subscription.endpoint.length<2048&&/^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth||'');
  }catch{return false;}
 }
 app.get('/api/admin/push/config',auth,async(req,res)=>res.json({enabled:pushEnabled,publicKey:pushEnabled?vapid.publicKey:null,deviceCount:access?await access.deviceCount(req.user.id):(await db.prepare('SELECT count(*) AS n FROM push_subscriptions').get()).n}));
 app.post('/api/admin/push/subscribe',auth,async(req,res)=>{
  if(!pushEnabled)return res.status(503).json({error:'Настрой VAPID на сервере'});
  if(!validSubscription(req.body.subscription))return res.status(400).json({error:'Недопустимая Push-подписка'});
  const subscription=req.body.subscription;
  const safe={endpoint:subscription.endpoint,expirationTime:subscription.expirationTime||null,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}};
  if(safe.expirationTime&&(!Number.isFinite(safe.expirationTime)||safe.expirationTime<now()))return res.status(400).json({error:'Подписка истекла'});
  if(access)return res.json(await access.subscribe(req.user.id,safe,req.session.token_hash));
  if(!(await db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint=?').get(safe.endpoint))&&(await db.prepare('SELECT count(*) AS n FROM push_subscriptions').get()).n>=20)return res.status(409).json({error:'Достигнут лимит 20 устройств'});
  (await db.prepare('INSERT INTO push_subscriptions(id,endpoint,subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription').run(randomUUID(),safe.endpoint,JSON.stringify(safe),now()));
  res.json({ok:true});
 });
 app.post('/api/admin/push/unsubscribe',auth,async(req,res)=>{if(typeof req.body.endpoint!=='string')return res.status(400).json({error:'Нужна подписка'});if(access)await access.unsubscribe(req.user.id,req.body.endpoint);else await db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(req.body.endpoint);res.json({ok:true});});
 app.post('/api/admin/push/test',auth,limiter(3,60000),async(req,res)=>{
  const row=access?await access.ownsPush(req.user.id,req.body.endpoint||''):await db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').get(typeof req.body.endpoint==='string'?req.body.endpoint:'');
  if(!pushEnabled||!row)return res.status(400).json({error:'Сначала включи Push на этом устройстве'});
  try{await pushSend(JSON.parse(row.subscription),JSON.stringify({title:'İlker Sevim Barber Club',body:({ru:'Проверка Push-уведомлений',az:'Push bildirişinin yoxlanılması',en:'Push notification test'}[req.user.language]||'Проверка Push-уведомлений'),tag:'rt-test',url:'/admin.html'}));res.json({ok:true});}
  catch(e){if([404,410].includes(e.statusCode))(await db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id));res.status(502).json({error:'Push-сервис не принял сообщение. Проверь подписку и настройки.'});}
 });
 app.get('/api/admin/bookings',auth,async(req,res)=>{
  if(management)return res.json(await shop.listBookings(req.query));
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
  if(management)return res.json(await shop.getBooking(req.params.id));
  const row=(await db.prepare("SELECT id,date,time,status,name,phone,service_id,service_name,room,price_min,price_max,actual_price,duration_minutes,sessions_count,created_at FROM slots WHERE id=? AND kind='booking'").get(req.params.id));
  if(!row)return res.status(404).json({error:'Запись не найдена'});res.json(management?await shop.publicResult(row):{...row,items:await shop.items(row.id)});
 });
 app.post('/api/admin/delete',auth,async(req,res)=>res.json(await shop.remove(req.body.id,req.user.id)));
 let draining=false;
 async function drainOutbox(){if(draining||!pushEnabled)return;draining=true;try{
  const query="SELECT d.id AS delivery_id,d.attempts,p.subscription,p.id AS subscription_id,s.id AS booking_id,s.date,s.time,s.duration_minutes FROM push_deliveries d JOIN push_events e ON e.id=d.event_id JOIN slots s ON s.id=e.booking_id JOIN push_subscriptions p ON p.id=d.subscription_id WHERE d.sent_at IS NULL AND d.next_attempt<=? AND s.status='active'";
  const jobs=management?await db.transaction(async()=>{
   const candidates=await db.prepare(query+" AND NOT EXISTS (SELECT 1 FROM ilker_push_leases l WHERE l.delivery_id=d.id AND l.expires>?) ORDER BY d.id LIMIT 20").all(now(),now());
   for(const job of candidates){job.lease=randomUUID();await db.prepare('INSERT INTO ilker_push_leases(delivery_id,token,expires) VALUES(?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET token=excluded.token,expires=excluded.expires').run(job.delivery_id,job.lease,now()+300000);}
   return candidates;
  }):await db.prepare(query+' ORDER BY d.id LIMIT 20').all(now());
  for(const job of jobs){
   // A timed-out worker must not overwrite a newer worker's outcome, or delete
   // a device after ownership of the attempt has passed to another worker.
   const finish=async fn=>management?db.transaction(async()=>{
    const lease=await db.prepare('SELECT token FROM ilker_push_leases WHERE delivery_id=?').get(job.delivery_id);
    if(lease?.token!==job.lease)return;
    await fn();await db.prepare('DELETE FROM ilker_push_leases WHERE delivery_id=? AND token=?').run(job.delivery_id,job.lease);
   }):fn();
   if(!(await db.prepare('SELECT 1 FROM push_subscriptions WHERE id=?').get(job.subscription_id))||!(await db.prepare("SELECT 1 FROM slots WHERE id=? AND status='active'").get(job.booking_id)))continue;
   try{
    const minutes=Number(job.time.slice(0,2))*60+Number(job.time.slice(3))+job.duration_minutes;const end=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
    const recipient=access?await db.prepare('SELECT u.language,u.push_private FROM ilker_users u JOIN ilker_push_owners o ON o.user_id=u.id WHERE o.subscription_id=? AND u.active=1').get(job.subscription_id):null;
    if(access&&!recipient)continue;
    const texts={ru:['Новая запись','Откройте панель для деталей.'],az:['Yeni rezervasiya','Ətraflı məlumat üçün paneli açın.'],en:['New booking','Open the dashboard for details.']}[recipient?.language||'ru'];
    const payload={title:'Новая запись · İlker Sevim Barber Club',body:`${job.date}, ${job.time}–${end} · Баку. Открой панель для деталей.`,tag:'booking-'+job.booking_id,url:'/admin.html?booking='+job.booking_id};
    if(recipient){payload.title=texts[0]+' · İlker Sevim';payload.body=recipient.push_private?texts[1]:`${job.date}, ${job.time}–${end} · ${texts[1]}`;}
    await pushSend(JSON.parse(job.subscription),JSON.stringify(payload));
    await finish(()=>db.prepare('UPDATE push_deliveries SET sent_at=?,last_error=NULL WHERE id=?').run(now(),job.delivery_id));
   }catch(e){if([404,410].includes(e.statusCode)){await finish(()=>db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(job.subscription_id));continue;}
    const attempts=job.attempts+1;await finish(()=>db.prepare('UPDATE push_deliveries SET attempts=?,next_attempt=?,last_error=? WHERE id=?').run(attempts,now()+Math.min(3600000,10000*2**Math.min(attempts,8)),'push_unavailable',job.delivery_id));
   }finally{if(management)await db.prepare('DELETE FROM ilker_push_leases WHERE delivery_id=? AND token=?').run(job.delivery_id,job.lease);}
  }
 }finally{draining=false;}}
 // Always revalidate the worker and private UI. APIs and private records never enter a Service Worker cache.
 app.get('/sw.js',async(req,res)=>{res.set({'Cache-Control':'no-cache','Service-Worker-Allowed':'/'}).sendFile(path.join(__dirname,'../dist/sw.js'));});
 app.use(['/admin.html','/admin.js','/admin.css'],async(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/presentation{/:rest}',async(req,res)=>res.redirect('/'+(req.path.endsWith('/')?'':'')));
 app.use(express.static(path.join(__dirname,'../dist'),{index:'index.html'}));
 app.use((error,req,res,next)=>{if(error.status===400&&error.type==='entity.parse.failed')return res.status(400).json({error:'Некорректный JSON'});res.status(error.status||500).json({error:error.status?error.message:'Ошибка сервера. Повтори запрос с теми же данными.'});});
 return {app,db,shop,access,drainOutbox,close:()=>db.close()};
}
module.exports={createApp,verifyPassword};

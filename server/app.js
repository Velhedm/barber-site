'use strict';
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const {DatabaseSync}=require('node:sqlite');
const {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash}=require('node:crypto');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const webpush=require('web-push');
const SERVICES=[['haircut','Мужская стрижка',40],['kids','Детская стрижка',35],['beard','Коррекция бороды',25],['combo','Стрижка + борода',50],['peeling','Пилинг кожи головы',30],['styling','Укладка',20]];
const sha=value=>createHash('sha256').update(value).digest('hex');
function verifyPassword(password,hash){try{const [salt,key]=hash.split(':');const expected=Buffer.from(key,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}
function createApp(options={}){
 const databasePath=options.databasePath||process.env.DB_PATH||'data/bookings.sqlite';
 if(databasePath!==':memory:')mkdirSync(path.dirname(databasePath),{recursive:true});
 const db=new DatabaseSync(databasePath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS slots(id TEXT PRIMARY KEY,date TEXT NOT NULL,time TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('booking','block')),status TEXT NOT NULL DEFAULT 'active',name TEXT,phone TEXT,service_id TEXT,request_key TEXT UNIQUE,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot ON slots(date,time) WHERE status='active';
 CREATE TABLE IF NOT EXISTS closed_days(date TEXT PRIMARY KEY);
 DROP TABLE IF EXISTS outbox;
 CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,endpoint TEXT UNIQUE NOT NULL,subscription TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_events(id INTEGER PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_deliveries(id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES push_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,sent_at INTEGER,last_error TEXT,UNIQUE(event_id,subscription_id));
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 `);
 const production=options.production??(process.env.NODE_ENV==='production');
 const vapid=options.vapid||{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY};
 const pushEnabled=Boolean(vapid.subject&&vapid.publicKey&&vapid.privateKey);
 if(pushEnabled)webpush.setVapidDetails(vapid.subject,vapid.publicKey,vapid.privateKey);
 const pushSend=options.pushSend||((subscription,payload)=>webpush.sendNotification(subscription,payload,{vapidDetails:vapid,TTL:86400,urgency:'high',timeout:10000}));
 const adminHash=options.adminHash??process.env.ADMIN_PASSWORD_HASH;
 const origin=options.origin||process.env.APP_ORIGIN;
 const now=options.now||(()=>Date.now());

 const hours=Array.from({length:10},(_,i)=>String(10+i).padStart(2,'0')+':00');
 const horizon=365;
 function today(){return new Date(now()+4*3600000).toISOString().slice(0,10);}
 function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date&&date>=today()&&date<=new Date(now()+4*3600000+horizon*86400000).toISOString().slice(0,10);}
 function validTime(date,time){return validDate(date)&&hours.includes(time)&&Date.parse(date+'T'+time+':00+04:00')>now();}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 if(production&&(!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(adminHash||'')||!origin||!pushEnabled))throw new Error('Production requires ADMIN_PASSWORD_HASH, APP_ORIGIN and valid VAPID settings');
 const app=express();app.disable('x-powered-by');if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'",'https://fonts.googleapis.com','https://cdnjs.cloudflare.com'],fontSrc:["'self'",'https://fonts.gstatic.com','https://cdnjs.cloudflare.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"],upgradeInsecureRequests:production?[]:null}}}));
 app.use('/api',express.json({limit:'8kb'}),(req,res,next)=>{res.set('Cache-Control','no-store');if(req.method!=='GET'&&req.method!=='HEAD'){
  if(!req.is('application/json'))return res.status(415).json({error:'Ожидается JSON'});
  if(req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Недопустимый источник запроса'});
  const allowed=origin||`${req.protocol}://${req.get('host')}`;
  if(req.get('origin')&&req.get('origin')!==allowed)return res.status(403).json({error:'Недопустимый источник запроса'});
 }next();});
 const limiter=(limit,windowMs=60000)=>rateLimit({windowMs,limit,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много запросов. Попробуй позже.'}});
 app.use('/api',limiter(180));
 app.get('/healthz',(req,res)=>{db.prepare('SELECT 1').get();res.json({ok:true});});
 app.get('/api/meta',(req,res)=>res.json({serverTime:now(),timezone:'Asia/Baku',hours,services:SERVICES.map(([id,name,price])=>({id,name,price})),notificationsEnabled:pushEnabled,maxDaysAhead:horizon}));
 app.get('/api/availability',(req,res)=>{
  const date=req.query.date;if(!validDate(date))return res.status(400).json({error:'Дата должна быть в пределах ближайшего года'});
  const closed=Boolean(db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(date));const rows=db.prepare("SELECT time,kind FROM slots WHERE date=? AND status='active'").all(date);
  res.json({date,serverTime:now(),dayClosed:closed,slots:hours.map(time=>{const row=rows.find(r=>r.time===time);return {time,status:!validTime(date,time)?'past':closed?'blocked':row?(row.kind==='booking'?'booked':'blocked'):'available'};})});
 });
 app.post('/api/bookings',limiter(options.bookingLimit||12,10*60000),(req,res,next)=>{try{
  const {date,time,name,phone,serviceId,requestKey}=req.body;
  if(typeof name!=='string'||name.trim().length<2||name.length>80||/[\u0000-\u001f]/.test(name)||typeof phone!=='string'||phone.length>24||!/^\+?[0-9() .-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15||!SERVICES.some(s=>s[0]===serviceId)||typeof requestKey!=='string'||!/^[\da-f-]{36}$/i.test(requestKey))throw fail(400,'Проверь имя, телефон и услугу');
  const normalized={date,time,name:name.trim(),phone:phone.trim(),service_id:serviceId};
  const booking=transaction(()=>{
   const previous=db.prepare('SELECT * FROM slots WHERE request_key=?').get(requestKey);
   if(previous){if(previous.status!=='active'||Object.entries(normalized).some(([k,v])=>previous[k]!==v))throw fail(409,'Повторный запрос отличается от исходной записи');return previous;}
   if(!validTime(date,time))throw fail(400,'Выбери будущий часовой слот');
   if(db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(date)||db.prepare("SELECT 1 FROM slots WHERE date=? AND time=? AND status='active'").get(date,time))throw fail(409,'Этот слот уже занят. Выбери другой час.');
   const id=randomUUID();db.prepare('INSERT INTO slots(id,date,time,kind,name,phone,service_id,request_key,created_at) VALUES(?,?,?,\'booking\',?,?,?,?,?)').run(id,date,time,normalized.name,normalized.phone,serviceId,requestKey,new Date(now()).toISOString());
   const event=db.prepare('INSERT INTO push_events(booking_id,created_at) VALUES(?,?)').run(id,now());
   db.prepare('INSERT INTO push_deliveries(event_id,subscription_id) SELECT ?,id FROM push_subscriptions').run(event.lastInsertRowid);return db.prepare('SELECT * FROM slots WHERE id=?').get(id);
  });
  res.status(201).json({id:booking.id,date:booking.date,time:booking.time,serviceId:booking.service_id,status:'confirmed'});
 }catch(e){next(e);}});
 function auth(req,res,next){const cookie=req.get('cookie')||'';const sessionToken=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('rt_session='))?.slice(11);
  const session=sessionToken&&db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(sha(sessionToken),now());
  if(!session)return res.status(401).json({error:'Нужен вход владельца'});
  if(req.method!=='GET'&&req.get('x-csrf-token')!==session.csrf)return res.status(403).json({error:'Неверный CSRF-токен'});req.session=session;next();
 }
 app.post('/api/admin/login',limiter(5,15*60000),(req,res)=>{
  if(!adminHash)return res.status(503).json({error:'Настрой ADMIN_PASSWORD_HASH'});
  const password=req.body.password;if(typeof password!=='string'||password.length>200||!verifyPassword(password,adminHash))return res.status(401).json({error:'Неверный пароль'});
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());const raw=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(raw),csrf,now()+8*3600000);
  res.cookie('rt_session',raw,{httpOnly:true,sameSite:'strict',secure:production,maxAge:8*3600000,path:'/api/admin'}).json({csrf});
 });
 app.get('/api/admin/session',auth,(req,res)=>res.json({csrf:req.session.csrf}));
 app.post('/api/admin/logout',auth,(req,res)=>{if(typeof req.body.endpoint==='string')db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(req.body.endpoint);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);res.clearCookie('rt_session',{path:'/api/admin',httpOnly:true,sameSite:'strict',secure:production}).json({ok:true});});
 app.get('/api/admin/day',auth,(req,res)=>{
  if(!validDate(req.query.date))return res.status(400).json({error:'Некорректная дата'});
  res.json({date:req.query.date,closed:Boolean(db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(req.query.date)),notificationsEnabled:pushEnabled,slots:db.prepare("SELECT * FROM slots WHERE date=? AND status='active' ORDER BY time").all(req.query.date).map(({request_key,...safe})=>safe)});
 });
 app.post('/api/admin/slot',auth,(req,res,next)=>{try{
  const {date,time,blocked}=req.body;if(!validTime(date,time)||typeof blocked!=='boolean')throw fail(400,'Неверный будущий слот');
  transaction(()=>{const existing=db.prepare("SELECT * FROM slots WHERE date=? AND time=? AND status='active'").get(date,time);
   if(existing?.kind==='booking')throw fail(409,'Сначала отдельно отмени запись клиента');
   if(blocked&&!existing)db.prepare("INSERT INTO slots(id,date,time,kind,created_at) VALUES(?,?,?,'block',?)").run(randomUUID(),date,time,new Date(now()).toISOString());
   if(!blocked&&existing)db.prepare("UPDATE slots SET status='cancelled' WHERE id=?").run(existing.id);
  });res.json({ok:true});
 }catch(e){next(e);}});
 app.post('/api/admin/day',auth,(req,res,next)=>{try{const {date,closed}=req.body;if(!validDate(date)||typeof closed!=='boolean')throw fail(400,'Неверная дата');transaction(()=>{if(closed)db.prepare('INSERT OR IGNORE INTO closed_days VALUES(?)').run(date);else db.prepare('DELETE FROM closed_days WHERE date=?').run(date);});res.json({ok:true});}catch(e){next(e);}});
 app.post('/api/admin/cancel',auth,(req,res)=>{const row=db.prepare("SELECT * FROM slots WHERE id=? AND kind='booking' AND status='active'").get(req.body.id);if(!row)return res.status(404).json({error:'Запись не найдена'});db.prepare("UPDATE slots SET status='cancelled' WHERE id=?").run(row.id);res.json({ok:true});});
 function validSubscription(subscription){
  try{const url=new URL(subscription.endpoint);const host=url.hostname.toLowerCase();
   const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
   return allowed&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&subscription.endpoint.length<2048&&/^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth||'');
  }catch{return false;}
 }
 app.get('/api/admin/push/config',auth,(req,res)=>res.json({enabled:pushEnabled,publicKey:pushEnabled?vapid.publicKey:null,deviceCount:db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n}));
 app.post('/api/admin/push/subscribe',auth,(req,res)=>{
  if(!pushEnabled)return res.status(503).json({error:'Настрой VAPID на сервере'});
  if(!validSubscription(req.body.subscription))return res.status(400).json({error:'Недопустимая Push-подписка'});
  const subscription=req.body.subscription;
  const safe={endpoint:subscription.endpoint,expirationTime:subscription.expirationTime||null,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}};
  if(safe.expirationTime&&(!Number.isFinite(safe.expirationTime)||safe.expirationTime<now()))return res.status(400).json({error:'Подписка истекла'});
  if(!db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint=?').get(safe.endpoint)&&db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n>=20)return res.status(409).json({error:'Достигнут лимит 20 устройств'});
  db.prepare('INSERT INTO push_subscriptions(id,endpoint,subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription').run(randomUUID(),safe.endpoint,JSON.stringify(safe),now());
  res.json({ok:true});
 });
 app.post('/api/admin/push/unsubscribe',auth,(req,res)=>{if(typeof req.body.endpoint!=='string')return res.status(400).json({error:'Нужна подписка'});db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(req.body.endpoint);res.json({ok:true});});
 app.post('/api/admin/push/test',auth,limiter(3,60000),async(req,res)=>{
  const row=db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').get(typeof req.body.endpoint==='string'?req.body.endpoint:'');
  if(!pushEnabled||!row)return res.status(400).json({error:'Сначала включи Push на этом устройстве'});
  try{await pushSend(JSON.parse(row.subscription),JSON.stringify({title:'Ruslan True',body:'Проверка Push-уведомлений',tag:'rt-test',url:'/admin.html'}));res.json({ok:true});}
  catch(e){if([404,410].includes(e.statusCode))db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id);res.status(502).json({error:'Push-сервис не принял сообщение. Проверь подписку и настройки.'});}
 });
 app.get('/api/admin/bookings',auth,(req,res)=>{
  const status=['active','cancelled','all'].includes(req.query.status)?req.query.status:'active';
  const offset=Math.max(0,Math.min(1000000,Math.trunc(Number(req.query.offset)||0)));
  const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,80):'';
  const condition="kind='booking' AND (?='all' OR status=?) AND (?='' OR instr(name,?)>0 OR instr(phone,?)>0)";
  const args=[status,status,q,q,q];
  const rows=db.prepare(`SELECT id,date,time,status,name,phone,service_id,created_at FROM slots WHERE ${condition} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`).all(...args,offset);
  const count=db.prepare(`SELECT count(*) AS n FROM slots WHERE ${condition}`).get(...args).n;
  res.json({rows,count,offset});
 });
 app.get('/api/admin/booking/:id',auth,(req,res)=>{
  const row=db.prepare("SELECT id,date,time,status,name,phone,service_id,created_at FROM slots WHERE id=? AND kind='booking'").get(req.params.id);
  if(!row)return res.status(404).json({error:'Запись не найдена'});res.json(row);
 });
 app.post('/api/admin/delete',auth,(req,res)=>{
  if(typeof req.body.id!=='string')return res.status(400).json({error:'Нужен ID записи'});
  // Only cancelled records can be erased, so deleting a client record never silently frees a reservation.
  const result=db.prepare("DELETE FROM slots WHERE id=? AND kind='booking' AND status='cancelled'").run(req.body.id);
  if(!result.changes)return res.status(409).json({error:'Сначала отмени запись, затем удаляй персональные данные'});
  res.json({ok:true});
 });
 let draining=false;
 async function drainOutbox(){if(draining||!pushEnabled)return;draining=true;try{
  const jobs=db.prepare("SELECT d.id AS delivery_id,d.attempts,p.subscription,p.id AS subscription_id,s.id AS booking_id,s.date,s.time FROM push_deliveries d JOIN push_events e ON e.id=d.event_id JOIN slots s ON s.id=e.booking_id JOIN push_subscriptions p ON p.id=d.subscription_id WHERE d.sent_at IS NULL AND d.next_attempt<=? AND s.status='active' ORDER BY d.id LIMIT 20").all(now());
  for(const job of jobs){
   if(!db.prepare('SELECT 1 FROM push_subscriptions WHERE id=?').get(job.subscription_id)||!db.prepare("SELECT 1 FROM slots WHERE id=? AND status='active'").get(job.booking_id))continue;
   try{
    const end=String(Number(job.time.slice(0,2))+1).padStart(2,'0')+':00';
    const payload={title:'Новая запись · Ruslan True',body:`${job.date}, ${job.time}–${end} · Баку. Открой панель для деталей.`,tag:'booking-'+job.booking_id,url:'/admin.html?booking='+job.booking_id};
    await pushSend(JSON.parse(job.subscription),JSON.stringify(payload));
    db.prepare('UPDATE push_deliveries SET sent_at=?,last_error=NULL WHERE id=?').run(now(),job.delivery_id);
   }catch(e){if([404,410].includes(e.statusCode)){db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(job.subscription_id);continue;}
    const attempts=job.attempts+1;db.prepare('UPDATE push_deliveries SET attempts=?,next_attempt=?,last_error=? WHERE id=?').run(attempts,now()+Math.min(3600000,10000*2**Math.min(attempts,8)),'push_unavailable',job.delivery_id);
   }
  }
 }finally{draining=false;}}
 // Always revalidate the worker and private UI. APIs and private records never enter a Service Worker cache.
 app.get('/sw.js',(req,res)=>{res.set({'Cache-Control':'no-cache','Service-Worker-Allowed':'/'}).sendFile(path.join(__dirname,'../dist/sw.js'));});
 app.use(['/admin.html','/admin.js','/admin.css'],(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/presentation{/:rest}',(req,res)=>res.redirect('/'+(req.path.endsWith('/')?'':'')));
 app.use(express.static(path.join(__dirname,'../dist'),{index:'index.html'}));
 app.use((error,req,res,next)=>{if(error.status===400&&error.type==='entity.parse.failed')return res.status(400).json({error:'Некорректный JSON'});res.status(error.status||500).json({error:error.status?error.message:'Ошибка сервера. Повтори запрос с теми же данными.'});});
 return {app,db,drainOutbox,close:()=>db.close()};
}
module.exports={createApp,verifyPassword};

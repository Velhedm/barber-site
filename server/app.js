'use strict';
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const {DatabaseSync}=require('node:sqlite');
const {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash}=require('node:crypto');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
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
 CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES slots(id),attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,sent_at INTEGER,last_error TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 `);
 const production=options.production??(process.env.NODE_ENV==='production');
 const token=options.telegramToken??process.env.TELEGRAM_BOT_TOKEN;
 const chatId=options.chatId??process.env.TELEGRAM_CHAT_ID;
 const adminHash=options.adminHash??process.env.ADMIN_PASSWORD_HASH;
 const origin=options.origin||process.env.APP_ORIGIN;
 const now=options.now||(()=>Date.now());
 const telegramFetch=options.telegramFetch||fetch;
 const hours=Array.from({length:10},(_,i)=>String(10+i).padStart(2,'0')+':00');
 const horizon=365;
 function today(){return new Date(now()+4*3600000).toISOString().slice(0,10);}
 function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date&&date>=today()&&date<=new Date(now()+4*3600000+horizon*86400000).toISOString().slice(0,10);}
 function validTime(date,time){return validDate(date)&&hours.includes(time)&&Date.parse(date+'T'+time+':00+04:00')>now();}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 if(production&&(!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(adminHash||'')||!origin||!token||!chatId))throw new Error('Production requires ADMIN_PASSWORD_HASH, APP_ORIGIN, TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID');
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
 app.get('/api/meta',(req,res)=>res.json({serverTime:now(),timezone:'Asia/Baku',hours,services:SERVICES.map(([id,name,price])=>({id,name,price})),notificationsEnabled:Boolean(token&&chatId),maxDaysAhead:horizon}));
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
   db.prepare('INSERT INTO outbox(booking_id) VALUES(?)').run(id);return db.prepare('SELECT * FROM slots WHERE id=?').get(id);
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
 app.post('/api/admin/logout',auth,(req,res)=>{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);res.clearCookie('rt_session',{path:'/api/admin',httpOnly:true,sameSite:'strict',secure:production}).json({ok:true});});
 app.get('/api/admin/day',auth,(req,res)=>{
  if(!validDate(req.query.date))return res.status(400).json({error:'Некорректная дата'});
  res.json({date:req.query.date,closed:Boolean(db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(req.query.date)),notificationsEnabled:Boolean(token&&chatId),slots:db.prepare("SELECT s.*,o.sent_at,o.attempts,o.last_error FROM slots s LEFT JOIN outbox o ON o.booking_id=s.id WHERE s.date=? AND s.status='active' ORDER BY s.time").all(req.query.date).map(({request_key,...safe})=>safe)});
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
 let draining=false;
 async function drainOutbox(){if(draining||!token||!chatId)return;draining=true;try{
  const jobs=db.prepare("SELECT o.id AS job_id,o.attempts,s.* FROM outbox o JOIN slots s ON s.id=o.booking_id WHERE o.sent_at IS NULL AND o.next_attempt<=? AND s.status='active' ORDER BY o.id LIMIT 10").all(now());
  for(const job of jobs){try{
   const service=SERVICES.find(s=>s[0]===job.service_id);const end=String(Number(job.time.slice(0,2))+1).padStart(2,'0')+':00';
   const text=`⚡ Новая запись!\nИмя: ${job.name}\nДата: ${job.date}\nВремя: ${job.time} - ${end} (Баку, UTC+4)\nТелефон: ${job.phone}\nУслуга: ${service[1]} — ${service[2]} AZN\nЗапись: ${job.id}`;
   const response=await telegramFetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text}),signal:AbortSignal.timeout(10000)});
   const result=await response.json();if(!response.ok||!result.ok)throw new Error('telegram_unavailable');
   db.prepare('UPDATE outbox SET sent_at=?,last_error=NULL WHERE id=?').run(now(),job.job_id);
  }catch{const attempts=job.attempts+1;db.prepare('UPDATE outbox SET attempts=?,next_attempt=?,last_error=? WHERE id=?').run(attempts,now()+Math.min(3600000,10000*2**Math.min(attempts,8)),'telegram_unavailable',job.job_id);}}
 }finally{draining=false;}}
 app.get('/presentation{/:rest}',(req,res)=>res.redirect('/'+(req.path.endsWith('/')?'':'')));
 app.use(express.static(path.join(__dirname,'../dist'),{index:'index.html'}));
 app.use((error,req,res,next)=>{if(error.status===400&&error.type==='entity.parse.failed')return res.status(400).json({error:'Некорректный JSON'});res.status(error.status||500).json({error:error.status?error.message:'Ошибка сервера. Повтори запрос с теми же данными.'});});
 return {app,db,drainOutbox,close:()=>db.close()};
}
module.exports={createApp,verifyPassword};

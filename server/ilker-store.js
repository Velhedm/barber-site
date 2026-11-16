'use strict';
// The new salon uses separate tables; legacy records remain untouched.
const {randomUUID}=require('node:crypto');
const {catalog,quote}=require('./ilker-services');
const {interval,overlaps,isAvailable}=require('./ilker-booking-rules');
const knownServices=catalog.categories.flatMap(group=>group.services);
const fail=(status,message)=>Object.assign(new Error(message),{status});
// Store currency as integer qəpik to avoid rounding errors; client-facing prices remain AZN.
function toMinor(amount){
 if(typeof amount!=='string'&&typeof amount!=='number')return null;
 const value=String(amount);if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
function formatAmount(minor){return (minor/100).toFixed(2);}
async function prepareIlkerStore(db,{now=()=>Date.now(),onBooked=async()=>{},bootstrap=true,sharedCapacity=true}={}){
 if(bootstrap){
 await db.exec(`
 CREATE TABLE IF NOT EXISTS ilker_service_settings(id TEXT PRIMARY KEY,duration_minutes INTEGER);
 CREATE TABLE IF NOT EXISTS ilker_closed_days(date TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS ilker_appointments(
  id TEXT PRIMARY KEY,date TEXT NOT NULL,time TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',
  name TEXT,phone TEXT,service_id TEXT,room TEXT,service_name TEXT,price_min INTEGER,price_max INTEGER,actual_price INTEGER,
  duration_minutes INTEGER NOT NULL,sessions_count INTEGER NOT NULL DEFAULT 1,request_key TEXT UNIQUE,created_at TEXT NOT NULL
 );
 ${sharedCapacity?"CREATE UNIQUE INDEX IF NOT EXISTS ilker_unique_active_slot ON ilker_appointments(date,time) WHERE status='active';":''}
 CREATE TABLE IF NOT EXISTS ilker_booking_items(booking_id TEXT NOT NULL REFERENCES ilker_appointments(id) ON DELETE CASCADE,position INTEGER NOT NULL,service_id TEXT NOT NULL,service_name TEXT NOT NULL,price_min INTEGER NOT NULL,price_max INTEGER NOT NULL,duration_minutes INTEGER NOT NULL,sessions_count INTEGER NOT NULL,PRIMARY KEY(booking_id,position));
 `);
 for(const service of knownServices)for(const room of ['zal','vip'])await db.prepare('INSERT INTO ilker_service_settings(id,duration_minutes) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(service.id+':'+room,service.duration_minutes??null);
 }else{
  const rows=await db.prepare('SELECT id FROM ilker_service_settings').all();
  const ids=new Set(rows.map(row=>row.id));
  if(knownServices.some(service=>['zal','vip'].some(room=>!ids.has(service.id+':'+room))))throw new Error('Salon settings are incomplete; migration required');
  await db.prepare('SELECT booking_id FROM ilker_booking_items LIMIT 1').all();
 }
 async function settings(){return db.prepare('SELECT id,duration_minutes FROM ilker_service_settings').all();}
 async function setDuration(serviceId,room,minutes){
  if(!knownServices.some(s=>s.id===serviceId)||!['zal','vip'].includes(room))throw fail(404,'Unknown service or room');
  if(minutes!==null&&(!Number.isInteger(minutes)||minutes<1||minutes>720))throw fail(400,'Invalid duration');
  await db.prepare('UPDATE ilker_service_settings SET duration_minutes=? WHERE id=?').run(minutes,serviceId+':'+room);return {serviceId,room,durationMinutes:minutes};
 }
 function validDate(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const parsed=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)return false;
  const today=new Date(now()+4*3600000).toISOString().slice(0,10),end=new Date(now()+4*3600000+365*86400000).toISOString().slice(0,10);
  return date>=today&&date<=end;
 }
 function selection(serviceIds,serviceId){const ids=serviceIds===undefined?[serviceId]:serviceIds;if(!Array.isArray(ids)||!ids.length||ids.length>21||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw fail(400,'Unknown service or room');return ids;}
 async function selectedServices(ids,room){const values=new Map((await settings()).map(row=>[row.id,row.duration_minutes]));return ids.map(id=>{let item;try{item=quote(id,room);}catch{throw fail(400,'Unknown service or room');}return {...item,durationMinutes:values.get(id+':'+room)??null};});}
 async function items(bookingId){return db.prepare('SELECT service_id,service_name,price_min,price_max,duration_minutes,sessions_count FROM ilker_booking_items WHERE booking_id=? ORDER BY position').all(bookingId);}
 async function itemsFor(ids){const result=new Map();if(!ids.length)return result;const rows=await db.prepare(`SELECT booking_id,service_id,service_name,price_min,price_max,duration_minutes,sessions_count FROM ilker_booking_items WHERE booking_id IN (${ids.map(()=>'?').join(',')}) ORDER BY booking_id,position`).all(...ids);for(const {booking_id,...item} of rows){if(!result.has(booking_id))result.set(booking_id,[]);result.get(booking_id).push(item);}return result;}
 async function availability(date,serviceId,room,serviceIds){
  if(!validDate(date))throw fail(400,'Invalid date');
  let duration=60;
  if(serviceId!==undefined||serviceIds!==undefined){const chosen=await selectedServices(selection(serviceIds,serviceId),room);
   duration=chosen.some(item=>item.durationMinutes===null)?null:chosen.reduce((sum,item)=>sum+item.durationMinutes,0);
  }
  const dayClosed=Boolean(await db.prepare('SELECT 1 FROM ilker_closed_days WHERE date=?').get(date));
  const rows=await db.prepare("SELECT time,duration_minutes,kind FROM ilker_appointments WHERE date=? AND status='active'").all(date);
  const slots=Array.from({length:12},(_,index)=>String(index+9).padStart(2,'0')+':00').map(time=>{
   if(Date.parse(`${date}T${time}:00+04:00`)<=now())return {time,status:'past'};
   if(dayClosed)return {time,status:'blocked'};
   if(duration===null)return {time,status:'pending'};
   const requested=interval(time,duration);if(!requested)return {time,status:'blocked'};
   const match=rows.find(row=>{const occupied=interval(row.time,row.duration_minutes);return !occupied||overlaps(requested,occupied);});
   return {time,status:match?(match.kind==='booking'?'booked':'blocked'):'available'};
  });
  return {date,serverTime:now(),dayClosed,durationMinutes:duration,slots};
 }
 async function setDay(date,closed){
  if(!validDate(date)||typeof closed!=='boolean')throw fail(400,'Invalid day');
  return db.transaction(async()=>{if(closed)await db.prepare('INSERT INTO ilker_closed_days(date) VALUES(?) ON CONFLICT DO NOTHING').run(date);else await db.prepare('DELETE FROM ilker_closed_days WHERE date=?').run(date);return {date,closed};});
 }
 async function setSlot(date,time,blocked){
  if(!validDate(date)||typeof blocked!=='boolean'||!interval(time,60)||Date.parse(`${date}T${time}:00+04:00`)<=now()||!time.endsWith(':00'))throw fail(400,'Invalid slot');
  return db.transaction(async()=>{
   const rows=await db.prepare("SELECT * FROM ilker_appointments WHERE date=? AND status='active'").all(date);
   const own=rows.find(row=>row.kind==='block'&&row.time===time);
   if(!blocked){const visit=rows.find(row=>row.kind==='booking'&&overlaps(interval(time,60),interval(row.time,row.duration_minutes)));if(visit)throw fail(409,'Cancel the overlapping booking first');if(own)await db.prepare("UPDATE ilker_appointments SET status='cancelled' WHERE id=?").run(own.id);return {ok:true};}
   if(own)return {ok:true};
   if(!isAvailable(time,60,rows.map(row=>({time:row.time,durationMinutes:row.duration_minutes}))))throw fail(409,'Existing booking overlaps this hour');
   await db.prepare("INSERT INTO ilker_appointments(id,date,time,kind,duration_minutes,created_at) VALUES(?,?,?,'block',60,?)").run(randomUUID(),date,time,new Date(now()).toISOString());return {ok:true};
  });
 }
 async function day(date){if(!validDate(date))throw fail(400,'Invalid date');return {date,closed:Boolean(await db.prepare('SELECT 1 FROM ilker_closed_days WHERE date=?').get(date)),slots:await db.prepare("SELECT * FROM ilker_appointments WHERE date=? AND status='active' ORDER BY time").all(date)};}
 async function cancel(id){return db.transaction(async()=>{const result=await db.prepare("UPDATE ilker_appointments SET status='cancelled' WHERE id=? AND kind='booking' AND status='active'").run(id);if(!result.changes)throw fail(404,'Booking not found');return {ok:true};});}
 async function remove(id){return db.transaction(async()=>{const result=await db.prepare("DELETE FROM ilker_appointments WHERE id=? AND kind='booking' AND status='cancelled'").run(id);if(!result.changes)throw fail(409,'Cancel the booking first');return {ok:true};});}
 async function book(input){
  const {date,time,serviceId,room,requestKey}=input;const name=typeof input.name==='string'?input.name.trim():'';const phone=typeof input.phone==='string'?input.phone.trim():'';
  if(!validDate(date)||!interval(time,1)||!time.endsWith(':00')||!name||name.length<2||name.length>80||/[\u0000-\u001f]/.test(name)||!/^\+?[0-9() .-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15||!/^[\da-f-]{36}$/i.test(requestKey||''))throw fail(400,'Invalid booking details');
  const ids=selection(input.serviceIds,serviceId);
  return db.transaction(async()=>{
   const previous=await db.prepare('SELECT * FROM ilker_appointments WHERE request_key=?').get(requestKey);
   if(previous){const oldItems=await items(previous.id);const previousIds=oldItems.length?oldItems.map(item=>item.service_id):[previous.service_id];if(previous.status!=='active'||previous.date!==date||previous.time!==time||JSON.stringify(previousIds)!==JSON.stringify(ids)||previous.room!==room||previous.name!==name||previous.phone!==phone)throw fail(409,'Booking retry differs');return previous;}
   if(Date.parse(`${date}T${time}:00+04:00`)<=now())throw fail(400,'Booking must be in the future');
   const chosen=await selectedServices(ids,room);if(chosen.some(item=>!item.durationMinutes))throw fail(409,'Service duration must be configured');
   const duration=chosen.reduce((sum,item)=>sum+item.durationMinutes,0),priceMin=chosen.reduce((sum,item)=>sum+item.priceMin,0),priceMax=chosen.reduce((sum,item)=>sum+item.priceMax,0),fixed=chosen.every(item=>item.actualPrice!==null);
   const existing=await db.prepare("SELECT time,duration_minutes FROM ilker_appointments WHERE date=? AND status='active'").all(date);
   const closed=await db.prepare('SELECT 1 FROM ilker_closed_days WHERE date=?').get(date);
   if(closed||!isAvailable(time,duration,existing.map(row=>({time:row.time,durationMinutes:row.duration_minutes}))))throw fail(409,'Time unavailable');
   const id=randomUUID();
   await db.prepare("INSERT INTO ilker_appointments(id,date,time,kind,name,phone,service_id,room,service_name,price_min,price_max,actual_price,duration_minutes,sessions_count,request_key,created_at) VALUES(?,?,?,'booking',?,?,?,?,?,?,?,?,?,?,?,?)").run(id,date,time,name,phone,ids[0],room,chosen.map(item=>item.name).join(', '),priceMin*100,priceMax*100,fixed?priceMin*100:null,duration,chosen.length===1?chosen[0].sessions:1,requestKey,new Date(now()).toISOString());
   for(let i=0;i<chosen.length;i++){const item=chosen[i];await db.prepare('INSERT INTO ilker_booking_items(booking_id,position,service_id,service_name,price_min,price_max,duration_minutes,sessions_count) VALUES(?,?,?,?,?,?,?,?)').run(id,i,item.serviceId,item.name,item.priceMin*100,item.priceMax*100,item.durationMinutes,item.sessions);}
   await onBooked(id);return db.prepare('SELECT * FROM ilker_appointments WHERE id=?').get(id);
  });
 }
 async function setActualPrice(id,price){
  const priceMinor=toMinor(price);if(priceMinor===null)throw fail(400,'Invalid actual price');
  return db.transaction(async()=>{
   const row=await db.prepare("SELECT * FROM ilker_appointments WHERE id=? AND kind='booking'").get(id);
   if(!row)throw fail(404,'Booking not found');
   if(row.price_min===row.price_max||priceMinor<row.price_min||priceMinor>row.price_max)throw fail(400,'Price must be within quoted range');
   await db.prepare('UPDATE ilker_appointments SET actual_price=? WHERE id=?').run(priceMinor,id);return {...row,actual_price:priceMinor};
  });
 }
 async function complete(id){
  return db.transaction(async()=>{
   const row=await db.prepare("SELECT * FROM ilker_appointments WHERE id=? AND kind='booking' AND status='active'").get(id);
   if(!row)throw fail(404,'Active booking not found');
   const end=Date.parse(`${row.date}T${row.time}:00+04:00`)+row.duration_minutes*60000;
   if(end>now())throw fail(409,'Visit has not finished');
   await db.prepare("UPDATE ilker_appointments SET status='completed' WHERE id=?").run(id);return {...row,status:'completed'};
  });
 }
 async function revenue(){
  const rooms=await db.prepare("SELECT room,COALESCE(SUM(actual_price),0) AS total,COUNT(actual_price) AS priced_visits,COUNT(*) AS visits FROM ilker_appointments WHERE kind='booking' AND status='completed' GROUP BY room").all();
  const totalMinor=rooms.reduce((sum,row)=>sum+Number(row.total),0);
  return {totalMinor,total:formatAmount(totalMinor),visits:rooms.reduce((sum,row)=>sum+Number(row.priced_visits),0),unpriced:rooms.reduce((sum,row)=>sum+Number(row.visits)-Number(row.priced_visits),0),rooms};
 }
 return {settings,setDuration,availability,setDay,setSlot,day,cancel,remove,book,setActualPrice,complete,revenue,items,itemsFor};
}
module.exports={prepareIlkerStore};

'use strict';
const {randomUUID}=require('node:crypto');
async function migratePushChanges(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=5').get())return {alreadyApplied:true};
 await db.exec(`CREATE TABLE ilker_push_changes(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES ilker_appointments(id),kind TEXT NOT NULL CHECK(kind IN ('cancelled','moved','master_changed')),date TEXT NOT NULL,time TEXT NOT NULL,duration_minutes INTEGER NOT NULL,created_at BIGINT NOT NULL);
 CREATE TABLE ilker_push_change_deliveries(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES ilker_push_changes(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES ilker_push_subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,lease_token TEXT,lease_expires BIGINT NOT NULL DEFAULT 0,UNIQUE(event_id,subscription_id));
 CREATE INDEX ilker_push_changes_pending ON ilker_push_change_deliveries(sent_at,next_attempt,lease_expires);`);
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(5,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
async function migratePushOrder(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=6').get())return {alreadyApplied:true};
 await db.exec('ALTER TABLE ilker_push_changes ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0');
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(6,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
function createPushChanges(db,{now,send}){
 async function enqueue(bookingId,kind){
  const row=await db.prepare('SELECT b.date,b.time,b.duration_minutes,v.revision FROM ilker_appointments b JOIN ilker_visit_state v ON v.booking_id=b.id WHERE b.id=?').get(bookingId);if(!row)throw new Error('Missing booking');
  const event=randomUUID();await db.prepare('INSERT INTO ilker_push_changes(id,booking_id,kind,sequence,date,time,duration_minutes,created_at) VALUES(?,?,?,?,?,?,?,?)').run(event,bookingId,kind,row.revision,row.date,row.time,row.duration_minutes,now());
  const subs=await db.prepare('SELECT id FROM ilker_push_subscriptions').all();for(const sub of subs)await db.prepare('INSERT INTO ilker_push_change_deliveries(id,event_id,subscription_id) VALUES(?,?,?)').run(randomUUID(),event,sub.id);
 }
 async function claim(){return db.transaction(async()=>{
  const job=await db.prepare(`SELECT d.id,d.attempts,d.subscription_id,p.subscription,e.booking_id,e.kind,e.date,e.time,e.duration_minutes,u.language,u.push_private
   FROM ilker_push_change_deliveries d JOIN ilker_push_changes e ON e.id=d.event_id JOIN ilker_push_subscriptions p ON p.id=d.subscription_id
   JOIN ilker_push_owners o ON o.subscription_id=p.id JOIN ilker_users u ON u.id=o.user_id AND u.active=1
   WHERE d.sent_at IS NULL AND d.next_attempt<=? AND d.lease_expires<=?
   AND NOT EXISTS (SELECT 1 FROM ilker_push_change_deliveries prior JOIN ilker_push_changes prior_event ON prior_event.id=prior.event_id WHERE prior.subscription_id=d.subscription_id AND prior.sent_at IS NULL AND prior_event.booking_id=e.booking_id AND prior_event.sequence<e.sequence)
   ORDER BY e.created_at,e.sequence,d.id LIMIT 1`).get(now(),now());
  if(!job)return null;job.token=randomUUID();await db.prepare('UPDATE ilker_push_change_deliveries SET lease_token=?,lease_expires=? WHERE id=?').run(job.token,now()+300000,job.id);return job;
 });}
 async function finish(job,fn){return db.transaction(async()=>{const row=await db.prepare('SELECT lease_token FROM ilker_push_change_deliveries WHERE id=?').get(job.id);if(row?.lease_token!==job.token)return;await fn();await db.prepare('UPDATE ilker_push_change_deliveries SET lease_token=NULL,lease_expires=0 WHERE id=? AND lease_token=?').run(job.id,job.token);});}
 async function drain(){for(let i=0;i<20;i++){
  const job=await claim();if(!job)break;
  const texts={ru:{cancelled:'Запись отменена',moved:'Запись перенесена',master_changed:'Мастер изменён',detail:'Откройте панель для деталей.'},az:{cancelled:'Rezervasiya ləğv edildi',moved:'Rezervasiya dəyişdirildi',master_changed:'Usta dəyişdirildi',detail:'Ətraflı məlumat üçün paneli açın.'},en:{cancelled:'Booking cancelled',moved:'Booking rescheduled',master_changed:'Barber changed',detail:'Open the dashboard for details.'}}[job.language]||{cancelled:'Запись отменена',moved:'Запись перенесена',master_changed:'Мастер изменён',detail:'Откройте панель для деталей.'};
  const payload={title:texts[job.kind]+' · İlker Sevim',body:job.push_private?texts.detail:`${job.date}, ${job.time} · ${texts.detail}`,tag:'change-'+job.id,url:'/admin.html?booking='+job.booking_id};
  try{await send(JSON.parse(job.subscription),JSON.stringify(payload));await finish(job,()=>db.prepare('UPDATE ilker_push_change_deliveries SET sent_at=? WHERE id=?').run(now(),job.id));}
  catch(error){if([404,410].includes(error.statusCode))await finish(job,()=>db.prepare('DELETE FROM ilker_push_subscriptions WHERE id=?').run(job.subscription_id));else await finish(job,()=>db.prepare('UPDATE ilker_push_change_deliveries SET attempts=?,next_attempt=? WHERE id=?').run(job.attempts+1,now()+Math.min(3600000,10000*2**Math.min(job.attempts+1,8)),job.id));}
 }}
 return {enqueue,drain};
}
module.exports={migratePushChanges,migratePushOrder,createPushChanges};

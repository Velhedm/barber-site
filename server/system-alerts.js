'use strict';
const {randomUUID}=require('node:crypto');
async function migrateSystemAlerts(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=10').get())return {alreadyApplied:true};
 await db.exec(`CREATE TABLE ilker_system_alerts(id TEXT PRIMARY KEY,bucket BIGINT NOT NULL UNIQUE,created_at BIGINT NOT NULL);
 CREATE TABLE ilker_system_alert_deliveries(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES ilker_system_alerts(id),subscription_id TEXT NOT NULL REFERENCES ilker_push_subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,lease_token TEXT,lease_expires BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,UNIQUE(event_id,subscription_id));
 CREATE INDEX ilker_system_alerts_pending ON ilker_system_alert_deliveries(sent_at,next_attempt,lease_expires);`);
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(10,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
function createSystemAlerts(db,{now,send}){
 let pending=0,draining=false;
 // A transient database outage is noted in memory and retried when the worker can
 // access the database again. A process crash while disconnected can lose it.
 function flag(){pending++;}
 async function enqueue(){if(!pending)return;const generation=pending,bucket=Math.floor(now()/900000);await db.transaction(async()=>{
  const id=randomUUID(),result=await db.prepare('INSERT INTO ilker_system_alerts(id,bucket,created_at) VALUES(?,?,?) ON CONFLICT(bucket) DO NOTHING').run(id,bucket,now());
  if(result.changes){const subscriptions=await db.prepare('SELECT id FROM ilker_push_subscriptions').all();for(const sub of subscriptions)await db.prepare('INSERT INTO ilker_system_alert_deliveries(id,event_id,subscription_id) VALUES(?,?,?)').run(randomUUID(),id,sub.id);}
 });if(pending===generation)pending=0;}
 async function drain(){if(draining)return;draining=true;try{await enqueue();for(let i=0;i<20;i++){
  const job=await db.transaction(async()=>{const row=await db.prepare(`SELECT d.id,d.attempts,d.subscription_id,p.subscription,u.language FROM ilker_system_alert_deliveries d JOIN ilker_push_subscriptions p ON p.id=d.subscription_id JOIN ilker_push_owners o ON o.subscription_id=p.id JOIN ilker_users u ON u.id=o.user_id AND u.active=1 WHERE d.sent_at IS NULL AND d.next_attempt<=? AND d.lease_expires<=? ORDER BY d.id LIMIT 1`).get(now(),now());if(!row)return null;row.lease=randomUUID();await db.prepare('UPDATE ilker_system_alert_deliveries SET lease_token=?,lease_expires=? WHERE id=?').run(row.lease,now()+300000,row.id);return row;});if(!job)break;
  const body={ru:'Проверьте работу панели. Если ошибка повторяется, обратитесь к техническому специалисту.',az:'Panelin işini yoxlayın. Xəta təkrarlanarsa, texniki mütəxəssisə müraciət edin.',en:'Check the dashboard. Contact technical support if the problem continues.'}[job.language];
  const title={ru:'Ошибка системы',az:'Sistem xətası',en:'System error'}[job.language];
  try{await send(JSON.parse(job.subscription),JSON.stringify({title:title+' · İlker Sevim',body,tag:'system-'+job.id,url:'/admin.html'}));await db.transaction(async()=>{await db.prepare('UPDATE ilker_system_alert_deliveries SET sent_at=?,lease_token=NULL,lease_expires=0 WHERE id=? AND lease_token=?').run(now(),job.id,job.lease);});}
  catch(error){await db.transaction(async()=>{const current=await db.prepare('SELECT lease_token FROM ilker_system_alert_deliveries WHERE id=?').get(job.id);if(current?.lease_token!==job.lease)return;if([404,410].includes(error.statusCode))await db.prepare('DELETE FROM ilker_push_subscriptions WHERE id=?').run(job.subscription_id);else await db.prepare('UPDATE ilker_system_alert_deliveries SET attempts=attempts+1,next_attempt=?,lease_token=NULL,lease_expires=0 WHERE id=? AND lease_token=?').run(now()+Math.min(3600000,10000*2**Math.min(job.attempts+1,8)),job.id,job.lease);});}
 }}finally{draining=false;}}
 return {flag,drain};
}
module.exports={migrateSystemAlerts,createSystemAlerts};

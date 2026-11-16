'use strict';
const {randomUUID}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
async function migrateReminders(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=8').get())return {alreadyApplied:true};
 await db.exec(`CREATE TABLE ilker_reminder_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,offsets TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE ilker_reminder_consent(booking_id TEXT PRIMARY KEY REFERENCES ilker_appointments(id),email TEXT NOT NULL,language TEXT NOT NULL,consented_at BIGINT NOT NULL,revoked_at BIGINT);
 CREATE TABLE ilker_reminder_jobs(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES ilker_appointments(id),offset_minutes INTEGER NOT NULL,visit_start BIGINT NOT NULL,due BIGINT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,lease_token TEXT,lease_expires BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,error TEXT,UNIQUE(booking_id,offset_minutes,visit_start));
 CREATE INDEX ilker_reminder_jobs_due ON ilker_reminder_jobs(state,due,next_attempt,lease_expires);`);
 await db.prepare("INSERT INTO ilker_reminder_settings(id,enabled,offsets) VALUES(1,0,'[1440,120]')").run();
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(8,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
function createReminders(db,{now,provider,audit}){
 let draining=false;
 async function settings(){const row=await db.prepare('SELECT * FROM ilker_reminder_settings WHERE id=1').get();return {enabled:Boolean(row.enabled),offsets:JSON.parse(row.offsets),revision:row.revision,providerConfigured:Boolean(provider?.configured)};}
 async function saveSettings(input,actor){if(typeof input.enabled!=='boolean'||!Array.isArray(input.offsets)||input.offsets.length>5||(input.enabled&&!input.offsets.length)||new Set(input.offsets).size!==input.offsets.length||input.offsets.some(n=>!Number.isInteger(n)||n<5||n>10080))throw fail(400,'Invalid reminder settings');
  return db.transaction(async()=>{const old=await settings();if(input.revision!==old.revision)throw fail(409,'Changed elsewhere; reload');if(input.enabled&&!provider?.configured)throw fail(400,'Email provider not configured');
   await db.prepare('UPDATE ilker_reminder_settings SET enabled=?,offsets=?,revision=revision+1 WHERE id=1').run(Number(input.enabled),JSON.stringify(input.offsets));
   if(!input.enabled)await db.prepare("UPDATE ilker_reminder_jobs SET state='cancelled' WHERE state='pending'").run();
   else{const rows=await db.prepare("SELECT c.booking_id FROM ilker_reminder_consent c JOIN ilker_appointments b ON b.id=c.booking_id WHERE c.revoked_at IS NULL AND b.status='active'").all();for(const row of rows)await schedule(row.booking_id);}
   await audit(actor,'reminder_settings','salon','reminders',{enabled:input.enabled,offsets:input.offsets});return settings();});}
 async function consent(id,input){if(!input?.consent)return;const config=await settings();if(!config.enabled||!config.providerConfigured)throw fail(409,'Reminders unavailable');const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';if(input.consent!==true||!validEmail(email)||!['ru','az','en'].includes(input.language))throw fail(400,'Invalid reminder consent');
  await db.prepare('INSERT INTO ilker_reminder_consent(booking_id,email,language,consented_at) VALUES(?,?,?,?)').run(id,email,input.language,now());await schedule(id);}
 async function schedule(id){
  await db.prepare("UPDATE ilker_reminder_jobs SET state='cancelled' WHERE booking_id=? AND state='pending'").run(id);
  const config=await settings();if(!config.enabled||!provider?.configured)return;
  const row=await db.prepare('SELECT b.date,b.time,b.status,c.revoked_at FROM ilker_appointments b JOIN ilker_reminder_consent c ON c.booking_id=b.id WHERE b.id=?').get(id);if(!row||row.status!=='active'||row.revoked_at!==null)return;
  const start=Date.parse(row.date+'T'+row.time+':00+04:00');for(const offset of config.offsets){const due=start-offset*60000;if(due<=now())continue;
   await db.prepare("INSERT INTO ilker_reminder_jobs(id,booking_id,offset_minutes,visit_start,due,state) VALUES(?,?,?,?,?,'pending') ON CONFLICT(booking_id,offset_minutes,visit_start) DO UPDATE SET state=CASE WHEN ilker_reminder_jobs.state='cancelled' THEN 'pending' ELSE ilker_reminder_jobs.state END").run(randomUUID(),id,offset,start,due);
  }
 }
 async function revoke(id){await db.prepare('UPDATE ilker_reminder_consent SET email=?,revoked_at=? WHERE booking_id=?').run('',now(),id);await db.prepare("UPDATE ilker_reminder_jobs SET state='cancelled' WHERE booking_id=? AND state='pending'").run(id);}
 async function list(){return db.prepare("SELECT j.booking_id,j.offset_minutes,j.visit_start,j.state,j.attempts,j.sent_at,j.error FROM ilker_reminder_jobs j ORDER BY j.due DESC LIMIT 100").all();}
 async function drain(){if(draining||!provider?.configured)return;draining=true;try{for(let i=0;i<20;i++){
  const job=await db.transaction(async()=>{const config=await settings();if(!config.enabled)return null;const row=await db.prepare("SELECT j.*,c.email,c.language,b.date,b.time,b.status,c.revoked_at FROM ilker_reminder_jobs j JOIN ilker_reminder_consent c ON c.booking_id=j.booking_id JOIN ilker_appointments b ON b.id=j.booking_id WHERE j.state='pending' AND j.due<=? AND j.next_attempt<=? AND j.lease_expires<=? ORDER BY j.due LIMIT 1").get(now(),now(),now());if(!row)return null;
   if(row.status!=='active'||row.revoked_at!==null||row.visit_start!==Date.parse(row.date+'T'+row.time+':00+04:00')||row.visit_start<=now()){await db.prepare("UPDATE ilker_reminder_jobs SET state='cancelled' WHERE id=?").run(row.id);return {skip:true};}
   row.lease=randomUUID();await db.prepare('UPDATE ilker_reminder_jobs SET lease_token=?,lease_expires=? WHERE id=?').run(row.lease,now()+60000,row.id);return row;});if(!job)break;if(job.skip)continue;
  const content={ru:['Напоминание о записи','Напоминаем о Вашей записи:'],az:['Rezervasiya xatırlatması','Rezervasiyanızı xatırladırıq:'],en:['Booking reminder','A reminder of your booking:']}[job.language];
  try{
   const eligible=await db.transaction(async()=>{const row=await db.prepare("SELECT j.lease_token,j.state,j.visit_start,c.revoked_at,b.date,b.time,b.status,s.enabled FROM ilker_reminder_jobs j JOIN ilker_reminder_consent c ON c.booking_id=j.booking_id JOIN ilker_appointments b ON b.id=j.booking_id JOIN ilker_reminder_settings s ON s.id=1 WHERE j.id=?").get(job.id);return Boolean(row&&row.lease_token===job.lease&&row.state==='pending'&&row.enabled&&row.revoked_at===null&&row.status==='active'&&row.visit_start===Date.parse(row.date+'T'+row.time+':00+04:00')&&row.visit_start>now());});
   if(!eligible)continue;
   await provider.send({to:job.email,subject:content[0]+' · İlker Sevim',text:`${content[1]} ${job.date}, ${job.time} (Baku).`,id:'ilker-reminder-'+job.id});await db.transaction(async()=>{await db.prepare("UPDATE ilker_reminder_jobs SET state='sent',sent_at=?,lease_token=NULL,lease_expires=0 WHERE id=? AND lease_token=?").run(now(),job.id,job.lease);});}
  catch(error){await db.transaction(async()=>{await db.prepare("UPDATE ilker_reminder_jobs SET attempts=attempts+1,next_attempt=?,error=?,lease_token=NULL,lease_expires=0,state=CASE WHEN ?=1 OR attempts+1>=5 THEN 'failed' ELSE state END WHERE id=? AND lease_token=? AND state='pending'").run(now()+Math.min(3600000,30000*2**Math.min(job.attempts,7)),error.permanent?'rejected':'unavailable',Number(Boolean(error.permanent)),job.id,job.lease);});}
 }}finally{draining=false;}}
 return {settings,saveSettings,consent,schedule,revoke,list,drain};
}
module.exports={migrateReminders,createReminders};

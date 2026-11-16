'use strict';
async function migrateBusinessSettings(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=9').get())return {alreadyApplied:true};
 await db.exec(`CREATE TABLE ilker_business_settings(id INTEGER PRIMARY KEY CHECK(id=1),name TEXT NOT NULL,phone TEXT NOT NULL,online INTEGER NOT NULL CHECK(online IN (0,1)),cancel_minutes INTEGER NOT NULL CHECK(cancel_minutes BETWEEN 0 AND 10080),revision INTEGER NOT NULL DEFAULT 1)`);
 await db.prepare('INSERT INTO ilker_business_settings(id,name,phone,online,cancel_minutes) VALUES(1,?,?,1,0)').run('İlker Sevim Barber Club','+994 10 321 51 51');
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(9,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
function createBusinessSettings(db,{audit}){
 async function get(){const row=await db.prepare('SELECT name,phone,online,cancel_minutes,revision FROM ilker_business_settings WHERE id=1').get();return {...row,online:Boolean(row.online)};}
 async function save(input,actor){const name=typeof input.name==='string'?input.name.trim():'',phone=typeof input.phone==='string'?input.phone.trim():'';
  if(name.length<2||name.length>80||/[\u0000-\u001f]/.test(name)||!/^\+?[0-9() .-]{7,30}$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15||typeof input.online!=='boolean'||!Number.isInteger(input.cancel_minutes)||input.cancel_minutes<0||input.cancel_minutes>10080)throw Object.assign(new Error('Invalid business settings'),{status:400});
  return db.transaction(async()=>{const current=await get();if(current.revision!==input.revision)throw Object.assign(new Error('Changed elsewhere; reload'),{status:409});await db.prepare('UPDATE ilker_business_settings SET name=?,phone=?,online=?,cancel_minutes=?,revision=revision+1 WHERE id=1').run(name,phone,Number(input.online),input.cancel_minutes);await audit(actor,'business_settings','salon','settings',{nameChanged:name!==current.name,phoneChanged:phone!==current.phone,online:input.online,cancelMinutes:input.cancel_minutes});return get();});
 }
 return {get,save};
}
async function migrateBookingPolicy(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=11').get())return {alreadyApplied:true};
 await db.exec('CREATE TABLE ilker_booking_policy(booking_id TEXT PRIMARY KEY REFERENCES ilker_appointments(id),cancel_minutes INTEGER NOT NULL CHECK(cancel_minutes BETWEEN 0 AND 10080))');
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(11,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
module.exports={migrateBusinessSettings,createBusinessSettings,migrateBookingPolicy};

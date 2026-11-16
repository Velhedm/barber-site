'use strict';
async function migratePush(db){
 return db.transaction(async()=>{
  if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=4').get())return {alreadyApplied:true};
  await db.exec(`CREATE TABLE ilker_push_leases(delivery_id TEXT PRIMARY KEY REFERENCES ilker_push_deliveries(id) ON DELETE CASCADE,token TEXT NOT NULL,expires BIGINT NOT NULL)`);
  await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(4,?)').run(new Date().toISOString());return {alreadyApplied:false};
 });
}
module.exports={migratePush};

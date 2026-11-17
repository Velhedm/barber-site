'use strict';
async function migrateIntakeTransition(db){return db.transaction(async()=>{
 if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=12').get())return {alreadyApplied:true};
 await db.exec('CREATE TABLE ilker_intake_transition(id INTEGER PRIMARY KEY CHECK(id=1),legacy INTEGER NOT NULL CHECK(legacy IN (0,1)))');
 // The current public site has one shared schedule; preserve it until a real
 // master is configured. Once switched, turning all masters off never reopens it.
 const online=await db.prepare('SELECT 1 FROM ilker_masters WHERE online=1 AND archived=0 LIMIT 1').get();
 await db.prepare('INSERT INTO ilker_intake_transition(id,legacy) VALUES(1,?)').run(online?0:1);
 await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(12,?)').run(new Date().toISOString());return {alreadyApplied:false};
});}
module.exports={migrateIntakeTransition};

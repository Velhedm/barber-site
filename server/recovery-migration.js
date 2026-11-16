'use strict';
async function migrateRecovery(db){
 return db.transaction(async()=>{
  if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=7').get())return {alreadyApplied:true};
  await db.exec(`
   CREATE TABLE ilker_recovery_addresses(user_id TEXT PRIMARY KEY REFERENCES ilker_users(id),email TEXT NOT NULL UNIQUE,verified_at BIGINT NOT NULL);
   CREATE TABLE ilker_recovery_requests(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES ilker_users(id),kind TEXT NOT NULL CHECK(kind IN ('verify','reset')),
    email TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,key_tag TEXT NOT NULL,credential_tag TEXT NOT NULL,
    language TEXT NOT NULL CHECK(language IN ('ru','az','en')),created_at BIGINT NOT NULL,expires BIGINT NOT NULL,used_at BIGINT,
    attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,last_error TEXT,
    lease_token TEXT,lease_expires BIGINT
   );
   CREATE INDEX ilker_recovery_pending ON ilker_recovery_requests(sent_at,next_attempt,expires);
  `);
  await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(7,?)').run(new Date().toISOString());
  return {alreadyApplied:false};
 });
}
module.exports={migrateRecovery};

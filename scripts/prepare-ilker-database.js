'use strict';
// Explicit one-time preparation only. Never run automatically during a deploy.
// The URL must use a privileged, direct PostgreSQL connection; do not print it.
const {createApp}=require('../server/app');
async function main(){
 if(!process.argv.includes('--apply')||!process.env.ILKER_MIGRATION_DATABASE_URL){
  console.error('Preparation requires --apply and ILKER_MIGRATION_DATABASE_URL. No changes made.');
  process.exitCode=1;return;
 }
 const runtime=await createApp({databaseUrl:process.env.ILKER_MIGRATION_DATABASE_URL,bootstrapLegacy:false,production:false});
 await runtime.close();
 console.log('İlker tables and default service settings prepared. Existing salon tables were not modified.');
}
main().catch(()=>{console.error('Database preparation failed. Check the database and permissions without sharing credentials.');process.exitCode=1;});

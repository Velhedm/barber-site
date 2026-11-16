'use strict';
const {createDatabase} = require('../server/database');
const {migrateManagement} = require('../server/management-migration');
const {migrateReception}=require('../server/reception-migration');
const {migrateAccess}=require('../server/access-migration');
const {migratePush}=require('../server/push-migration');
const {migratePushChanges,migratePushOrder}=require('../server/push-changes');
const {migrateRecovery}=require('../server/recovery-migration');

async function main() {
  const url = process.env.ILKER_MIGRATION_DATABASE_URL;
  if (!process.argv.includes('--apply') || !url || !process.env.ILKER_MIGRATION_EXPECTED_HOST || new URL(url).hostname !== process.env.ILKER_MIGRATION_EXPECTED_HOST) {
    throw new Error('Explicit --apply, direct migration URL and matching expected host required');
  }
  if (new URL(url).hostname.includes('-pooler')) throw new Error('Use a direct connection for migration');
  const db = await createDatabase({databaseUrl: url, bootstrapLegacy: false, proxyUrl: process.env.HTTPS_PROXY});
  try {
    const before = await db.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get();
    await migrateManagement(db);
    await migrateReception(db);
    await migrateAccess(db);
    await migratePush(db);
    await migratePushChanges(db);
    await migratePushOrder(db);
    const result = await migrateRecovery(db);
    const after = await db.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get();
    if (before.n !== after.n) throw new Error('Record preservation check failed');
    console.log(JSON.stringify({migration: 7, ...result, existingAppointmentCountUnchanged: true}));
  } finally {await db.close();}
}
main().catch(() => {console.error('Migration failed; no secrets or customer details logged. Inspect a test environment before retrying.'); process.exitCode = 1;});

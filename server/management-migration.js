'use strict';
const {catalog} = require('./ilker-services');

// Explicit migration only; the application must never run DDL on production startup.
async function migrateManagement(db) {
  return db.transaction(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ilker_management_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ilker_rooms(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 99),
        archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS ilker_masters(
        id TEXT PRIMARY KEY, name TEXT, position INTEGER NOT NULL, online INTEGER NOT NULL DEFAULT 0 CHECK(online IN (0,1)),
        archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), step_minutes INTEGER NOT NULL DEFAULT 60 CHECK(step_minutes IN (10,15,20,30,60)),
        schedule_json TEXT, room_id TEXT REFERENCES ilker_rooms(id), revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS ilker_catalog(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, translations_json TEXT NOT NULL, group_id TEXT NOT NULL,
        group_json TEXT NOT NULL, position INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), sessions_count INTEGER NOT NULL DEFAULT 1,
        revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS ilker_catalog_options(
        service_id TEXT NOT NULL REFERENCES ilker_catalog(id), category TEXT NOT NULL CHECK(category IN ('zal','vip')),
        price_min INTEGER NOT NULL CHECK(price_min>=0), price_max INTEGER NOT NULL CHECK(price_max>=price_min),
        duration_minutes INTEGER CHECK(duration_minutes BETWEEN 1 AND 720), PRIMARY KEY(service_id,category));
      CREATE TABLE IF NOT EXISTS ilker_master_services(
        master_id TEXT NOT NULL REFERENCES ilker_masters(id), service_id TEXT NOT NULL REFERENCES ilker_catalog(id),
        PRIMARY KEY(master_id,service_id));
      CREATE TABLE IF NOT EXISTS ilker_master_days(
        master_id TEXT NOT NULL REFERENCES ilker_masters(id), date TEXT NOT NULL, day_json TEXT NOT NULL,
        PRIMARY KEY(master_id,date));
      CREATE TABLE IF NOT EXISTS ilker_time_blocks(
        id TEXT PRIMARY KEY, master_id TEXT NOT NULL REFERENCES ilker_masters(id), date TEXT NOT NULL,
        start_minute INTEGER NOT NULL CHECK(start_minute>=0), end_minute INTEGER NOT NULL CHECK(end_minute<=1440 AND end_minute>start_minute));
      CREATE INDEX IF NOT EXISTS ilker_blocks_by_day ON ilker_time_blocks(master_id,date);
      CREATE TABLE IF NOT EXISTS ilker_booking_assignment(
        booking_id TEXT PRIMARY KEY REFERENCES ilker_appointments(id), master_id TEXT NOT NULL REFERENCES ilker_masters(id),
        master_name TEXT NOT NULL, room_id TEXT REFERENCES ilker_rooms(id), room_name TEXT, archived INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS ilker_assignment_by_master ON ilker_booking_assignment(master_id);
      CREATE TABLE IF NOT EXISTS ilker_booking_archive(booking_id TEXT PRIMARY KEY REFERENCES ilker_appointments(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ilker_audit(
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    if (await db.prepare('SELECT version FROM ilker_management_versions WHERE version=1').get()) return {alreadyApplied: true};
    // Existing settings, prices, service IDs, snapshot rows and visits remain intact.
    let position = 0;
    for (const group of catalog.categories) for (const service of group.services) {
      await db.prepare('INSERT INTO ilker_catalog(id,name,translations_json,group_id,group_json,position,sessions_count) VALUES(?,?,?,?,?,?,?)').run(
        service.id, service.name, JSON.stringify(service.translations || {}), group.id,
        JSON.stringify({name: group.name, translations: group.translations || {}}), position++, service.sessions || 1);
      for (const category of ['zal', 'vip']) {
        const settings = await db.prepare('SELECT duration_minutes FROM ilker_service_settings WHERE id=?').get(service.id + ':' + category);
        const price = service[category];
        await db.prepare('INSERT INTO ilker_catalog_options(service_id,category,price_min,price_max,duration_minutes) VALUES(?,?,?,?,?)').run(
          service.id, category, Math.round((typeof price === 'number' ? price : price.min) * 100),
          Math.round((typeof price === 'number' ? price : price.max) * 100), settings?.duration_minutes ?? null);
      }
    }
    for (let i = 1; i <= 7; i++) await db.prepare('INSERT INTO ilker_masters(id,name,position) VALUES(?,NULL,?)').run('master-' + i, i);
    // The old single-salon uniqueness constraint would reject independent masters.
    // All writes keep using the SAME PostgreSQL advisory transaction lock as before.
    await db.exec('DROP INDEX IF EXISTS ilker_unique_active_slot; CREATE INDEX IF NOT EXISTS ilker_appointments_by_day ON ilker_appointments(date,status);');
    await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(1,?)').run(new Date().toISOString());
    return {alreadyApplied: false};
  });
}
module.exports = {migrateManagement};

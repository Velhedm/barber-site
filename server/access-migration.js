'use strict';
async function migrateAccess(db) {
  return db.transaction(async () => {
    if (await db.prepare('SELECT version FROM ilker_management_versions WHERE version=3').get()) return {alreadyApplied:true};
    await db.exec(`
      CREATE TABLE ilker_users (
        id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner','reception')), password_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), revision INTEGER NOT NULL DEFAULT 1,
        language TEXT NOT NULL DEFAULT 'ru' CHECK(language IN ('ru','az','en')),
        push_private INTEGER NOT NULL DEFAULT 1 CHECK(push_private IN (0,1)), created_at BIGINT NOT NULL
      );
      CREATE TABLE ilker_account_sessions (
        token_hash TEXT PRIMARY KEY REFERENCES ilker_sessions(token_hash) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES ilker_users(id), created_at BIGINT NOT NULL,
        last_seen BIGINT NOT NULL, device TEXT NOT NULL
      );
      CREATE INDEX ilker_sessions_by_user ON ilker_account_sessions(user_id);
      CREATE TABLE ilker_login_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at BIGINT NOT NULL);
      CREATE TABLE ilker_push_owners (
        subscription_id TEXT PRIMARY KEY REFERENCES ilker_push_subscriptions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES ilker_users(id), session_hash TEXT
      );
    `);
    await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(3,?)').run(new Date().toISOString());
    return {alreadyApplied:false};
  });
}
module.exports={migrateAccess};

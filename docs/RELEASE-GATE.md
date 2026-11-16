# Release is blocked — staged management upgrade

Do not merge this branch into `ilker-workspace-migration` or `backend-booking` yet.
Render auto-deploys the former; pushing there would publish unfinished functionality.

## After all stages and acceptance checks

1. Confirm the production service/workspace and exact database endpoint. Never use KSpace.
2. Produce a consistent encrypted PostgreSQL backup of all `ilker_*` tables, schema,
   grants and dependencies using a **direct** migration/backup connection. Keep encryption
   key and backup separately. PostgreSQL client tools must support server version 18.
   No backup files or credentials in Git. `scripts/backup.js` does not cover Neon.
3. Restore the backup to an isolated test database and verify booking/item counts,
   financial totals, session policies and synthetic access. Record the restore evidence.
4. Rehearse migration against a fresh Neon branch. It adds tables, seeds 7 offline unnamed
   placeholders and imports existing catalog/settings. It removes the obsolete global
   unique-start index, replacing single-capacity scheduling with transactional checks.
5. Run full unit/API/browser/two-instance PostgreSQL tests, then real iPhone PWA/Push checks.
6. Assign historical unassigned bookings through the stage-2 reschedule action before
   enabling new masters. Unassigned active intervals intentionally block all masters.
7. Explicit migrations 1 and 2 (masters, then reception/CRM/finance): `ILKER_MIGRATION_DATABASE_URL`, `ILKER_MIGRATION_EXPECTED_HOST`,
   `node scripts/migrate-management.js --apply`. Then review/apply
   `migrations/management-grants.sql` with the database owner, never at app startup.
8. Only when all release gates pass, deploy tested commit and enable `MANAGEMENT_ENABLED=true`.
   Runtime continues using the existing restricted Neon role and original VAPID keys.
9. Smoke test public booking, admin login, availability, privacy, Push, cancellation and
   financial totals. Avoid fake public customer notifications; use an agreed test window.

## Rollback warning

Additive migration never deletes appointments. Do not simply drop new tables or restore
an old snapshot over subsequent real bookings. After per-master bookings exist, the old
single-capacity UI/server is not a compatible complete rollback. Disable new online intake
and prefer a forward fix, preserving all visits. Reinstating the old uniqueness index can
fail when different masters have legitimate simultaneous starts.

## Local tests

`npm ci` then `npm test` and `npm run check` with Node 24.
New store tests use temporary in-memory SQLite with synthetic records.
PostgreSQL test requires `ILKER_TEST_DATABASE_URL` and matching
`ILKER_TEST_EXPECTED_HOST`. ONLY point these at a disposable Neon test branch:
it migrates that branch's copied Ilker tables and adds CRM links/opening balances, creates an isolated synthetic schema and
removes that synthetic schema after the test. It must never run against production.
No test should use production push credentials or real customer destinations.

# Release is blocked — staged management upgrade

Do not merge this branch into `ilker-workspace-migration` or `backend-booking` yet.
Render auto-deploys the former; pushing there would publish unfinished functionality.

## After all stages and acceptance checks

1. Confirm the production service/workspace and exact database endpoint. Never use KSpace.
2. Produce a consistent encrypted PostgreSQL backup of all `ilker_*` tables, schema,
   grants and dependencies using a **direct** migration/backup connection. Keep encryption
   key and backup separately. PostgreSQL client tools must support server version 18.
   No backup files or credentials in Git. `scripts/backup.js` does not cover Neon.
3. Restore the production backup to an isolated test database and verify booking/item
   counts, financial totals, grants, session policies and synthetic access. A preliminary
   test-branch-only restore was completed; it does not replace this production rehearsal.
4. Rehearse migration against a fresh Neon branch. It adds tables, seeds 7 offline unnamed
   placeholders and imports existing catalog/settings. It removes the obsolete global
   unique-start index, replacing single-capacity scheduling with transactional checks.
5. Run full unit/API/browser/two-instance PostgreSQL tests, then real iPhone PWA/Push checks.
6. Assign historical unassigned bookings through the stage-2 reschedule action before
   enabling new masters. Unassigned active intervals intentionally block all masters.
7. Explicit migrations 1–12 (masters, reception/CRM/finance, accounts, Push leases, change events, ordering, email recovery, reminders, business settings, system alerts, booking-policy snapshots and transition state): `ILKER_MIGRATION_DATABASE_URL`, `ILKER_MIGRATION_EXPECTED_HOST`,
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
The legacy PostgreSQL test additionally requires TEST_DATABASE_URL and matching
TEST_DATABASE_EXPECTED_HOST, and rejects the known production endpoint.

## Preliminary test-branch restore, 2026-11-16

An encrypted AES-256 custom-format pg_dump of `public.ilker_*` from the isolated Neon
test branch was restored into a network-isolated disposable PostgreSQL 18 container.
Counts of appointments, booking items, clients and finance entries, the financial total,
and fingerprints of appointments and booking items matched. The local restored database
and its anonymous volume were removed after comparison; the encrypted test dump remains
in the private workspace. Its key is stored in a separate directory on the same machine,
which is not independent backup storage. The dump used `--no-owner --no-acl`; roles,
grants, policies, external dependencies and production recovery were not verified.
Before release, verify role/grant restoration and rehearse a separately protected
production backup without overwriting later live bookings.

## Production-derived local restore rehearsal, 2026-11-16

At approximately 18:49–18:50 UTC, a read-only PostgreSQL 18 dump of the eight
`public.ilker_*` production tables was encrypted with AES-256. A separate encrypted
schema-only dump includes ACLs. Both remain in a private local directory; the random
passphrase is in another private directory **on the same machine**, which is not
independent storage. Temporary connection credentials and diagnostic output were
removed after the operation. No production records or settings were modified.

The schema and data were restored into an isolated, network-disabled PostgreSQL 18
container. Because the split schema/data restore initially encountered foreign-key
load ordering, a fresh disposable database was restored using `--disable-triggers`
for data loading; explicit application foreign-key orphan checks returned zero.
After applying a deterministic C collation for comparisons, counts and whole-row
fingerprints matched the then-current production state in all eight tables.
SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges for the
`ilker_service` role matched and a restricted SELECT succeeded. The rehearsal
container and its temporary volume were removed afterwards; encrypted copies remain.
Production metadata inspection separately found no role memberships and no RLS
policies on the eight existing Ilker tables; application authorization is essential.

This is a point-in-time local backup, not an independently stored backup or a tested
full application recovery. Global role definitions, passwords, memberships, schema
policies, external services, and new records after the dump are not covered by the
matching check. Before release, create a fresh encrypted backup, independently store
the backup and key, review roles/policies and rehearse full application access; never
overwrite later real visits with the old snapshot.

## Additional recovery rehearsal, 2026-11-17

An encrypted production-derived archive made at approximately 04:42 UTC was uploaded
to the owner's Google Drive without public sharing. It was downloaded back and matched
the local archive byte-for-byte. The separately provided key was not uploaded to Drive.
The dump was restored twice in a network-isolated PostgreSQL 18 container: a full
archive restore and a schema/ACL plus data restore. Table counts and fingerprints
matched between those two restored databases, all four application foreign-key orphan
checks returned zero, and a restricted-role SELECT succeeded. The container and its
anonymous data volume were removed after verification. This is not a comparison with a
live snapshot at dump time, a full application recovery, or a backup of later bookings.
Create a current backup immediately before any production migration.

On 2026-11-17 a fresh Neon branch copied from production was used for the full
management PostgreSQL test. Migrations preserved appointment and item counts and
fingerprints, historical finance opening balances matched, and overlapping requests
from separate application instances produced one successful booking. The branch is
isolated and no production migration was performed. The PostgreSQL transition test
also passed on that branch, including the shared-intake and master-activation race.


## Access migration (stage 3A)

Run explicit migrations 1, 2 and 3 plus restricted grants before enabling management.
Migration 3 adds account/session ownership and login throttling; it does not modify visits.
On first management startup only, import the existing configured owner password hash
and unexpired legacy sessions/device subscriptions. The initial login is `owner`.
Subsequent starts must keep the database credential authoritative, including after a
password change. Do not import the environment password again.

Rehearse the transition on a copied branch and retain the prior credential privately
until the owner has verified access. Do not print it in reports or logs.
Password recovery is implemented behind explicit email-provider configuration. Verify the real sender and owner email before enabling it; production delivery is not yet tested.

CRITICAL ROLLBACK: after a database password change, reverting to the legacy binary
would accept the old environment password. Do not roll back to legacy authentication.
A rollback must retain the access module and its tables, or pause access while restoring
a vetted version. Never reset passwords or erase sessions silently to make rollback work.

User role changes and deactivation revoke sessions and Push subscriptions. A request
already authorized before revocation is revalidated inside its write transaction.
Reception can read individual visit prices and client spending for its daily work, but
cannot access aggregate finance routes, corrections, staff credentials, catalog edits,
customer anonymization or audit exports. Final owner acceptance of this permission
matrix is still required before provisioning real receptionist accounts.

## Push delivery leases

Migration 4 adds a temporary, expiring delivery lease shared by server instances.
Claims are serialized with the existing transaction lock. A worker crash releases its
claim after five minutes. Delivery remains at-least-once: a crash after the provider
accepts a Push but before the database records success can cause a duplicate. No claim
of exactly-once delivery is made. Existing subscriptions and queued deliveries remain.
Results from a worker whose lease has been replaced cannot change delivery state or
delete a subscription; verify on the test database before a release.

## PWA manifests

The admin manifest retains its existing identity and start URL; its application
scope is limited to `/admin.html`. The client has a separate manifest and identity.
The service worker scope and Push subscriptions are unchanged. Verify the upgrade on
an actual installed iPhone PWA: manifest-scope changes, opening the client externally,
return to the admin and Push after the upgrade are not established by Chromium tests.
New icon assets use the supplied, approved temporary logo reconstruction.

## Client cancellation link

For new online bookings, the existing cryptographically random booking request UUID
also acts as the cancellation capability, paired with the booking ID. It is placed in
the URL fragment, never in a query string, and is only sent to the cancellation endpoint
in a JSON POST after the user presses the confirmation button. Opening the link cannot
change a booking. Treat the link like a password; anyone possessing it can cancel.
The customer must save the link, as no delivery provider is configured. It follows
rescheduling and permits cancellation until the owner-defined cutoff before the latest start. Repeated POSTs
are safe. No personal data is returned. Bookings made before this UI do not acquire a
link automatically. The link must be saved; external delivery remains unconfigured.

## Booking-change Push

Migrations 5–6 add a transactional outbox for cancellation, rescheduling and master
changes. Each subscription receives a separately leased task; sensitive contacts are
excluded, and the recipient's language and privacy choice apply at delivery time. A
later event for the same booking/device waits for an earlier event to be delivered.
Provider responses can be lost, so exactly-once delivery cannot be guaranteed. System
error alerts are staged separately; real-device acceptance remains outstanding. The free server may sleep.

## Reminders and icons (staged)

Migration 8 adds opt-in email reminders, outbox leases, retries and owner settings.
No production email provider has been configured; real delivery and recipient consent
require validation. See reports/REMINDERS-RU.md. PNG icon files were generated from
the agreed temporary reconstruction; verify the updated installed PWA on a real iPhone.

## Business settings (staged)

Migration 9 initializes name and telephone from the current public page, preserves
existing records, and defaults to online booking enabled / cancellation before start.
Owners may change these values without restart; server checks apply transactionally
to new public bookings and cancellation. Existing idempotent retries remain valid.
Placeholder masters remain offline until configured; do not enable management without
confirmed real schedules and a migration/assignment plan for historic bookings.

## System-error Push (staged)

Migration 10 adds per-device leased delivery of generic, localized system-error
notifications. Events are deduplicated per 15-minute bucket. An outage while the
database is unavailable is held in process memory and retried after connectivity
returns; a process crash before persistence can lose it. Delivery remains at-least-once.
No exception text, customer data or secrets are included in the notification.

## Isolated iPhone preview

`scripts/preview-server.js` runs only against synthetic in-memory SQLite, ignores
`DATABASE_URL`, disables email, requires a separate HTTPS origin and separate
credentials and displays a prominent test notice. See `PREVIEW-IPHONE-RU.md`.
The process has not been deployed; a temporary HTTPS host is needed for physical
iPhone acceptance. Do not reuse live VAPID keys or enter real customer details.

## Backup utility

`scripts/backup-neon.sh` is a packaging helper requiring a PostgreSQL 18-compatible
`pg_dump`, a direct connection configured privately via PGSERVICEFILE, and a separate
passphrase file. It intentionally excludes ownership and ACLs, so it is NOT a complete
production backup by itself. The helper passed no-overwrite and simulated failure checks and an encrypted
backup/restore rehearsal against an isolated PostgreSQL 18 container with synthetic
data. The earlier Neon test-branch dump/restore was performed independently. Production roles, grants, external
resources, independent key/backup storage and a production-derived restore rehearsal
remain mandatory.

## Cancellation policy snapshot

Migration 11 preserves the cancellation cutoff in effect when a new booking is made.
Legacy bookings without a snapshot retain cancellation until the start of the visit.
A changed policy is rechecked before booking; existing snapshots are never overwritten.

## Shared-to-master intake transition

Migration 12 preserves the existing shared 09:00–21:00 booking flow until an owner
enables the first configured master. The admin interface still uses the new management
features. The first enabled master must offer at least one active service whose configured
duration fits a working day; this prevents switching to an entirely unusable calendar.
After the first master goes online, the public site requires master selection. Disabling
all masters does not silently reopen shared intake. Legacy bookings remain unassigned
and conservatively block every master until assigned. Intake mode, activation, booking
checks and writes use the same PostgreSQL advisory transaction lock. A stale public
page receives a clear conflict and must refresh; idempotent booking retries still work.
Transition uses current managed prices, durations, snapshots and client linkage.
This behavior is staged and requires the full release tests before production.

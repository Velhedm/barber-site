# Stage 3A validation — 2026-11-16

No production deployment or data changes. Development branch: `ilker-management-stage1`.

## Automated evidence

- Node test suite: 45 tests total; 42 passed, 0 failed, 3 optional PostgreSQL tests skipped in the default run.
- Management PostgreSQL suite separately passed on the existing test Neon branch: migration fingerprints preserve copied appointments/items, concurrent bookings/transfers, restarts and ledger idempotency.
- Access PostgreSQL suite separately passed in a disposable schema: three application instances share users/sessions, stale revisions produce one winning update, credential changes revoke other instances' sessions, and login throttling is shared.
- The legacy-only PostgreSQL test was not separately executed at this stage.
- Account tests: CSRF/auth/role routes, actor attribution, no credential hash in account responses, password rotation and preserved new password on restart, revocation after initial auth but before transaction, login/credential proof throttling, legacy migration, Push ownership and privacy/language.
- Browser account test passed: owner creates receptionist, restrictions match UI and server, password change forces login, next login works, saved Push language restored, no horizontal overflow at 360/390/1440 and no uncaught JavaScript errors.
- Reception browser regression passed: manual multiservice, transfer, response loss after commit and safe retry, calendar, financial correction, cancellation, CRM, anonymization, logout response privacy, mobile widths.
- Management browser regression passed: public RU/AZ/EN field preservation, master/catalog/room configuration, booking availability and mobile widths.
- Syntax checks and git diff whitespace checks passed.

## Restricted database role (raw database adapter)

`ilker_users` SELECT/INSERT/UPDATE allowed; DELETE denied.
Audit and financial entry UPDATE/DELETE/TRUNCATE denied.
Legacy-brand `slots` SELECT denied.
No credentials or copied client records printed in test output.

## Limits

Browser checks use Chromium, not real iOS Safari/PWA. Web Push sends were mocked; no real customer/owner notification was sent. Live iPhone device acceptance is still required. Email recovery/reminders, complete admin localization, general business settings, cancellation links, additional event notifications, icon/PWA updates, backup restore rehearsal and final production security checks remain release blockers. This report is not a claim of complete implementation or absolute security.

## Push concurrency follow-up

Migration 4 was applied on the existing isolated Neon test branch and verified to
preserve copied appointment and service records. Two separate application instances
on a synthetic PostgreSQL schema competed for the same delivery; one send occurred.
Two local application instances also passed the competition and expired-lease recovery
checks. Push sends were mocked. Default suite: 48 tests, 45 passed, 3 PostgreSQL tests
skipped; the management PostgreSQL suite passed separately. Exactly-once delivery is
not guaranteed if the server fails between provider acceptance and recording success.

## Client cancellation follow-up

The local suite passed 46 tests, with three opt-in PostgreSQL tests skipped in the
default run. The management PostgreSQL suite passed separately on the isolated test
branch, including concurrent duplicate cancellation and availability after cancellation.
Chromium tested the link on a mobile viewport: opening it does not cancel, switching
language works, confirmation cancels and no horizontal overflow occurred at 390px.
Local tests also cover invalid capability, cross-origin rejection, cancellation after
reschedule, refusal at/after visit start and repeated cancellation. No physical iPhone
or outbound cancellation notification was tested. Cancellation Push remains pending.

## Booking-change Push follow-up

Migrations 5–6 passed on an isolated Neon branch; copied appointments and items
retained the same fingerprints. Synthetic PostgreSQL tests passed across multiple app
instances and exercised the change outbox and a mocked Push provider. Local tests
verified transaction rollback when queuing fails, idempotent retries, expiry/retry,
sequential event order for a booking/device, per-user language and private payloads,
and concurrent workers. Default suite: 51 tests, 48 passed, 3 opt-in database tests
skipped; the management PostgreSQL suite passed separately. Real iPhone delivery and
system-error notifications are not verified. Delivery is at-least-once, not guaranteed
exactly-once; a persistently failing earlier event delays later events for that device.

## Admin language and Push preference follow-up

Locally, account settings warnings and password mismatch errors were tested in RU/EN
while the dialog remained open; input was preserved. The browser test exercised rapid
AZ/RU switches and verified the current account's Push language. An isolated PostgreSQL
test verified concurrent updates to language and privacy preserved both values. This
does not validate translation completeness or real-device Push delivery.

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

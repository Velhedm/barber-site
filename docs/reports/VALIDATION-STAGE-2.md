# Stage 2 validation — 2026-11-16

Development branch only; production unchanged.

- Node suite: 37 tests, 35 passed, 0 failed, 2 opt-in PostgreSQL tests skipped.
- Management PostgreSQL suite separately: 1 passed on isolated Neon branch, including migration fingerprints, concurrent booking/transfers, restart and financial idempotency.
- Legacy PostgreSQL-specific test was not separately run at this stage.
- Browser reception workflow passed in Chromium: multi-service manual booking, transfer, lost response after commit and safe retry, day/week/month calendar, completed visit, financial correction, cancellation, CRM editing/history/anonymization.
- Delayed private response after logout did not repopulate the dashboard.
- 360, 390 and 1440 px: no horizontal overflow in tested views; no uncaught JavaScript errors.
- Existing management browser workflow passed.
- npm run check and git diff --check passed.
- Restricted Neon role: ledger INSERT allowed, UPDATE denied; operation UPDATE denied; access to legacy brand tables denied (checked using raw database adapter).
- No real messages sent; no production writes or deployment.

Real iPhone PWA and Push, final role matrix, external reminders, full admin translations and backup restore rehearsal remain release gates. Browser width checks are not a substitute for physical iPhone testing.

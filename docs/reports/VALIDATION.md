# Stage 1 validation evidence — 2026-11-16

- `node --test test/*.test.js`: **28 tests; 26 passed, 2 skipped, 0 failed**.
  The two skips are opt-in PostgreSQL integration tests, not silent pass results.
- `test/management-postgres.test.js` separately enabled on isolated Neon branch:
  **1 passed / 0 failed**, final run ~76 seconds (includes migration/setup/three app instances).
  Original legacy PostgreSQL integration was not separately rerun; its SQLite/API equivalents passed.
- `npm run check`: passed for existing entrypoints and all new runtime modules.
- `git diff --check`: passed.
- `npm audit --omit=dev`: 0 known vulnerabilities (info/low/moderate/high/critical all 0).
- Credential pattern check over code/docs found no embedded live database URLs or Neon passwords.
- Runtime-role startup on migrated Neon test branch passed: 7 masters, 21 services.
- Test grants: master read/write true; audit append true; audit rewrite false;
  legacy table access false. No changes to production grants.
- Browser: Chromium mobile viewport 390px plus 360px and 1440px, no overflow;
  completed booking, second client sees occupied slot, different master remains free;
  RU/AZ/EN preserve inputs and selection; admin service/room saves; no JS page errors.
- Turkish PDF rendered and checked as 2 pages. It explicitly describes stage 1 only.

## Reproduce

Node 24, `npm ci`, `npm test`, `npm run check`.
PostgreSQL: see `docs/RELEASE-GATE.md`; do NOT set test URL to production.
Browser: install playwright-core separately as a developer tool, provide
`PLAYWRIGHT_MODULE` (module name or absolute package path) and `CHROMIUM_PATH`, then
`node scripts/test-management-ui.cjs`. It starts an isolated in-memory synthetic app,
performs actual browser actions and writes screenshots to ignored `artifacts/management`.
No browser tests create real customer bookings or deliver actual messages.

## Not verified / no guarantee claimed

Physical iPhone, Safari engine, installed PWA, real push delivery, external reminder
providers, full production backup restore, sustained production load, all future roles,
CRM/finance and password reset. No production deployment performed.

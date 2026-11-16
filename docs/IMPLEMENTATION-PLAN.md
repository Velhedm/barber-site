# Ilker Sevim management upgrade — implementation ledger

Production remains on `ilker-workspace-migration`. Development is isolated in
`ilker-management-stage1`. No production migration or automatic release is permitted.

## Baseline, 2026-11-16

Node 24 / Express, Neon PostgreSQL via TLS WebSockets, Render free web service.
Existing transactional advisory lock serializes booking writes across instances.
Current scheduling is a single shared capacity, 09:00–21:00, hourly starts.
Multi-service snapshots and idempotent booking keys already exist.
Authentication is one environment password hashed with scrypt; sessions are hashed,
HttpOnly/SameSite cookies plus CSRF; there are no per-employee accounts yet.
Push outbox is durable, but worker coordination/deduplication across processes needs
improvement. Service Worker excludes API responses from caches. Static shell is cached.
Current `scripts/backup.js` only backs up SQLite, NOT the production Neon database.
Deleting cancelled bookings currently deletes historical data. Must become archival.

## Ordered delivery gates (nothing omitted; incomplete gates block release)

1. **Masters / services / scheduling** — implemented and verified as stage 1 (requirements 1–4, 17–18; full release gates still pending)
   Safe additive migration, 7 unnamed inactive placeholders, configurable service
   catalog preserving ZAL/VIP, assignments, schedules, breaks, exceptions, rooms,
   per-master concurrency, legacy protection, server-side validation, admin UI,
   public picker, snapshots, regression/concurrency tests.
2. **Reception / CRM / finance** — implemented as stage 2, pending final release gates (6–9)
   Dashboard; day/week/month; manual entry, reschedule, attendance, no-show,
   customer normalization/history/anonymization, financial ledger and audit.
3. **Access / communication / PWA** (5, 10–16) — account access implemented as stage 3A; communication/recovery/localization/PWA still pending
   Owner/reception accounts, permission matrix, credential migration and revocation,
   password reset via configured email; consent-aware durable reminders; localized
   event outbox; full admin RU/AZ/EN; private lock-screen notifications; PWA scope,
   separate manifests, tested icons, reduced-motion transitions.
4. **Release verification and handover** (17–20)
   Restore rehearsal, dependency/security checks, two-instance race testing,
   mobile browser tests plus real iPhone PWA/Push acceptance, production backup,
   migration/release/rollback plan, Russian operating manuals and factual Turkish PDF.

## Missing owner information (not replaced with invented values)

Master names and actual qualifications, working hours/breaks, physical rooms and
capacity; confirmed service durations; owner email; reminder provider and sender
credentials/consent wording. No prepaid booking is to be added.

## Release policy

Existing unassigned visits must stay visible and conservatively reserve capacity
until explicitly assigned; do not infer a real employee for historical data.
New placeholder staff are offline until configured by owner. No fabricated rooms.
ZAL/VIP are price categories, separate from physical room resources.
No secrets, customer names or phone numbers in repository, logs, reports or fixtures.
Test branches retain copied data: use metadata/aggregate checks only and synthetic
fixtures in separate schema; don't send notifications from test environments.
Free hosting cannot guarantee on-time reminder execution while suspended; external
SMS/WhatsApp/email credentials and costs are separate from Web Push.

## Evidence and scope

See `reports/STAGE-1-RU.md`, `reports/VALIDATION.md` and `RELEASE-GATE.md`.
Rescheduling, reception, CRM and the financial ledger are implemented in stage 2.
See `reports/STAGE-2-RU.md` and `reports/STAGE-3A-RU.md`. Account roles, password changes, session revocation, client cancellation links and booking-change Push events are implemented. Recovery email provider activation, reminders,
full admin localization, PWA updates and release verification remain pending in stages 3–4.
The admin login, navigation, core manual booking dialog, and selected calendar, CRM,
status, finance, master, service and account-control labels support RU/AZ/EN in development. Dialogs
keep form values, slots and retry state when switching language; catalog service labels
use their stored translations. Other dynamic sections, some server errors, confirmation
prompts and dialog strings remain untranslated.
The language control must not be published as a complete admin translation until those
are covered.
The interface-language switch synchronizes the active account's Push language using a
separate authenticated update; it preserves the account's saved privacy preference.
Real-device verification of localized Push remains a release requirement.
No claim of completed commercial delivery is made for this branch.

## Recovery / localization update

Explicit admin text bindings now cover the main sections, schedule, account controls,
Push guidance and common errors. Browser checks verify EN main views, AZ schedule
labels and preserved drafts. Historical record payloads remain original.
Migration 7 adds verified recovery email and one-use password reset capabilities,
with an idempotent leased mail queue. Provider configuration is intentionally absent.
See `reports/RECOVERY-AND-LOCALIZATION.md`; client reminders are still outstanding.

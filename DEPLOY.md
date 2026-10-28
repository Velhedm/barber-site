# Запуск серверной версии

Node.js 24 / Express, Neon PostgreSQL или SQLite. Бесплатная схема: один Render Web Service Free + Neon Free, без постоянного диска Render.

Ветка `backend-booking`, build `npm ci && npm run check`, start `npm start`. Текущий Static Site на `main` остается презентацией.

Переменные в Render Environment: `DATABASE_URL`, `ADMIN_PASSWORD` (12+ символов), `NODE_ENV=production`, `TRUST_PROXY=1`, постоянные VAPID-ключи и `VAPID_SUBJECT`. Адрес автоматически берется из `RENDER_EXTERNAL_URL`.

Полная инструкция и ограничения: [README.md](README.md#бесплатный-запуск-render--neon).

# Chunk 3 operations and deployment

## Database migration

The schema now includes fee items, invoices, invoice lines, payments, discounts, report cards, timetable slots, announcements, plans, subscriptions, platform settings, and per school report card fee policy. The migration folder contains the full initial schema for a fresh PostgreSQL database.

For a fresh database, run from `server/`:

```sh
npm ci
npx prisma migrate deploy
npx prisma generate
```

Set `SEED_DEMO_PASSWORD` and run `npm run seed` outside production to create two demo schools, admins, classes, students, a score, fee items, and invoices. The demo password is required from the environment and is never hard-coded.

For an existing chunk 1/2 database that was created with `prisma db push`, take a verified backup first. It has no migration history to extend. Compare it to the current schema and create/baseline migration history before using `migrate deploy`; do not run the initial schema migration against tables that already exist. New installs and release deployments use `npx prisma migrate deploy`.

## New API routes

School admin routes are mounted below `/api/school` and require an authenticated `ADMIN` session, CSRF for mutations, and the school scope from the session:

- `GET/POST /fees/items`, `PATCH/DELETE /fees/items/:id`
- `POST /fees/invoices/generate`, `GET /fees/invoices`, `GET /fees/invoices/:id`
- `GET /fees/debtors` (use `format=csv` to export), `GET /fees/summary`
- `GET/POST /fees/discounts`
- `POST /payments/record`, `GET /payments/list`, `POST /payments/:id/reverse`, `GET /payments/:id/receipt`
- `POST /payments/paystack/initialize`, public signed `POST /payments/paystack/webhook`
- `GET /report-cards`, `POST /report-cards/generate`, `PATCH /report-cards/:id/comment`, `PATCH /report-cards/bulk-comment`, `POST /report-cards/publish`, `POST /report-cards/:id/unlock`, `GET /report-cards/:id/pdf`, `POST /report-cards/bulk-pdf`, `GET /report-cards/bulk-pdf/:id`, `GET /report-cards/bulk-pdf/:id/download`
- `GET/POST /timetable`, `PATCH/DELETE /timetable/:id`
- `GET/POST /announcements`, `PATCH/DELETE /announcements/:id`
- `GET /search`

Superadmin routes are mounted below `/api/superadmin` and require `SUPERADMIN`:

- `GET/POST /plans`, `GET/PATCH/DELETE /plans/:id`
- `GET/POST /subscriptions`, `PATCH/DELETE /subscriptions/:id`
- `GET /dashboard`
- `GET/PATCH /system-settings`
- `GET /audit-logs` with `schoolId`, `userId`, `action`, `entity`, `from`, `to`, `page`, and `limit`; set `format=csv` for CSV output
- `GET /api/docs/openapi.json` provides the OpenAPI document

All amounts sent to or received from fee/payment endpoints are whole kobo integers. School IDs in admin queries are always taken from the authenticated session.

## Environment

Copy `.env.production.example` and set unique values for the database password and all token/CSRF secrets. Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` to enable online payment initiation and webhook verification. `BACKUP_DIR` and `BACKUP_RETENTION_DAYS` configure database backups; `REPORT_EXPORT_DIR` must be persistent storage for completed background report PDF jobs. `SUBSCRIPTION_GRACE_DAYS` is the fallback grace period before persisted system settings are configured.

## Local Docker

Set the required values in the environment, then run:

```sh
docker compose up --build -d
```

The client container serves the Vite build and proxies `/api` to Express. Postgres data lives in the named `postgres_data` volume. For local application code changes, use `npm run dev` in `server/` and `npm run dev` in `client/`.

## Cheap VPS deployment

1. Provision a VPS, install Docker/Compose, and point the domain's A record at its public IP.
2. Copy the repository and `.env.production.example` to `.env`; replace every example secret and set `CORS_ORIGIN` to the HTTPS domain.
3. Start the stack with `docker compose up --build -d`. The server runs `prisma migrate deploy` before Express starts.
4. Install Nginx on the host, configure `deploy/nginx-https.conf` with the domain, and obtain/renew a certificate with Certbot. Set `HTTP_PORT=127.0.0.1:8080` in the environment and update the HTTPS config upstream to `127.0.0.1:8080`.
5. Set the Paystack webhook URL to `https://school.example.com/api/school/payments/paystack/webhook`. The Compose backup service writes a daily dump and prunes expired files. Verify backups by restoring a recent `.dump` to a separate database.

On Render or Railway, provision managed PostgreSQL, configure the environment variables, run `npx prisma migrate deploy` as the release/pre-deploy command, then start `node src/index.js`. Add the domain in the platform dashboard, point DNS to the provided target, and enable the platform's managed TLS certificate. Keep database and Paystack secrets in platform environment settings only.

## Tests and checks

```sh
cd server && npm ci && npx prisma generate && npm test && npm run lint && npm audit
cd ../client && npm ci && npm run build && npm audit
```

Integration tests require a PostgreSQL database matching `DATABASE_URL`. Tests cover authentication and tenant isolation, webhook signature rejection, grade boundaries, and timetable clash intervals.

## Pre-live checklist

- Set unique production secrets; confirm cookies use `COOKIE_SECURE=true` and `CORS_ORIGIN` is the exact HTTPS origin.
- Apply and verify the database migration; confirm the two school tenants cannot read each other's records.
- Verify role guards, CSRF protection, request IDs, rate limiting, and account lockout on authentication routes.
- Run a complete manual and Paystack payment in test mode; retry the webhook, check the receipt, and test a reversal audit record.
- Generate, comment, publish, unlock, and download report cards; confirm the unpaid fee rule and balances.
- Attempt teacher/class/room timetable conflicts and confirm they are rejected.
- Verify announcement sanitization, schedule windows, CSV exports, and platform plan limits.
- Configure daily backups and retention; perform a restore test.
- Confirm HTTPS renewal, health check `/api/health`, logs, and graceful shutdown.
- Run backend tests, frontend build, and `npm audit` for both packages.

# Meggs universe

Responsive multi-brand storefront with a Node.js API, Sequelize 6, PostgreSQL, a password-protected admin studio, and Paystack checkout. Requires Node.js 22.9+ (Node 24 recommended) and PostgreSQL 14+.

## Local setup

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and your own `ADMIN_PASSWORD`. The database must already exist and the database user must own its schema. Keep `.env` private; it is excluded from Git.
3. Run `npm run db:migrate`.
4. **Before the first server start**, import your existing data with `npm run db:import -- data/store.json`. This imports products, orders and their payment references, page content, portfolio, enquiries, and subscribers. It preserves the original JSON file and refuses to overwrite a populated database.
5. Start with `npm start` and visit http://localhost:3000. Admin is at `/admin`; sign in with `ADMIN_PASSWORD`.

If starting a new site without existing data, skip the import. A fresh server adds default page text but no sample products. For a disposable demo database, run `npm run db:seed` before starting the server. Seeding also requires an empty database.

```env
DATABASE_URL=postgres://meggs:your-password@127.0.0.1:5432/meggs
ADMIN_PASSWORD=use-a-long-random-password
PORT=3000
SITE_URL=http://localhost:3000
DB_SSL=false
```

The server loads `.env`; existing environment variables take precedence. There is no JSON storage fallback. The original `data/store.json` is now only an import source, so edits to that file after import do not change the live database.

## Deploy on your server with Docker

Docker Compose includes PostgreSQL 16, a persistent database volume, a migration job, and the Node app. Only the app's loopback port is exposed; PostgreSQL remains on the private container network.

1. Install Docker and Compose, then copy the project to your server.
2. Create `.env` from `.env.example`. Set a strong `ADMIN_PASSWORD` of at least 16 characters, `POSTGRES_PASSWORD`, and `SITE_URL=https://your-domain.com`. Use a long hexadecimal PostgreSQL password so it works without URL escaping in the Compose connection URL. Leave the Paystack secret empty until you configure it.
3. Start the database:

```sh
docker compose up -d db
```

4. Import the existing JSON data **before starting the web service**:

```sh
docker compose run --rm --volume "$PWD/data:/import:ro" migrate npm run db:import -- /import/store.json
```

For a new empty store, skip step 4. Do not run `db:seed` on your real shop.

5. Build and launch:

```sh
docker compose up -d --build
docker compose logs -f web
```

The migration job must complete successfully before the app starts. Point an HTTPS reverse proxy at `127.0.0.1:3000`; an Nginx starting configuration is in `deploy/nginx.conf`. Replace its example domain and configure a certificate using your hosting provider or certificate tooling. HTTPS is required for production admin cookies.

Check the backend:

```sh
curl http://127.0.0.1:3000/api/health
```

Back up PostgreSQL regularly:

```sh
docker compose exec -T db pg_dump -U meggs meggs > meggs-backup.sql
```

The `postgres_data` volume survives image rebuilds. Do not delete it unless intentionally deleting the database. Product uploads are stored in PostgreSQL as image data URLs; the supplied site photos are bundled in `public/assets`.

## Deploy without Docker

Install Node 24 and PostgreSQL, create an application database/user, then follow local setup on your server. Set `NODE_ENV=production` and `SITE_URL` to your HTTPS origin. Production startup requires migrations to have been run explicitly and a strong admin password.

Use a process manager or `deploy/meggs.service` with systemd. Adjust its service user, working directory, and Node path for your server. Ensure that service user can read `.env` and project files. Bind the public domain to an HTTPS reverse proxy for the app. Do not expose PostgreSQL publicly.

For managed PostgreSQL requiring TLS, use `DB_SSL=true`. Certificate verification remains enabled; supply `DB_SSL_CA` if your provider uses a private CA. Connection pooling defaults to 10 connections per Node process and is configurable with `DB_POOL_MAX`.

Run `npm run db:migrate` for subsequent releases before restarting the application. Migrations are versioned in `schema_migrations`; no destructive schema synchronization runs at production startup.

## Backend and data

Sequelize models live in `backend/database.js`. PostgreSQL tables:

- `products`: indexed identifiers and typed name, brand, price and stock, plus JSONB for product details/images.
- `orders`: contact email, status, total, unique payment reference and checkout key, timestamp, plus a JSONB snapshot of line items and delivery/payment details.
- `site_content`, `projects`, `enquiries`, `subscribers`: the editable page content, portfolio, customer enquiries and mailing list.
- `admin_sessions`: hashed session tokens with a 24-hour expiry; sessions survive Node restarts. Changing `ADMIN_PASSWORD` does not revoke existing sessions until logout or expiry.
- `schema_migrations`: applied schema versions.

Customer contacts are derived from order records. Store mutations run in PostgreSQL transactions with an advisory lock shared by Node processes. This prevents concurrent checkouts from overselling and avoids duplicate stock changes during Paystack verification. HTTP success is returned only after commit. This compatibility layer loads the catalog/admin collections and serializes API operations, including payment initialization; it is designed for a small store. For high traffic, move to targeted row queries/locks, server-side pagination, and external image storage.

Routes: `/`, `/about`, `/megg-extension`, `/lydia-meggison-video-creator`, `/glowwithmeggs`, `/shop`, `/admin`, `/payment/return`.

The existing frontend API contracts are preserved. Products, page text, portfolio, orders, customers and enquiries remain manageable in admin, with search and pagination for the admin lists.

## Paystack

Set `PAYSTACK_SECRET_KEY` in `.env`; begin with your account's `sk_test_` key. Keep the secret out of frontend code and Git. Set `SITE_URL` to the public HTTPS origin in production. Configure this webhook in your Paystack dashboard:

```text
https://your-domain.com/api/paystack/webhook
```

Restart after environment changes. Test the cart checkout with Paystack's test mode, verify that the order becomes `Paid` in admin, then configure your live key and live webhook. Local callbacks work, but Paystack cannot deliver webhooks to localhost.

Prices are calculated on the server in NGN/kobo. Verification checks reference, amount, currency, payment status and email. The webhook verifies HMAC-SHA512 against the original request bytes and then verifies the transaction with Paystack. Repeated verification does not deduct stock again.

Without a key, checkout records order requests. Only product totals are collected online; delivery is confirmed and charged separately. Cancel unpaid Paystack orders in admin to release reserved stock. Cancelling a paid order does not issue a refund; process refunds in Paystack. Late payments after stock release require manual availability review. Legacy order requests require manual inventory adjustment when cancelled. No transactional emails or newsletters are sent automatically.

The original catalog contains sample products/prices. Replace them with your actual products before accepting live payments. Portfolio entries should link to your real work.

References: [Paystack payments](https://paystack.com/docs/payments/accept-payments/), [webhook authentication](https://paystack.com/docs/payments/webhooks/), and [Sequelize transactions](https://sequelize.org/docs/v6/other-topics/transactions/).

## Tests

Tests use real isolated PostgreSQL databases and a mocked Paystack API; they never charge real funds. The test database user requires `CREATE DATABASE` permission and should be separate from production.

```sh
TEST_DATABASE_URL=postgres://testuser:password@127.0.0.1:5432/postgres npm test
```

Coverage includes imports/migrations, API routes, authentication, sessions across server restarts, product/content updates, concurrent stock reservations, price validation, orders, enquiries, subscribers and payment/webhook idempotency. Temporary test databases are removed when tests finish.

## One-command setup for your VPS path

Your project path is `/var/www/html/meggs-site`. Configure application settings once in `/var/www/html/meggs-site/.env`: `DATABASE_URL`, `ADMIN_PASSWORD`, `SITE_URL` (your real public HTTPS domain), `PORT`, and optional Paystack settings. Nginx domain/port are generated from those settings. The Node service runs as the dedicated `meggs` user, not root.

On your Debian/Ubuntu VPS, install Node 24, PostgreSQL, Nginx and dependencies first. Create the database/user and, from the project root, run `npm ci`. If importing your existing JSON catalog, run `npm run db:import -- /var/www/html/meggs-site/data/store.json` before the first server start. Otherwise start empty and add products in admin.

Then run the single installer:

```sh
cd /var/www/html/meggs-site
bash deploy/install.sh
```

It applies migrations, installs `/etc/systemd/system/meggs.service`, generates `/etc/nginx/sites-available/meggs.conf`, enables the site, validates Nginx and restarts the app. Nginx and systemd require separate system files, but you configure the app in one `.env` and install both with one command. Existing Certbot HTTPS configuration is preserved on repeated installs. It does not remove other Nginx sites or import/overwrite your data.

After your DNS points to this VPS, enable HTTPS with your certificate provider. If using Certbot with its Nginx plugin:

```sh
certbot --nginx -d your-real-domain.com
systemctl restart meggs
systemctl status meggs
journalctl -u meggs -f
```

Replace the example domain with your actual domain. Production admin cookies require HTTPS. When changing `.env`, restart `meggs`; if changing the port or domain, update the generated Nginx configuration as well (existing HTTPS files are preserved intentionally). Only allow public inbound HTTP/HTTPS; keep the Node and PostgreSQL ports private using your server firewall.

# Aktyor.az Production Checklist

## Deployment Shape

- Frontend: build with `npm run build`, serve the `dist/` directory.
- Backend: run `npm run start:prod --prefix backend` as a long-running Node.js process.
- Database: keep `/var/lib/aktyoraz/data/aktyor.sqlite` on persistent disk.
- Uploads: keep `/var/lib/aktyoraz/uploads` on persistent disk.
- Domain: serve the public site from `https://aktyor.az`.
- API: route `https://aktyor.az/api` to the backend API, or use `https://api.aktyor.az/api` and update env values.

## Required Env Files

Create frontend production env from:

```bash
cp .env.production.example .env.production
```

Create backend production env from:

```bash
cp backend/.env.production.example backend/.env
```

Before deploy, replace:

- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `OPENAI_API_KEY`
- `PDF_FONT_REGULAR`
- `PDF_FONT_BOLD`
- `HOST` if your hosting provider requires a specific bind host

Never commit real `.env` files.

## Server Storage Layout

Recommended VPS layout:

```text
/var/www/aktyor.az              application code and frontend dist
/var/lib/aktyoraz/data          SQLite database directory
/var/lib/aktyoraz/uploads       actor studio photos
/var/backups/aktyoraz           local backup snapshots
/var/log/aktyoraz-backup.log    backup cron log
```

Production backend env:

```env
DATABASE_PATH=/var/lib/aktyoraz/data/aktyor.sqlite
UPLOAD_DIR=/var/lib/aktyoraz/uploads
UPLOAD_BASE_URL=https://aktyor.az
```

Create directories before first start:

```bash
sudo mkdir -p /var/www/aktyor.az /var/lib/aktyoraz/data /var/lib/aktyoraz/uploads /var/backups/aktyoraz
sudo chown -R $USER:$USER /var/www/aktyor.az /var/lib/aktyoraz /var/backups/aktyoraz
chmod 750 /var/lib/aktyoraz /var/lib/aktyoraz/data /var/lib/aktyoraz/uploads
```

Why this layout:

- deploys can replace `/var/www/aktyor.az` without deleting database or photos;
- backup script can target one stable data location;
- uploads remain outside the code folder and are served only through the backend/reverse proxy.

Shared hosting fallback:

```text
/home/YOUR_USER/aktyor.az              application code
/home/YOUR_USER/aktyoraz-storage/data  SQLite database
/home/YOUR_USER/aktyoraz-storage/uploads
/home/YOUR_USER/aktyoraz-backups
```

Then set:

```env
DATABASE_PATH=/home/YOUR_USER/aktyoraz-storage/data/aktyor.sqlite
UPLOAD_DIR=/home/YOUR_USER/aktyoraz-storage/uploads
```

## Build And Start

Frontend production API URL:

- Preferred: `VITE_API_URL=/api`
- Reverse proxy `/api`, `/uploads`, `/og`, `/sitemap.xml`, and `/robots.txt` to the backend.
- Keep `VITE_SITE_URL=https://aktyor.az` for SEO canonical and OpenGraph URLs.

```bash
npm ci
npm run build
npm ci --prefix backend --omit=dev
npm run start:prod --prefix backend
```

Use a process manager such as `pm2` or the hosting provider's Node.js app manager.

Health check:

```bash
curl https://aktyor.az/api/health
```

Expected response includes `"ok": true`.

## VPS Deploy Files

Deployment templates are included:

- `deploy/nginx/aktyor.az.conf`
- `deploy/systemd/aktyoraz-api.service`
- `docs/deploy-vps.md`

Use `docs/deploy-vps.md` for the full VPS deployment flow.

## SQLite Backup

Manual backup:

```bash
DATABASE_PATH=/var/lib/aktyoraz/data/aktyor.sqlite UPLOAD_DIR=/var/lib/aktyoraz/uploads BACKUP_DIR=/var/backups/aktyoraz ./scripts/backup-sqlite.sh
```

Daily cron example:

```cron
0 3 * * * cd /var/www/aktyor.az && DATABASE_PATH=/var/lib/aktyoraz/data/aktyor.sqlite UPLOAD_DIR=/var/lib/aktyoraz/uploads BACKUP_DIR=/var/backups/aktyoraz RETENTION_DAYS=14 ./scripts/backup-sqlite.sh >> /var/log/aktyoraz-backup.log 2>&1
```

The script backs up:

- SQLite database as `aktyor.sqlite.gz`
- SQLite WAL/SHM files when `sqlite3` is unavailable
- uploaded actor photos as `uploads.tar.gz`
- `manifest.txt` with source paths and retention settings
- `SHA256SUMS` when `shasum` or `sha256sum` is available

Verify a backup:

```bash
cd /var/backups/aktyoraz/YYYYMMDD-HHMMSS
shasum -a 256 -c SHA256SUMS
```

Keep a second off-server copy for real production.

## Admin Security

- Use a strong admin password.
- Use a 64+ character `JWT_SECRET`.
- Keep `CORS_ORIGIN` limited to `https://aktyor.az`.
- Admin login is rate-limited by IP. Defaults: `ADMIN_LOGIN_RATE_LIMIT_MAX=5` attempts per `ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS=900000`.
- Production startup fails intentionally if `JWT_SECRET` is missing, too short, or if the default admin password is still used.
- Keep OpenAI key only in backend env.
- Keep audit logs enabled.
- Review upload limits before launch.
- Put the site behind Cloudflare or another reverse proxy if possible.

## Pre-Launch Smoke Test

- `https://aktyor.az`
- `https://aktyor.az/actors`
- `https://aktyor.az/casting-ai`
- `https://aktyor.az/apply`
- `https://aktyor.az/admin`
- `https://aktyor.az/id/AAAB-000124`
- PDF card download
- QR scan page
- actor photo upload
- AI casting with and without OpenAI API available

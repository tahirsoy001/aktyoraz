# Aktyor.az VPS Deploy

This guide assumes Ubuntu 22.04/24.04, Nginx, systemd, Node.js 20+ and domain DNS pointing to the VPS.

## 1. Server Packages

```bash
sudo apt update
sudo apt install -y nginx sqlite3 git curl ca-certificates
```

Install Node.js 20+ using your preferred method. Confirm:

```bash
node -v
npm -v
```

## 2. Directories

```bash
sudo mkdir -p /var/www/aktyor.az /var/lib/aktyoraz/data /var/lib/aktyoraz/uploads /var/backups/aktyoraz
sudo chown -R www-data:www-data /var/www/aktyor.az /var/lib/aktyoraz /var/backups/aktyoraz
sudo chmod 750 /var/lib/aktyoraz /var/lib/aktyoraz/data /var/lib/aktyoraz/uploads
```

## 3. Upload App Code

Copy the project to:

```text
/var/www/aktyor.az
```

Then install and build:

```bash
cd /var/www/aktyor.az
sudo -u www-data npm ci
sudo -u www-data cp .env.production.example .env.production
sudo -u www-data npm run build
sudo -u www-data npm ci --prefix backend --omit=dev
sudo -u www-data cp backend/.env.production.example backend/.env
```

Edit `backend/.env`:

```bash
sudo -u www-data nano backend/.env
```

Required production values:

```env
NODE_ENV=production
PORT=4010
HOST=127.0.0.1
CORS_ORIGIN=https://aktyor.az
PUBLIC_BASE_URL=https://aktyor.az
SITEMAP_BASE_URL=https://aktyor.az
UPLOAD_BASE_URL=https://aktyor.az
DATABASE_PATH=/var/lib/aktyoraz/data/aktyor.sqlite
UPLOAD_DIR=/var/lib/aktyoraz/uploads
JWT_SECRET=replace-with-real-64-plus-character-secret
ADMIN_PASSWORD=replace-with-real-strong-password
OPENAI_API_KEY=replace-with-openai-api-key
```

## 4. Systemd API Service

```bash
sudo cp deploy/systemd/aktyoraz-api.service /etc/systemd/system/aktyoraz-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now aktyoraz-api
sudo systemctl status aktyoraz-api
```

Local health check:

```bash
curl http://127.0.0.1:4010/api/health
```

Logs:

```bash
journalctl -u aktyoraz-api -f
```

## 5. Nginx

```bash
sudo cp deploy/nginx/aktyor.az.conf /etc/nginx/sites-available/aktyor.az
sudo ln -s /etc/nginx/sites-available/aktyor.az /etc/nginx/sites-enabled/aktyor.az
sudo nginx -t
sudo systemctl reload nginx
```

Public health check:

```bash
curl http://aktyor.az/api/health
```

## 6. HTTPS

Install Certbot and issue certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d aktyor.az -d www.aktyor.az
```

Then confirm:

```bash
curl https://aktyor.az/api/health
```

## 7. Backup Cron

```bash
sudo crontab -e
```

Add:

```cron
0 3 * * * cd /var/www/aktyor.az && DATABASE_PATH=/var/lib/aktyoraz/data/aktyor.sqlite UPLOAD_DIR=/var/lib/aktyoraz/uploads BACKUP_DIR=/var/backups/aktyoraz RETENTION_DAYS=14 ./scripts/backup-sqlite.sh >> /var/log/aktyoraz-backup.log 2>&1
```

## 8. Smoke Test

Open:

- `https://aktyor.az`
- `https://aktyor.az/actors`
- `https://aktyor.az/admin`
- `https://aktyor.az/api/health`
- `https://aktyor.az/sitemap.xml`
- actor PDF card
- actor photo upload from admin

## Rollback

Before replacing app code, run:

```bash
cd /var/www/aktyor.az
DATABASE_PATH=/var/lib/aktyoraz/data/aktyor.sqlite UPLOAD_DIR=/var/lib/aktyoraz/uploads BACKUP_DIR=/var/backups/aktyoraz ./scripts/backup-sqlite.sh
```

Keep the previous app folder or deployment archive until smoke tests pass.

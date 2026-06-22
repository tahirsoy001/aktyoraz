# Aktyor.az

Aktyor.az actor and actress database with public profiles, searchable catalog, and digital verification card pages.

## Project Path

`/Users/zaurtahirsoy/CineApp/aktyor-az`

## Development

```bash
cd /Users/zaurtahirsoy/Aktyor.az
npm install
npm run dev
```

The local development server is configured for port `3010`.

## Current Project Path

`/Users/zaurtahirsoy/Aktyor.az`

## Frontend And Backend

Install frontend dependencies:

```bash
cd /Users/zaurtahirsoy/Aktyor.az
npm install
```

Install backend dependencies:

```bash
cd /Users/zaurtahirsoy/Aktyor.az/backend
npm install
```

Run the API server:

```bash
cd /Users/zaurtahirsoy/Aktyor.az
npm run dev:api
```

Run the frontend in another terminal:

```bash
cd /Users/zaurtahirsoy/Aktyor.az
npm run dev
```

Frontend: `http://localhost:3010`

Backend API: `http://localhost:4010`

SQLite database file: `/Users/zaurtahirsoy/Aktyor.az/backend/data/aktyor.sqlite`

## QR And PDF Cards

Real QR SVG:

`http://localhost:4010/api/actors/AAAB-000124/qr.svg`

PDF verification card:

`http://localhost:4010/api/actors/AAAB-000124/card.pdf`

Public verification page:

`http://localhost:3010/id/AAAB-000124`

PDF cards embed TTF fonts for Azerbaijani characters. Configure these in `backend/.env` when deploying:

- `PDF_FONT_REGULAR`
- `PDF_FONT_BOLD`

## SEO

Backend exposes:

- `http://localhost:4010/sitemap.xml`
- `http://localhost:4010/robots.txt`

Frontend sets route-specific title, description, canonical URL, Open Graph tags, and JSON-LD for public pages. Configure public URLs before deployment:

- Frontend `.env`: `VITE_SITE_URL`
- Backend `.env`: `PUBLIC_BASE_URL`

## Admin Login

Create `/Users/zaurtahirsoy/Aktyor.az/backend/.env` from `backend/.env.example` and set:

- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Do not commit real `.env` files, API keys, admin passwords, SQLite data, or uploaded actor photos.

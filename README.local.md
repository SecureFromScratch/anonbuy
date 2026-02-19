## Local Development Setup

### Goal

Fast local iteration with API on host and Postgres in Docker.

### Prerequisites

* Docker + Docker Compose
* Node.js 20+
* npm

### Initial Setup

```bash
git clone https://github.com/YOUR_USERNAME/nodeapi-app.git
cd nodeapi-app
cp .env.local .env
```

### Start PostgreSQL

```bash
docker compose up -d
```

### Install & Prepare

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

### Run API

```bash
npm run dev
# or
node src/server.js
```

API must bind to `0.0.0.0`.

### Verify

```bash
curl http://localhost:3000/health
```

### Stop

```bash
docker compose down
```

---

## Database Operations

### Connect

```bash
psql -h 127.0.0.1 -U postgres -d nodeapi
```

### Reset DB (Destructive)

```bash
docker compose down -v
docker compose up -d
npx prisma migrate deploy
npx prisma db seed
```

---

## Environment Files (Local)

| File         | Purpose                 |
| ------------ | ----------------------- |
| `.env.local` | Template (committed)    |
| `.env`       | Active config (ignored) |

Database host must be `localhost:5432`.

---

## Best Practices

* Never commit `.env`
* Always commit Prisma migrations
* Treat seeds as idempotent
* Reset DB often during labs

---

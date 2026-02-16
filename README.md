# Node API + Postgres (Secure Coding Lab)

Secure coding lab: catalog API with Prisma ORM and PostgreSQL. 

**Two deployment modes:**
- **Local Development:** Postgres in Docker, API on host (fast iteration)
- **GitHub Codespaces:** Everything containerized (zero local setup)

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [GitHub Codespaces](#github-codespaces)
- [API Endpoints](#api-endpoints)
- [Database Management](#database-management)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

**For Local Development:**
- Docker + Docker Compose
- Node.js **20+** and npm
- (Optional) `psql` CLI

**For GitHub Codespaces:**
- GitHub account (nothing else needed!)

---

## Local Development

### 1) Setup Environment
```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/nodeapi-app.git
cd nodeapi-app

# Create local environment file
cp .env.local .env
```

**`.env.local` contents:**
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nodeapi?schema=public
PORT=3000
UPLOAD_DIR=./uploads/items
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=nodeapi
PGPORT=5432
```

> ⚠️ **Security Note:** The password shown is **for training/demo purposes only**.
> In production:
> - Use **long, randomly generated passwords** (16-20+ characters)
> - Mix uppercase, lowercase, numbers, and symbols
> - Store in **secrets vault** (HashiCorp Vault, AWS Secrets Manager, etc.)
> - Rotate regularly and enforce **least-privilege access**

### 2) Start PostgreSQL (Docker)
```bash
docker compose up -d
docker compose ps     # wait until db is healthy
```

### 3) Install Dependencies & Prepare Database
```bash
npm ci
npx prisma generate
npx prisma migrate deploy   # or: npx prisma migrate dev
npx prisma db seed
```

### 4) Run the API (Host)
```bash
# If you have a dev script (nodemon):
npm run dev

# Otherwise:
node src/server.js
```

> **Note:** Ensure your server binds externally: `app.listen(PORT, '0.0.0.0')`

### 5) Quick Test
```bash
# Health check
curl -s http://localhost:3000/health

# List items
curl -s http://localhost:3000/api/v1/items | jq .

# Search (allowlisted keys: category, price, active)
curl -s "http://localhost:3000/api/v1/items/search?category=books&active=true" | jq .
```

### Stop Local Development
```bash
docker compose down
```

---

## GitHub Codespaces

### Quick Start

1. Go to your GitHub repository
2. Click **Code** → **Codespaces** → **Create codespace on main**
3. Wait 2-5 minutes for automatic setup
4. Once complete, run: `npm start`
5. Click the popup to open port 3000

### What Happens Automatically

The setup script (`.devcontainer/setup.sh`) runs:

- ✅ Configures environment (`.env.codespaces` → `.env`)
- ✅ Waits for PostgreSQL to be healthy
- ✅ Installs dependencies (`npm ci`)
- ✅ Generates Prisma client
- ✅ Applies database migrations
- ✅ Seeds database (if seed script exists)

### Manual Setup (if needed)
```bash
# The setup script should run automatically, but if needed:
bash .devcontainer/setup.sh

# Then start the app:
npm start
```

---

## API Endpoints

| Method | Path                   | Purpose            | Notes                                                                                         |
|-------:|------------------------|--------------------|---------------------------------------------------------------------------------------------|
|    GET | `/health`              | Liveness probe     | Returns `200 OK`                                                                            |
|    GET | `/api/v1/items`        | List items         | Returns `200 OK` with items array                                                           |
|   POST | `/api/v1/items`        | Create item        | `201 Created`; `Content-Type: application/json` with `{"name","category","price","active?"}` |
|    GET | `/api/v1/items/search` | Search by criteria | Query params: `category` (string), `price` (number), `active` (bool)                        |

### Tips

- All POSTs require `Content-Type: application/json`
- `search` rejects unknown params; at least one of `category|price|active` required
- Status codes: reads → `200`, creates → `201`, bad input → `400`

---

## Database Management

### PostgreSQL Commands

**Check connectivity:**
```bash
docker exec -it nodeapi-postgres pg_isready -U postgres -d nodeapi
```

**Access PostgreSQL prompt:**
```bash
psql -h 127.0.0.1 -U postgres -d nodeapi   # password: postgres
```

**Inside psql:**
```sql
-- List tables
\dt

-- Query data
SELECT * FROM "CouponRedemption";

-- Truncate table
TRUNCATE TABLE "CouponRedemption";

-- Exit
\q
```

### Reset Database to Fresh State

> ⚠️ **Warning:** Destroys all PostgreSQL data
```bash
# Stop and remove containers + volumes
docker compose down -v

# Verify volume is gone (optional)
docker volume ls | grep pgdata || echo "No pgdata volume found"

# Start fresh
docker compose up -d

# Re-apply schema and seed
npx prisma migrate deploy
npx prisma db seed
```

### Prisma Commands
```bash
# Generate Prisma client
npx prisma generate

# Apply migrations
npx prisma migrate deploy     # Production
npx prisma migrate dev        # Development (with prompts)

# Seed database
npx prisma db seed

# Open Prisma Studio (GUI)
npx prisma studio             # Access at http://localhost:5555

# Reset database (dev only)
npx prisma migrate reset      # Drops DB, re-runs migrations, seeds
```

---

## Environment Files

| File                 | Purpose                        | Committed? | Database Host   |
|---------------------|--------------------------------|------------|-----------------|
| `.env.local`        | Local development template     | ✅ Yes      | `localhost:5432`|
| `.env.codespaces`   | Codespaces template           | ✅ Yes      | `db:5432`       |
| `.env`              | Active configuration          | ❌ No       | Auto-generated  |
| `.env.example`      | Legacy template (optional)    | ✅ Yes      | `localhost:5432`|

**Key Difference:** Database host
- **Local:** `@localhost:5432` (app on host, DB in Docker)
- **Codespaces:** `@db:5432` (both in Docker network)

---

## Project Structure
```
.devcontainer/
  devcontainer.json        # Codespaces configuration
  setup.sh                 # Automated setup script
prisma/
  migrations/              # Database migrations (commit all)
  schema.prisma            # Database schema
  seed.js                  # Seed data
src/
  app.js                   # Express app
  server.js                # Server entry point
  routes/                  # API routes
  controllers/             # Request handlers
  services/                # Business logic
public/                    # Static HTML/CSS/JS
uploads/
  items/                   # File uploads (gitignored)
docker-compose.yml         # PostgreSQL container
Dockerfile                 # App container (for Codespaces)
.env.local                 # Local dev template
.env.codespaces            # Codespaces template
.env.example               # Generic template
package.json
README.md
```

---

## Troubleshooting

### Port 5432 Already in Use
```bash
# Option 1: Stop conflicting service
docker ps | grep 5432
docker stop <container-id>

# Option 2: Use different port
export PGPORT=55432
# Update DATABASE_URL to use localhost:55432
docker compose up -d
```

### Prisma Errors
```bash
# Regenerate Prisma client
npx prisma generate

# Check migrations exist
ls prisma/migrations/

# Apply migrations
npx prisma migrate deploy
```

### Database Connection Failed

**Local Development:**
```bash
# Check if database is running
docker compose ps

# Check database logs
docker compose logs db

# Verify .env uses localhost
cat .env | grep DATABASE_URL
# Should show: @localhost:5432
```

**Codespaces:**
```bash
# Verify .env uses db hostname
cat .env | grep DATABASE_URL
# Should show: @db:5432

# Check container logs
docker compose logs db
```

### Uploads Directory Issues
```bash
# Create uploads directory manually
mkdir -p uploads/items

# Check permissions
ls -la uploads/
```

### Clean Start (Nuclear Option)
```bash
# Remove everything
docker compose down -v
rm -rf node_modules package-lock.json
rm .env

# Start fresh
cp .env.local .env          # or .env.codespaces in Codespaces
npm install
docker compose up -d
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm start
```

---

## Best Practices

✅ **DO:**
- Commit all Prisma migration files
- Keep seed script idempotent (`upsert`, `skipDuplicates`)
- Use `.env.example` templates, not actual `.env`
- Test locally before pushing to Codespaces
- Use strong passwords in production

❌ **DON'T:**
- Commit `.env` files with secrets
- Commit `node_modules/` or `pgdata/`
- Use demo passwords in production
- Skip database migrations

---

## Quick Reference
```bash
# Local: Start everything
cp .env.local .env && docker compose up -d && npm ci && npx prisma migrate deploy && npm start

# Local: Stop everything
docker compose down

# Codespaces: Just works™ (auto-setup)
# Then: npm start

# Reset database
docker compose down -v && docker compose up -d && npx prisma migrate deploy && npx prisma db seed

# Access database
psql -h 127.0.0.1 -U postgres -d nodeapi

# View logs
docker compose logs -f db
```

---

## Support

- Issues: [GitHub Issues](https://github.com/YOUR_USERNAME/nodeapi-app/issues)
- Documentation: [Prisma Docs](https://www.prisma.io/docs)
- Codespaces: [GitHub Codespaces Docs](https://docs.github.com/codespaces)

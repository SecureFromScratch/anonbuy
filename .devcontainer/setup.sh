#!/bin/bash
set -e

echo "🚀 Starting Codespaces setup..."

# 1. Copy Codespaces environment file
echo "📝 Setting up environment..."
cp .env.codespaces .env

# 2. Wait for database to be healthy
echo "⏳ Waiting for database..."
timeout 60 bash -c 'until docker-compose exec -T db pg_isready -U postgres; do sleep 2; done'

# 3. Install dependencies
echo "📦 Installing dependencies..."
npm ci

# 4. Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# 5. Run migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# 6. Seed database (if seed script exists)
echo "🌱 Seeding database..."
if grep -q "prisma.*seed" package.json; then
    npx prisma db seed
else
    echo "⚠️  No seed script found, skipping..."
fi

echo "✅ Setup complete! Run 'npm start' to launch the app."

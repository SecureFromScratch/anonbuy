FROM node:20-bullseye

# Install PostgreSQL client for Prisma
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Keep container running
CMD ["sleep", "infinity"]

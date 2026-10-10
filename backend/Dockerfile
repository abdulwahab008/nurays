# syntax=docker/dockerfile:1.7
#
# Nuray backend — multi-stage Docker build
# Stage 1: install deps + generate Prisma client + build TypeScript
# Stage 2: production runtime with only the artefacts it needs

# -------- builder --------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma client against the schema
RUN npx prisma generate

# Now bring source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# -------- runner --------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

# Debian security fixes the upstream Node image has not picked up yet (the CI image scan
# fails on fixable high and critical issues). Nothing new is installed.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade \
 && rm -rf /var/lib/apt/lists/*

# Install only production deps (no dev/test, no ts-node etc.) and generate the Prisma client,
# then remove npm, npx, corepack and yarn: the running service needs none of them and they
# bring their own vulnerable libraries. (Migrations run the local Prisma CLI, see CMD.)
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Copy compiled JS from the builder
COPY --from=builder /app/dist ./dist

# Run as non-root
# /app/uploads is where the local storage driver keeps files; mount a persistent
# volume there (docker-compose does), or use STORAGE_DRIVER=s3.
RUN useradd --system --uid 1001 --shell /usr/sbin/nologin app \
 && mkdir -p /app/uploads \
 && chown -R app:app /app
ENV UPLOADS_DIR=/app/uploads
USER app

EXPOSE 3001

# Healthcheck — docker / compose / k8s can use this
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# MIGRATE_ON_START=true applies pending migrations (prisma migrate deploy) before starting.
# Safe with several instances starting at once: Prisma serialises migrations with a database
# lock. Otherwise run `npm run db:migrate` as a release step before rolling out a new image.
# `exec` keeps node as PID 1 so it receives SIGTERM for the graceful shutdown.
CMD ["sh", "-c", "if [ \"$MIGRATE_ON_START\" = \"true\" ]; then node_modules/.bin/prisma migrate deploy || exit 1; fi; exec node dist/index.js"]

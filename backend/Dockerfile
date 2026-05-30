# syntax=docker/dockerfile:1.7
#
# FrozenNuray backend — multi-stage Docker build
# Stage 1: install deps + generate Prisma client + build TypeScript
# Stage 2: production runtime with only the artefacts it needs

# -------- builder --------
FROM node:20-bookworm-slim AS builder
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
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

# Install only production deps (no dev/test, no ts-node etc.)
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# Copy compiled JS from the builder
COPY --from=builder /app/dist ./dist

# Run as non-root
RUN useradd --system --uid 1001 --shell /usr/sbin/nologin app \
 && chown -R app:app /app
USER app

EXPOSE 3001

# Healthcheck — docker / compose / k8s can use this
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]

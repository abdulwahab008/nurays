# syntax=docker/dockerfile:1.7
#
# FrozenNuray frontend (Next.js 16) — multi-stage build
# Uses Next's `output: "standalone"` so the runtime image carries only the
# minimal server + the files it traces, not the whole node_modules.

# -------- deps --------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci


# -------- builder --------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined at build time. Forward whatever the CI
# pipeline sets so the right API URL / OAuth client land in the bundle.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_SAFEPAY_SANDBOX
# Optional: the realtime server, if it isn't at the API's origin.
ARG NEXT_PUBLIC_WS_URL
# Company details shown on the terms / privacy / refund pages.
ARG NEXT_PUBLIC_LEGAL_COMPANY_NAME
ARG NEXT_PUBLIC_LEGAL_ADDRESS
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_LEGAL_REVIEWED
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID} \
    NEXT_PUBLIC_SAFEPAY_SANDBOX=${NEXT_PUBLIC_SAFEPAY_SANDBOX} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_PUBLIC_LEGAL_COMPANY_NAME=${NEXT_PUBLIC_LEGAL_COMPANY_NAME} \
    NEXT_PUBLIC_LEGAL_ADDRESS=${NEXT_PUBLIC_LEGAL_ADDRESS} \
    NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL} \
    NEXT_PUBLIC_LEGAL_REVIEWED=${NEXT_PUBLIC_LEGAL_REVIEWED} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# -------- runner --------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user
RUN useradd --system --uid 1001 --shell /usr/sbin/nologin nextjs

# Standalone output already contains a minimal node_modules + server.js
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

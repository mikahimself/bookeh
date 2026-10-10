# Production image (Story 2.1). Requires `output: 'standalone'` in
# next.config.ts. Runtime configuration comes only from the environment
# variables named in .env.example; nothing secret is baked in here.
#
# Keep the Node version in lock-step with .github/workflows/ci.yml
# (setup-node 22.23.3) and docker-compose.yml.

FROM node:22.23.3-alpine AS base

FROM base AS deps
# See https://github.com/nodejs/docker-node/tree/main#nodealpine for why
# libc6-compat may be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Dev dependencies included (npm ci default): the build needs typescript and
# the Tailwind toolchain, which are devDependencies.
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# The Media collection writes uploads to ./media at runtime; production
# bind-mounts over it (Story 2.2), but the image must be writable without one.
RUN mkdir media && chown nextjs:nodejs media
# Standalone output: traced server + node_modules, then the static assets
# next/font produced at build (Open Sans is self-hosted; no runtime fetch).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# server.js is created by next build from the standalone output.
CMD ["node", "server.js"]

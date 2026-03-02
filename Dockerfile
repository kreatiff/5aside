# ---- Stage 1: Install all dependencies (including devDeps needed for build) ----
FROM node:20-alpine AS deps
WORKDIR /app

# Build tools required for native modules (argon2)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/recon/package.json ./packages/recon/

RUN npm ci

# ---- Stage 2: Build all packages ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---- Stage 3: Production dependencies only ----
FROM node:20-alpine AS prod-deps
WORKDIR /app

# Build tools required for native modules (argon2)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/recon/package.json ./packages/recon/

RUN npm ci --omit=dev

# ---- Stage 4: Final runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Production node_modules with workspace symlinks
COPY --from=prod-deps /app/node_modules ./node_modules

# Compiled API
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Compiled shared packages (workspace symlinks resolve to these paths)
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/recon/dist ./packages/recon/dist

# Built web frontend (served as static files by API)
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Database migrations (run by entrypoint before server start)
COPY apps/api/migrations ./apps/api/migrations

# package.json files needed for Node.js ESM module resolution
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/recon/package.json ./packages/recon/

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]

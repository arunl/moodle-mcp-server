# Dockerfile for Fly.io deployment
FROM node:20-alpine AS builder

# Build arguments for version info (passed from GitHub Actions or fly deploy)
ARG COMMIT_SHA=unknown
ARG BUILD_DATE

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Generate version.json from build args (set by CI/CD)
# COMMIT_SHA and BUILD_DATE are passed from GitHub Actions or manual fly deploy
# Note: Alpine sh doesn't support ${VAR:0:7}, use printf for portable substring
RUN SHORT_SHA=$(printf "%.7s" "$COMMIT_SHA") && \
    BUILD_TS="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    echo "{\"commit\":\"${SHORT_SHA}\",\"commitFull\":\"${COMMIT_SHA}\",\"branch\":\"master\",\"buildDate\":\"${BUILD_TS}\"}" > version.json && \
    cat version.json

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built files and production dependencies
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/version.json ./version.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/index.js"]

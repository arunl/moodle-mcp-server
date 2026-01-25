# Dockerfile for Fly.io deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Install git for version detection
RUN apk add --no-cache git

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Note: .git directory should be in build context for version detection
# If deploying from GitHub Actions, the checkout action includes .git
# If deploying manually, ensure you're in a git repo

# Generate version.json with git commit info
RUN node scripts/generate-version.js || echo '{"commit":"unknown","buildDate":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > version.json

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

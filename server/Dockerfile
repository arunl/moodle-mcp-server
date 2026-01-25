# Dockerfile for Fly.io deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Build arguments for version info (set by CI/CD)
ARG COMMIT_SHA=unknown
ARG BUILD_DATE=unknown

# Copy built files and production dependencies
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080
ENV COMMIT_SHA=${COMMIT_SHA}
ENV BUILD_DATE=${BUILD_DATE}

CMD ["node", "dist/index.js"]

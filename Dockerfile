# Moodle MCP Server Docker Image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY dist ./dist

# Set environment
ENV NODE_ENV=production

# Run the server
CMD ["node", "dist/index.js"]

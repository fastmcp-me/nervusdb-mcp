# Synapse-Architect MCP Server - Production Dockerfile
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# Copy SynapseDB dependency first (from parent context)
COPY SynapseDB ../SynapseDB

# Copy Synapse-Architect files
COPY Synapse-Architect/package.json Synapse-Architect/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY Synapse-Architect/src ./src
COPY Synapse-Architect/tsconfig.json ./

# Set environment
ENV NODE_ENV=production
ENV SYNAPSE_HOST=0.0.0.0
ENV SYNAPSE_PORT=4000

# Create directory for indexed projects
RUN mkdir -p /projects

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"

# Start the server using tsx (no build required)
CMD ["npx", "tsx", "src/server/index.ts"]

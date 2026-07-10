FROM node:20-alpine AS builder

WORKDIR /app

# Make /app writable by the node user before dropping privileges
RUN chown node:node /app

USER node

# Install dependencies
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# Copy source
COPY --chown=node:node . .

# Build
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]

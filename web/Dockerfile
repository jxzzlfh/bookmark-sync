FROM node:20-alpine AS builder

WORKDIR /app

# Build args for Next.js public env vars (must be set at build time)
ARG NEXT_PUBLIC_API_URL=http://server:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Install pnpm
RUN npm install -g pnpm

# Copy shared package first
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Copy web package
COPY web/package.json ./web/
COPY web/src ./web/src
COPY web/public ./web/public
COPY web/next.config.js ./web/
COPY web/tailwind.config.ts ./web/
COPY web/postcss.config.js ./web/
COPY web/tsconfig.json ./web/

# Copy root config
COPY package.json pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile=false

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build web
WORKDIR /app/web
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/web/package.json ./web/

# Copy built Next.js app
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/next.config.js ./web/

# Install production dependencies only
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/node_modules ./web/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

WORKDIR /app/web

EXPOSE 3001

CMD ["npx", "next", "start", "-p", "3001"]

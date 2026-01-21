FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy shared package first
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Copy server package
COPY server/package.json ./server/
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Copy root config
COPY package.json pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile=false

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build server
WORKDIR /app/server
RUN pnpm build

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["node", "dist/index.js"]

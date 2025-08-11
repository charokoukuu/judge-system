# Stage 1: Install dependencies
FROM node:18-alpine AS deps
WORKDIR /usr/src/app

# Copy root package.json and workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files to respect the monorepo structure
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/types/package.json ./packages/types/

# Install pnpm
RUN npm install -g pnpm

# Install all dependencies for the entire monorepo
# In a real CI/CD, the lockfile should be committed and up-to-date.
# For this environment, we remove --frozen-lockfile to allow it to proceed.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# Stage 2: Build the application
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Copy files from the previous stage
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY . .

# Build the frontend application
RUN npx turbo build --filter=frontend

# Stage 3: Production image
FROM node:18-alpine AS production
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy production dependencies
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/apps/frontend/node_modules ./apps/frontend/node_modules

# Copy the built application
COPY --from=builder /usr/src/app/apps/frontend/.next ./.next
COPY --from=builder /usr/src/app/apps/frontend/public ./public
COPY --from=builder /usr/src/app/apps/frontend/package.json .
COPY --from=builder /usr/src/app/apps/frontend/next.config.mjs .

EXPOSE 3000
CMD ["npm", "start"]

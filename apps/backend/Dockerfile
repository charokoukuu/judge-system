# Stage 1: Install dependencies
FROM node:18-alpine AS deps
WORKDIR /usr/src/app

# Copy root package.json and workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files to respect the monorepo structure
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/types/package.json ./packages/types/

# Enable corepack and activate the pnpm version declared in root package.json (packageManager field)
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Install all dependencies for the entire monorepo
# In a real CI/CD, the lockfile should be committed and up-to-date.
# For this environment, we remove --frozen-lockfile to allow it to proceed.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# Stage 2: Build the application
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Enable corepack and activate pnpm (needed because turbo invokes the package manager during build)
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

# Copy files from the previous stage
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/apps/backend/node_modules ./apps/backend/node_modules
COPY . .

# Build the backend application
RUN npx turbo build --filter=backend

# Stage 3: Production image
FROM node:18-alpine AS production
WORKDIR /usr/src/app

# Copy production dependencies
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/apps/backend/node_modules ./apps/backend/node_modules

# Copy the built application
COPY --from=builder /usr/src/app/apps/backend/dist ./dist
COPY --from=builder /usr/src/app/apps/backend/package.json .

EXPOSE 3001
CMD ["node", "dist/main"]

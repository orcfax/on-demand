# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the full repo first (needed for link: deps into services/*)
COPY . .

RUN pnpm install --frozen-lockfile
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm build

# ---- run ----
FROM node:20-alpine AS run
WORKDIR /app
ENV PUBLIC_NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/static ./static

EXPOSE 3000
CMD ["node", "build"]

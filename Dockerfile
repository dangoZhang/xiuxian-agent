FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runtime

RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV DATABASE_PATH=/app/data/xiuxian.sqlite
ENV WEB_DIST_PATH=/app/apps/web/dist

COPY --from=build /app /app

RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8787

CMD ["node", "apps/server/dist/index.js"]

# Сборка из корня репозитория: docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN npm run build -w @tandem/domain && npm run build -w @tandem/api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN apk add --no-cache openssl
# Движок миграций скачивается при сборке: в работающем контейнере node_modules только для чтения
RUN npm ci --omit=dev --ignore-scripts -w @tandem/api -w @tandem/domain \
  && npm rebuild @prisma/engines prisma \
  && npm cache clean --force
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
COPY --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint
# Том со сгенерированным секретом сессий стенда
RUN mkdir -p /var/lib/tandem && chown node:node /var/lib/tandem
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["api-entrypoint"]

# Сборка из корня репозитория: docker build -f apps/web/Dockerfile .
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
COPY apps/web apps/web
# Страница /check показывает docs/scenarios.md
COPY docs/scenarios.md docs/
RUN npm run build -w @tandem/domain && npm run build -w @tandem/web

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

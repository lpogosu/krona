# Сборка: ядро, CLI и статический фронтенд из одного lock-файла.
FROM node:22.20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/cli/package.json apps/cli/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# Фронтенд — это статика: расчёт идёт в браузере, серверу нечего вычислять.
FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

# CLI для CI-пайплайнов: `docker run --rm -v $PWD:/work krona-cli check /work/crontab`.
FROM node:22.20-alpine AS cli
WORKDIR /opt/krona
COPY --from=build /src/package.json ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/core/package.json packages/core/
COPY --from=build /src/packages/core/dist packages/core/dist
COPY --from=build /src/apps/cli/package.json apps/cli/
COPY --from=build /src/apps/cli/dist apps/cli/dist
USER node
ENTRYPOINT ["node", "/opt/krona/apps/cli/dist/main.js"]

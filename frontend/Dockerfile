# Stage 1: 前端构建
#FROM node:22-alpine AS builder
FROM docker.1ms.run/library/node:22-alpine AS builder
WORKDIR /app
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Scraper 构建
FROM docker.1ms.run/library/node:22-slim AS scraper-builder
WORKDIR /app
COPY server/ ./
RUN npm ci
RUN npx playwright install chromium --with-deps

# Stage 3: 运行时
# FROM node:22-slim AS runtime
FROM docker.1ms.run/library/node:22-slim AS runtime
RUN apt-get update && \
    apt-get install -y nginx supervisor --no-install-recommends && \
    rm -f /etc/nginx/sites-enabled/default && \
    rm -rf /var/lib/apt/lists/*

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=scraper-builder /app /app/scraper
COPY --from=scraper-builder /root/.cache/ms-playwright /root/.cache/ms-playwright

WORKDIR /app/scraper
RUN npx playwright install-deps chromium && rm -rf /var/lib/apt/lists/*

WORKDIR /
EXPOSE 80
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

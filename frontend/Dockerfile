# Stage 1: 前端构建
FROM docker.m.daocloud.io/library/node:22-alpine AS builder
WORKDIR /app
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: 运行时
FROM docker.m.daocloud.io/library/node:22-alpine AS runtime
RUN apk add --no-cache nginx supervisor && \
    rm -f /etc/nginx/http.d/default.conf

COPY frontend/nginx.conf /etc/nginx/http.d/default.conf
COPY frontend/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY --from=builder /app/dist /usr/share/nginx/html

WORKDIR /
EXPOSE 80
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

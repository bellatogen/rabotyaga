# Самодостаточный образ: фронт собирается внутри, без томов и хост-сборки.
# Контекст сборки — КОРЕНЬ репозитория (см. docker-compose.yml: context: ..).

# ── этап 1: сборка фронтенда (Vite) ──
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
# CACHEBUST инвалидирует кеш при каждом деплое начиная отсюда,
# но НЕ трогает дорогой слой npm ci выше.
ARG CACHEBUST=1
COPY frontend/ ./
RUN npm run build

# ── этап 2: бэкенд (Express + Telegraf) с вшитым фронтом ──
FROM node:22-alpine
WORKDIR /app
COPY rabotyaga-bot/package*.json ./
RUN npm ci --omit=dev
COPY rabotyaga-bot/ ./
COPY --from=frontend /fe/dist ./frontend/dist
EXPOSE 3001
CMD ["node", "server.js"]

# --- Frontend build (runs natively, no emulation needed) -------------------
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Server dependencies (pure JS, platform independent) -------------------
FROM --platform=$BUILDPLATFORM node:24-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime ---------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=4008 \
    DATA_DIR=/data \
    WEB_DIR=/app/web
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=web /app/web/dist /app/web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4008
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:4008/api/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]

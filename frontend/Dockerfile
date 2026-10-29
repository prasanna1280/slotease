# syntax=docker/dockerfile:1
# SlotEase web image: Vite build served by nginx (SPA + /api proxy to the backend).

# ---------- Build stage ----------
FROM node:22-alpine AS build

WORKDIR /app

# Empty = same origin: the SPA calls /api/v1 on its own host and nginx proxies it.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

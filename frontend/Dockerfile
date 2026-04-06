# ── Stage 1: build ──────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# In the production bundle import.meta.env.DEV is false, so api.ts falls back
# to http://127.0.0.1:8000 — the backend's host-mapped port, reachable from
# the user's browser.  Override VITE_API_URL at build time only if the backend
# is on a different host (e.g. cloud deploy).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: serve ───────────────────────────────────────────────
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]

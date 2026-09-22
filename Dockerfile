# Multi-stage Dockerfile for Next.js (Node 20)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN set -eux; \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  else npm i; fi

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/templates ./templates

EXPOSE 3000-3009
CMD ["npm", "run", "start:dynamic"]
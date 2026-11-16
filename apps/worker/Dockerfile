# Worker de IA (BullMQ). Construir a partir da RAIZ do repositório:
#   docker build -f apps/worker/Dockerfile -t bigstock-worker .
# NÃO TESTADO neste ambiente (sem Docker); valide no primeiro deploy.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @bigstock/contracts --filter @bigstock/billing --filter @bigstock/database build \
 && pnpm --filter @bigstock/api build \
 && pnpm --filter @bigstock/worker build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["node", "apps/worker/dist/main.js"]

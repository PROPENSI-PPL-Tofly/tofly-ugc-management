# syntax=docker/dockerfile:1

FROM node:24-slim AS build
# Prisma's query engine links against OpenSSL, which node:*-slim omits.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
# Generate before pruning: `prisma` itself is a devDependency, but the client it
# writes into node_modules/.prisma survives because @prisma/client is prod.
RUN npx prisma generate
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER node
EXPOSE 8080
CMD ["node", "dist/main"]

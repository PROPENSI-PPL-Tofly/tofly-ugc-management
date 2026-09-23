# syntax=docker/dockerfile:1

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ holds no files right now, and git does not keep an empty folder; create it so the
# runtime COPY below works whether or not the app ships static assets.
RUN mkdir -p public && npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080
# Next does not trace .next/static or public into standalone, so both COPYs are
# mandatory — without them the app boots and renders completely unstyled.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]

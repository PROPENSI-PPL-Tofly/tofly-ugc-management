# syntax=docker/dockerfile:1

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
# NEXT_PUBLIC_* is inlined at build time, so the frontend DSN must be a build arg. The auth
# token is mounted as a BuildKit secret: it uploads source maps for readable stack traces and
# never lands in the image layers.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ holds no files right now, and git does not keep an empty folder; create it so the
# runtime COPY below works whether or not the app ships static assets.
RUN --mount=type=secret,id=sentry_auth_token \
  mkdir -p public && SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)" npm run build

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

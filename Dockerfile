# OpenDAL's Linux native binding requires glibc 2.38 or newer.
FROM node:22.23.0-trixie-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_AMAP_KEY=""
RUN node scripts/ci-env.mjs && npx prisma generate && npm run build && npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
ARG PERIPLUS_RELEASE_SHA=development
ENV PERIPLUS_RELEASE_SHA=$PERIPLUS_RELEASE_SHA
LABEL org.opencontainers.image.source="https://github.com/ykfnxx/periplus" org.opencontainers.image.revision=$PERIPLUS_RELEASE_SHA
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/config ./config
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]

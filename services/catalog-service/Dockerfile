FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3002/healthz || exit 1
CMD ["node", "server.js"]

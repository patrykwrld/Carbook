FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js db.js ./
COPY public ./public

ENV PORT=3000 DB_PATH=/data/carbook.db TRUST_PROXY=1
VOLUME /data
EXPOSE 3000

CMD ["node", "server.js"]

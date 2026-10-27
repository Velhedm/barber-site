FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY dist ./dist
COPY scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=3000 DB_PATH=/data/bookings.sqlite
EXPOSE 3000
CMD ["node","server/index.js"]

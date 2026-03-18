FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY agents/server.js ./agents/server.js
ENV PORT=3001
EXPOSE 3001
CMD ["node", "agents/server.js"]

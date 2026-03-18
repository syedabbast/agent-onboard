FROM node:20-slim
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy only the proxy server
COPY agents/server.js ./agents/server.js

# Cloud Run uses PORT env variable
ENV PORT=3001
EXPOSE 3001

CMD ["node", "agents/server.js"]

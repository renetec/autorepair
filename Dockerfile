FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3001
ENV NODE_ENV=production
CMD ["npx", "tsx", "server.ts"]

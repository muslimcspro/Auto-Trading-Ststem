FROM node:22-bookworm-slim

WORKDIR /app

ENV PORT=8080

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "run", "start"]

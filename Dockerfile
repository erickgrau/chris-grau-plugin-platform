FROM node:20-slim

# Install OpenSSL for Prisma + other deps
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY backend/ ./backend/
RUN cd backend && npx prisma generate && npm run build

EXPOSE 3001

CMD ["node", "backend/dist/index.js"]

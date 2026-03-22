FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY backend/ ./backend/
RUN cd backend && npx prisma generate && npm run build

EXPOSE 3001

CMD ["node", "backend/dist/index.js"]

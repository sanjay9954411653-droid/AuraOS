   FROM node:20
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   ENV VITE_API_URL=https://auraos-production-b1ff.up.railway.app/api/v1
   RUN npm run build
   RUN npm install -g serve
   EXPOSE 3001
   CMD ["sh", "-c", "serve -s dist -l $PORT"]

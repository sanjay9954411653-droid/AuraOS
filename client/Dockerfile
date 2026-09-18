   FROM node:20
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   RUN npm run build
   RUN npm install -g serve
   EXPOSE 3001
   CMD ["sh", "-c", "serve -s dist -l $PORT"]

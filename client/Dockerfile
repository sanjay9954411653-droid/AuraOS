   FROM node:20
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   ARG VITE_API_URL
   ENV VITE_API_URL=$VITE_API_URL
   RUN npm run build
   RUN npm install -g serve
   EXPOSE 3001
   CMD ["sh", "-c", "serve -s dist -l $PORT"]

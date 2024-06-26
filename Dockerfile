FROM node:14.19.0
WORKDIR /app/src
COPY src/package.json .
RUN npm install
RUN npm install --global expo/ngrok
RUN npm install --global expo-cli
COPY . .
EXPOSE 19002
CMD [ -d "node_modules" ] && expo start --tunnel || npm ci && expo start --tunnel

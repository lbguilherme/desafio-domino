FROM node:20
WORKDIR /app
RUN npm i -g pnpm
COPY package.json pnpm-lock.yaml /app/
RUN pnpm install
ADD src /app/src
CMD pnpm exec vite-node src/server.ts

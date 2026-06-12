FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY . .

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg

EXPOSE 4173

CMD ["node", "server.js"]

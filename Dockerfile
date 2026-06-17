FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
RUN python3 -c "from ultralytics import YOLO; YOLO('yolov8x.pt')"
COPY . .

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg
ENV PYTHON_PATH=python3
ENV ARCAI_YOLO_MODEL=yolov8x.pt

EXPOSE 4173

CMD ["node", "server.js"]

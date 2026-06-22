FROM python:3.11-slim AS model-builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /model
RUN pip install --no-cache-dir ultralytics onnx \
  && python -c "from ultralytics import YOLO; YOLO('yolov8x.pt').export(format='onnx', imgsz=640, opset=12, simplify=False)"

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY . .
COPY --from=model-builder /model/yolov8x.onnx /app/models/yolov8x.onnx

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg
ENV PYTHON_PATH=python3
ENV ARCAI_YOLO_MODEL=/app/models/yolov8x.onnx
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1

EXPOSE 4173

CMD ["node", "server.js"]

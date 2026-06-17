# ArcAI YOLO CSV generator for Google Colab
# Paste this whole cell into Colab and run it.

!pip -q install ultralytics opencv-python pandas

from google.colab import files
from ultralytics import YOLO
import cv2
import math
import os
import pandas as pd

print("Upload the same shot video that you will use in ArcAI.")
uploaded = files.upload()
if not uploaded:
    raise RuntimeError("No video uploaded.")

video_path = next(iter(uploaded.keys()))
print("video:", video_path)

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
cap.release()

print({"fps": fps, "width": frame_w, "height": frame_h, "frames": frame_count})

# COCO class 32 = sports ball. imgsz=1280 is slower but more reliable for small basketballs.
model = YOLO("yolov8x.pt")
results = model.predict(
    source=video_path,
    classes=[32],
    conf=0.03,
    iou=0.45,
    imgsz=1280,
    stream=True,
    verbose=False,
)

raw_rows = []
for frame_idx, result in enumerate(results):
    boxes = result.boxes
    if boxes is None:
        continue
    for box in boxes:
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
        conf = float(box.conf[0])
        raw_rows.append({
            "frame": frame_idx,
            "time_s": frame_idx / fps,
            "confidence": conf,
            "x_center": (x1 + x2) / 2,
            "y_center": (y1 + y2) / 2,
            "width": x2 - x1,
            "height": y2 - y1,
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
        })

raw = pd.DataFrame(raw_rows)
if raw.empty:
    raise RuntimeError("YOLO did not detect a sports ball. Try a clearer side-view clip.")

raw.to_csv("arcai_yolo_raw_candidates.csv", index=False)
print("raw detections:", len(raw), "frames:", raw["frame"].nunique())

# Build one continuous track. This is detection data, not a validated biomechanical measurement.
track_rows = []
last_x = None
last_y = None
last_frame = None
max_jump_px = max(frame_w, frame_h) * 0.18

for frame, group in raw.groupby("frame"):
    group = group.copy()
    if last_x is None:
        # Start from the strongest detection in the first detected frame.
        chosen = group.sort_values("confidence", ascending=False).iloc[0]
    else:
        gap = max(1, int(frame - last_frame))
        allowed = max_jump_px * math.sqrt(gap)
        group["dist"] = ((group["x_center"] - last_x) ** 2 + (group["y_center"] - last_y) ** 2) ** 0.5
        near = group[group["dist"] <= allowed]
        if near.empty:
            # Keep the strongest candidate, but mark the jump in the preview/CSV by continuity gap.
            chosen = group.sort_values("confidence", ascending=False).iloc[0]
        else:
            near["score"] = near["confidence"] - (near["dist"] / max(allowed, 1)) * 0.35
            chosen = near.sort_values("score", ascending=False).iloc[0]
    track_rows.append(chosen)
    last_x = float(chosen["x_center"])
    last_y = float(chosen["y_center"])
    last_frame = int(frame)

track = pd.DataFrame(track_rows)
track = track[["frame", "time_s", "confidence", "x_center", "y_center", "width", "height"]].copy()
track.to_csv("arcai_yolo_ball_track.csv", index=False)

print("track points:", len(track))
print("frame range:", int(track["frame"].min()), "to", int(track["frame"].max()))
display(track.head(20))

# Create a quick preview video so you can visually reject bad tracks before loading CSV into ArcAI.
cap = cv2.VideoCapture(video_path)
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
preview_path = "arcai_yolo_preview.mp4"
out = cv2.VideoWriter(preview_path, fourcc, fps, (frame_w, frame_h))

track_by_frame = {int(row.frame): row for row in track.itertuples(index=False)}
trail = []
frame_idx = 0

while True:
    ok, frame_img = cap.read()
    if not ok:
        break
    if frame_idx in track_by_frame:
        row = track_by_frame[frame_idx]
        center = (int(row.x_center), int(row.y_center))
        radius = max(4, int(max(row.width, row.height) / 2))
        trail.append(center)
        cv2.circle(frame_img, center, radius, (0, 215, 255), 3)
    for a, b in zip(trail[-45:], trail[-44:]):
        cv2.line(frame_img, a, b, (0, 215, 255), 3)
    cv2.putText(frame_img, "ArcAI YOLO ball track preview", (24, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 215, 255), 3)
    out.write(frame_img)
    frame_idx += 1

cap.release()
out.release()

print("Download these files:")
print("- arcai_yolo_ball_track.csv  -> load this in ArcAI with YOLO CSV")
print("- arcai_yolo_preview.mp4     -> check whether the detected ball path is acceptable")
files.download("arcai_yolo_ball_track.csv")
files.download("arcai_yolo_preview.mp4")

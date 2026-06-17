import argparse
import json
import math
import sys

import cv2
from ultralytics import YOLO


def is_ball_label(name):
    label = str(name or "").strip().lower()
    return label in {"sports ball", "ball", "basketball"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--model", default="yolov8x.pt")
    parser.add_argument("--conf", type=float, default=0.03)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--vid-stride", type=int, default=2)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()

    if width <= 0 or height <= 0:
        raise RuntimeError("video dimensions are unavailable")

    model = YOLO(args.model)
    rows = []
    names = getattr(model, "names", {}) or {}
    min_box = max(10.0, min(width, height) * 0.012)
    max_box = min(width, height) * 0.16

    for result_index, result in enumerate(
        model.predict(
            source=args.video,
            conf=args.conf,
            iou=0.45,
            imgsz=args.imgsz,
            vid_stride=args.vid_stride,
            stream=True,
            verbose=False,
        )
    ):
        frame_index = result_index * max(1, args.vid_stride)
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            continue
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        classes = boxes.cls.cpu().numpy()
        for box, conf, cls in zip(xyxy, confs, classes):
            class_id = int(cls)
            label = names.get(class_id, str(class_id))
            if not is_ball_label(label):
                continue
            x1, y1, x2, y2 = [float(v) for v in box]
            box_w = max(0.0, x2 - x1)
            box_h = max(0.0, y2 - y1)
            if box_w <= 0 or box_h <= 0:
                continue
            ratio = max(box_w, box_h) / max(1.0, min(box_w, box_h))
            if min(box_w, box_h) < min_box or max(box_w, box_h) > max_box or ratio > 2.35:
                continue
            rows.append(
                {
                    "frame": frame_index,
                    "time_s": frame_index / fps,
                    "class": label,
                    "confidence": float(conf),
                    "x_center": (x1 + x2) / 2.0,
                    "y_center": (y1 + y2) / 2.0,
                    "width": box_w,
                    "height": box_h,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                }
            )

    by_frame = {}
    for row in rows:
        frame = int(row["frame"])
        current = by_frame.get(frame)
        if current is None or row["confidence"] > current["confidence"]:
            by_frame[frame] = row
    track = [by_frame[key] for key in sorted(by_frame)]
    avg_conf = sum(row["confidence"] for row in track) / len(track) if track else 0.0

    print(
        json.dumps(
            {
                "ok": True,
                "model": args.model,
                "video": {"width": width, "height": height, "fps": fps, "frames": frames},
                "raw_detections": len(rows),
                "track_points": len(track),
                "average_confidence": avg_conf,
                "rows": track,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)

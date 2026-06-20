import argparse
import json
import sys
import time

import cv2
import numpy as np


SPORTS_BALL_CLASS_ID = 32


def letterbox(frame, size):
    height, width = frame.shape[:2]
    scale = min(size / width, size / height)
    resized_width = max(1, round(width * scale))
    resized_height = max(1, round(height * scale))
    resized = cv2.resize(frame, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    pad_x = (size - resized_width) // 2
    pad_y = (size - resized_height) // 2
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    canvas[pad_y : pad_y + resized_height, pad_x : pad_x + resized_width] = resized
    return canvas, scale, pad_x, pad_y


def prediction_rows(output):
    prediction = np.asarray(output)
    prediction = np.squeeze(prediction)
    if prediction.ndim != 2:
        raise RuntimeError(f"unexpected ONNX output shape: {prediction.shape}")
    if prediction.shape[0] < prediction.shape[1]:
        prediction = prediction.T
    if prediction.shape[1] <= 4 + SPORTS_BALL_CLASS_ID:
        raise RuntimeError(f"ONNX output has no sports-ball class: {prediction.shape}")
    return prediction


def detect_ball(net, frame, image_size, confidence_threshold):
    prepared, scale, pad_x, pad_y = letterbox(frame, image_size)
    blob = cv2.dnn.blobFromImage(
        prepared,
        scalefactor=1.0 / 255.0,
        size=(image_size, image_size),
        swapRB=True,
        crop=False,
    )
    net.setInput(blob)
    rows = prediction_rows(net.forward())
    scores = rows[:, 4 + SPORTS_BALL_CLASS_ID]
    candidate_indices = np.flatnonzero(scores >= confidence_threshold)
    if candidate_indices.size == 0:
        return None

    best_index = int(candidate_indices[np.argmax(scores[candidate_indices])])
    center_x, center_y, box_width, box_height = [float(value) for value in rows[best_index, :4]]
    x1 = (center_x - box_width / 2.0 - pad_x) / scale
    y1 = (center_y - box_height / 2.0 - pad_y) / scale
    x2 = (center_x + box_width / 2.0 - pad_x) / scale
    y2 = (center_y + box_height / 2.0 - pad_y) / scale
    frame_height, frame_width = frame.shape[:2]
    x1 = max(0.0, min(float(frame_width), x1))
    y1 = max(0.0, min(float(frame_height), y1))
    x2 = max(0.0, min(float(frame_width), x2))
    y2 = max(0.0, min(float(frame_height), y2))
    return {
        "confidence": float(scores[best_index]),
        "x_center": (x1 + x2) / 2.0,
        "y_center": (y1 + y2) / 2.0,
        "width": max(0.0, x2 - x1),
        "height": max(0.0, y2 - y1),
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--model", required=True)
    parser.add_argument("--conf", type=float, default=0.03)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--vid-stride", type=int, default=1)
    args = parser.parse_args()
    started_at = time.monotonic()

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if width <= 0 or height <= 0:
        cap.release()
        raise RuntimeError("video dimensions are unavailable")

    net = cv2.dnn.readNetFromONNX(args.model)
    min_box = max(10.0, min(width, height) * 0.012)
    max_box = min(width, height) * 0.16
    track = []
    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_index % max(1, args.vid_stride) == 0:
            row = detect_ball(net, frame, args.imgsz, args.conf)
            if row:
                box_width = row["width"]
                box_height = row["height"]
                ratio = max(box_width, box_height) / max(1.0, min(box_width, box_height))
                if min(box_width, box_height) >= min_box and max(box_width, box_height) <= max_box and ratio <= 2.35:
                    row.update(
                        {
                            "frame": frame_index,
                            "time_s": frame_index / fps,
                            "class": "sports ball",
                        }
                    )
                    track.append(row)
        frame_index += 1

    cap.release()
    average_confidence = sum(row["confidence"] for row in track) / len(track) if track else 0.0
    print(
        json.dumps(
            {
                "ok": True,
                "engine": "opencv-dnn-onnx",
                "model": args.model,
                "video": {"width": width, "height": height, "fps": fps, "frames": frames},
                "raw_detections": len(track),
                "track_points": len(track),
                "average_confidence": average_confidence,
                "elapsed_seconds": time.monotonic() - started_at,
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

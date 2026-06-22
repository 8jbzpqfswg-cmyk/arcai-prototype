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
        "source": "yolo_onnx",
    }


def ball_template(frame, row):
    frame_height, frame_width = frame.shape[:2]
    x1 = max(0, int(np.floor(row["x1"])))
    y1 = max(0, int(np.floor(row["y1"])))
    x2 = min(frame_width, int(np.ceil(row["x2"])))
    y2 = min(frame_height, int(np.ceil(row["y2"])))
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None
    return cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)


def track_ball_template(frame, template, previous, velocity, threshold=0.34):
    if template is None or previous is None:
        return None
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    frame_height, frame_width = gray.shape
    speed = float(np.hypot(velocity[0], velocity[1]))
    predicted_x = previous["x_center"] + velocity[0]
    predicted_y = previous["y_center"] + velocity[1]
    radius = max(80.0, speed * 2.2 + 40.0, max(previous["width"], previous["height"]) * 4.0)
    search_x1 = max(0, int(np.floor(predicted_x - radius)))
    search_y1 = max(0, int(np.floor(predicted_y - radius)))
    search_x2 = min(frame_width, int(np.ceil(predicted_x + radius)))
    search_y2 = min(frame_height, int(np.ceil(predicted_y + radius)))
    search = gray[search_y1:search_y2, search_x1:search_x2]
    if search.size == 0:
        return None

    best = None
    for scale in (0.82, 0.92, 1.0, 1.08, 1.18):
        template_width = max(8, int(round(template.shape[1] * scale)))
        template_height = max(8, int(round(template.shape[0] * scale)))
        if template_width >= search.shape[1] or template_height >= search.shape[0]:
            continue
        scaled = cv2.resize(template, (template_width, template_height), interpolation=cv2.INTER_LINEAR)
        scores = cv2.matchTemplate(search, scaled, cv2.TM_CCOEFF_NORMED)
        _, score, _, location = cv2.minMaxLoc(scores)
        center_x = search_x1 + location[0] + template_width / 2.0
        center_y = search_y1 + location[1] + template_height / 2.0
        prediction_error = float(np.hypot(center_x - predicted_x, center_y - predicted_y))
        rank = float(score) - 0.0015 * prediction_error
        if best is None or rank > best[0]:
            best = (rank, float(score), center_x, center_y, template_width, template_height)

    if best is None or best[1] < threshold:
        return None
    _, score, center_x, center_y, template_width, template_height = best
    return {
        "confidence": score,
        "x_center": center_x,
        "y_center": center_y,
        "width": float(template_width),
        "height": float(template_height),
        "x1": center_x - template_width / 2.0,
        "y1": center_y - template_height / 2.0,
        "x2": center_x + template_width / 2.0,
        "y2": center_y + template_height / 2.0,
        "source": "template_match",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--model", required=True)
    parser.add_argument("--conf", type=float, default=0.03)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--vid-stride", type=int, default=5)
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
    yolo_detections = 0
    frame_index = 0
    previous_ball = None
    template = None
    velocity = (0.0, 0.0)
    frames_since_yolo = 10_000
    max_template_gap = 18

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        row = None
        if frame_index % max(1, args.vid_stride) == 0:
            row = detect_ball(net, frame, args.imgsz, args.conf)
            if row is not None:
                yolo_detections += 1
                template = ball_template(frame, row)
                frames_since_yolo = 0
        if row is None and frames_since_yolo <= max_template_gap:
            row = track_ball_template(frame, template, previous_ball, velocity)

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
                if previous_ball is not None:
                    measured_velocity = (
                        row["x_center"] - previous_ball["x_center"],
                        row["y_center"] - previous_ball["y_center"],
                    )
                    velocity = (
                        velocity[0] * 0.45 + measured_velocity[0] * 0.55,
                        velocity[1] * 0.45 + measured_velocity[1] * 0.55,
                    )
                previous_ball = row
        frames_since_yolo += 1
        frame_index += 1

    cap.release()
    verified_rows = [row for row in track if row.get("source") == "yolo_onnx"]
    average_confidence = (
        sum(row["confidence"] for row in verified_rows) / len(verified_rows) if verified_rows else 0.0
    )
    print(
        json.dumps(
            {
                "ok": True,
                "engine": "opencv-dnn-onnx",
                "model": args.model,
                "video": {"width": width, "height": height, "fps": fps, "frames": frames},
                "raw_detections": yolo_detections,
                "verified_detections": len(verified_rows),
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

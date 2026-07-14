import argparse
import json
import math
import statistics
import sys
import time

import cv2
import numpy as np
import pandas as pd

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None


SPORTS_BALL_CLASS_ID = 32


def circularity(contour):
    area = cv2.contourArea(contour)
    perimeter = cv2.arcLength(contour, True)
    if perimeter <= 0:
        return 0.0
    return float(4.0 * math.pi * area / (perimeter * perimeter))


def motion_ball_candidates(video_path):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if source_width <= 0 or source_height <= 0:
        cap.release()
        raise RuntimeError("video dimensions are unavailable")

    work_width = 1280
    work_height = 720
    x_back = source_width / float(work_width)
    y_back = source_height / float(work_height)

    subtractor = cv2.createBackgroundSubtractorMOG2(
        history=50,
        varThreshold=50,
        detectShadows=False,
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    raw_rows = []
    previous = None
    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.resize(frame, (work_width, work_height), interpolation=cv2.INTER_AREA)

        foreground = subtractor.apply(frame)
        foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, kernel)
        foreground = cv2.dilate(foreground, kernel, iterations=2)

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        color_mask = cv2.bitwise_or(
            cv2.bitwise_or(
                cv2.inRange(hsv, np.array([0, 50, 50]), np.array([15, 255, 255])),
                cv2.inRange(hsv, np.array([160, 50, 50]), np.array([180, 255, 255])),
            ),
            cv2.inRange(hsv, np.array([5, 50, 80]), np.array([25, 255, 255])),
        )
        continuity_color_mask = cv2.bitwise_or(
            cv2.bitwise_or(
                cv2.inRange(hsv, np.array([0, 34, 45]), np.array([15, 255, 255])),
                cv2.inRange(hsv, np.array([160, 34, 45]), np.array([180, 255, 255])),
            ),
            cv2.inRange(hsv, np.array([5, 34, 70]), np.array([25, 255, 255])),
        )
        combined = cv2.dilate(cv2.bitwise_and(foreground, color_mask), kernel, iterations=2)

        candidates = []

        for contour in cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
            area = cv2.contourArea(contour)
            if 30 < area < 5000:
                perimeter = cv2.arcLength(contour, True)
                circ = 4 * math.pi * area / (perimeter ** 2) if perimeter > 0 else 0
                if circ > 0.4:
                    moments = cv2.moments(contour)
                    if moments["m00"] > 0:
                        x, y, box_width, box_height = cv2.boundingRect(contour)
                        center_x = float(moments["m10"] / moments["m00"])
                        center_y = float(moments["m01"] / moments["m00"])
                        candidates.append((circ * area * 2, center_x, center_y, box_width, box_height, x, y, "motion_color"))

        for contour in cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
            area = cv2.contourArea(contour)
            if 40 < area < 3000:
                perimeter = cv2.arcLength(contour, True)
                if perimeter > 0:
                    circ = 4 * math.pi * area / (perimeter ** 2)
                    if circ > 0.55:
                        moments = cv2.moments(contour)
                        if moments["m00"] > 0:
                            center_x = float(moments["m10"] / moments["m00"])
                            center_y = float(moments["m01"] / moments["m00"])
                            if center_y < work_height * 0.75:
                                x, y, box_width, box_height = cv2.boundingRect(contour)
                                candidates.append((circ * area, center_x, center_y, box_width, box_height, x, y, "motion_round"))

        best = None
        if candidates:
            if previous is not None:
                near = [
                    item for item in candidates
                    if math.hypot(item[1] - previous[0], item[2] - previous[1]) < 100
                ]
                if near:
                    best = max(near, key=lambda item: item[0])
            else:
                best = max(candidates, key=lambda item: item[0])

        if best is not None:
            score, center_x, center_y, box_width, box_height, x, y, source = best
            previous = (center_x, center_y)
            confidence = max(0.01, min(0.99, score / 1200.0))
            raw_rows.append(
                {
                    "frame": frame_index,
                    "time_s": frame_index / fps,
                    "confidence": confidence,
                    "x_center": center_x * x_back,
                    "y_center": center_y * y_back,
                    "width": box_width * x_back,
                    "height": box_height * y_back,
                    "x1": x * x_back,
                    "y1": y * y_back,
                    "x2": (x + box_width) * x_back,
                    "y2": (y + box_height) * y_back,
                    "source": source,
                }
            )
        frame_index += 1

    cap.release()
    return pd.DataFrame(raw_rows), {
        "width": source_width,
        "height": source_height,
        "fps": fps,
        "frames": frames,
    }


def median_velocity(track_rows):
    velocities = []
    for previous, current in zip(track_rows[-6:-1], track_rows[-5:]):
        gap = int(current["frame"] - previous["frame"])
        if gap > 0:
            velocities.append(
                (
                    (float(current["x_center"]) - float(previous["x_center"])) / gap,
                    (float(current["y_center"]) - float(previous["y_center"])) / gap,
                )
            )
    if not velocities:
        return 0.0, 0.0
    return (
        statistics.median(value[0] for value in velocities),
        statistics.median(value[1] for value in velocities),
    )


def build_track(raw, frame_width):
    if raw.empty:
        return raw

    rows = [
        group.sort_values("confidence", ascending=False).iloc[0]
        for _, group in raw.groupby("frame")
    ]
    segments = []
    current = []
    previous = None
    max_distance = frame_width * 0.095

    for row in rows:
        if previous is None:
            current = [row]
        else:
            frame_gap = int(row["frame"] - previous["frame"])
            distance = math.hypot(
                float(row["x_center"]) - float(previous["x_center"]),
                float(row["y_center"]) - float(previous["y_center"]),
            )
            if frame_gap <= 3 and distance <= max_distance:
                current.append(row)
            else:
                if current:
                    segments.append(current)
                current = [row]
        previous = row

    if current:
        segments.append(current)

    best_segment = max(segments, key=len) if segments else []
    return pd.DataFrame(best_segment)


def extend_track_with_color(video_path, track, source_width, source_height, fps):
    if track.empty or len(track) < 5:
        return track

    work_width = 1280
    work_height = 720
    x_back = source_width / float(work_width)
    y_back = source_height / float(work_height)
    x_to_work = work_width / float(source_width)
    y_to_work = work_height / float(source_height)

    extended = track.copy().sort_values("frame").reset_index(drop=True)
    last = extended.iloc[-1]
    previous = (
        float(last["x_center"]) * x_to_work,
        float(last["y_center"]) * y_to_work,
    )
    last_frame = int(last["frame"])
    missed = 0

    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, last_frame + 1)
    frame_index = last_frame + 1

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.resize(frame, (work_width, work_height), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        continuity_color_mask = cv2.bitwise_or(
            cv2.bitwise_or(
                cv2.inRange(hsv, np.array([0, 34, 45]), np.array([15, 255, 255])),
                cv2.inRange(hsv, np.array([160, 34, 45]), np.array([180, 255, 255])),
            ),
            cv2.inRange(hsv, np.array([5, 34, 70]), np.array([25, 255, 255])),
        )

        max_distance = min(230.0, 95.0 + missed * 8.0)
        candidates = []
        for contour in cv2.findContours(continuity_color_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
            area = cv2.contourArea(contour)
            if not (24 < area < 2600):
                continue
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue
            circ = 4 * math.pi * area / (perimeter ** 2)
            if circ < 0.28:
                continue
            moments = cv2.moments(contour)
            if moments["m00"] <= 0:
                continue
            center_x = float(moments["m10"] / moments["m00"])
            center_y = float(moments["m01"] / moments["m00"])
            dist = math.hypot(center_x - previous[0], center_y - previous[1])
            if dist > max_distance:
                continue
            x, y, box_width, box_height = cv2.boundingRect(contour)
            ratio = max(box_width, box_height) / max(1, min(box_width, box_height))
            if ratio > 3.0:
                continue
            score = (circ * area) / (1.0 + dist / 120.0)
            candidates.append((score, center_x, center_y, box_width, box_height, x, y, circ, dist, area))

        if candidates:
            score, center_x, center_y, box_width, box_height, x, y, circ, dist, area = max(candidates, key=lambda item: item[0])
            confidence = max(0.06, min(0.68, (circ * min(area, 900) / 900.0) * (1.0 - min(dist, max_distance) / (max_distance * 1.5))))
            extended = pd.concat(
                [
                    extended,
                    pd.DataFrame(
                        [
                            {
                                "frame": frame_index,
                                "time_s": frame_index / fps,
                                "confidence": confidence,
                                "x_center": center_x * x_back,
                                "y_center": center_y * y_back,
                                "width": box_width * x_back,
                                "height": box_height * y_back,
                                "x1": x * x_back,
                                "y1": y * y_back,
                                "x2": (x + box_width) * x_back,
                                "y2": (y + box_height) * y_back,
                                "source": "color_continuity",
                            }
                        ]
                    ),
                ],
                ignore_index=True,
            )
            previous = (center_x, center_y)
            missed = 0
        else:
            missed += 1
            if missed > 28:
                break
        frame_index += 1

    cap.release()
    return extended.sort_values("frame").reset_index(drop=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--model", required=True)
    parser.add_argument("--raw-input")
    parser.add_argument("--raw-output")
    parser.add_argument("--track-output")
    args = parser.parse_args()
    started_at = time.monotonic()

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    if width <= 0 or height <= 0:
        raise RuntimeError("video dimensions are unavailable")

    if args.raw_input:
        raw = pd.read_csv(args.raw_input)
        engine = "csv_input"
    else:
        raw, video = motion_ball_candidates(args.video)
        engine = "motion_color_round"
    if raw.empty or len(raw["frame"].unique()) < 8:
        if YOLO is None:
            raise RuntimeError("motion detector did not detect enough ball candidates and ultralytics is unavailable")
        engine = "ultralytics-yolov8x"
        model = YOLO(args.model)
        results = model.predict(
            source=args.video,
            classes=[SPORTS_BALL_CLASS_ID],
            conf=0.03,
            iou=0.45,
            imgsz=1280,
            stream=True,
            verbose=False,
        )

        raw_rows = []
        for frame_index, result in enumerate(results):
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                confidence = float(box.conf[0])
                raw_rows.append(
                    {
                        "frame": frame_index,
                        "time_s": frame_index / fps,
                        "confidence": confidence,
                        "x_center": (x1 + x2) / 2.0,
                        "y_center": (y1 + y2) / 2.0,
                        "width": x2 - x1,
                        "height": y2 - y1,
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "source": "yolo_ultralytics",
                    }
                )
        raw = pd.DataFrame(raw_rows)
    if raw.empty:
        raise RuntimeError("YOLO did not detect a sports ball")
    if args.raw_output:
        raw.to_csv(args.raw_output, index=False)

    track = build_track(raw, width)
    if engine == "motion_color_round":
        track = extend_track_with_color(args.video, track, width, height, fps)
    output_columns = [
        "frame",
        "time_s",
        "confidence",
        "x_center",
        "y_center",
        "width",
        "height",
        "x1",
        "y1",
        "x2",
        "y2",
        "source",
    ]
    rows = track[output_columns].to_dict(orient="records")
    if args.track_output:
        track[output_columns].to_csv(args.track_output, index=False)
    average_confidence = float(track["confidence"].mean()) if len(track) else 0.0
    raw_source_counts = raw["source"].value_counts().to_dict() if "source" in raw.columns else {}
    track_source_counts = track["source"].value_counts().to_dict() if "source" in track.columns and len(track) else {}

    print(
        json.dumps(
            {
                "ok": True,
                "engine": engine,
                "model": args.model,
                "video": {
                    "width": width,
                    "height": height,
                    "fps": fps,
                    "frames": frames,
                },
                "raw_detections": len(raw),
                "verified_detections": len(track),
                "track_points": len(track),
                "average_confidence": average_confidence,
                "raw_source_counts": raw_source_counts,
                "track_source_counts": track_source_counts,
                "elapsed_seconds": time.monotonic() - started_at,
                "rows": rows,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(1)

# ArcAI Shot Motion Lab

ArcAI is a prototype PWA and Node API for side-view basketball shot motion analysis. It uses the provided ArcAI logo, a soft Japanese mobile UI direction, splash logo, upload/home screen, analyzing animation, and an observation-first result screen with original video plus black-background analytical reconstruction.

## Run

```powershell
cd C:\Users\User\Documents\Codex\2026-06-10\files-mentioned-by-the-user-img\outputs\arcai-app
node server.js
```

Open `http://localhost:4173`.

## Cloud Prototype

This folder includes `Dockerfile` and `render.yaml` for a low-cost cloud prototype. The Docker image installs Linux `ffmpeg` and runs `server.js`.

For Render:

1. Push this `arcai-app` folder to a GitHub repository.
2. In Render, create a new Web Service from the repository.
3. Select Docker runtime. If Render detects `render.yaml`, use it.
4. Set the root directory to this folder if the repository contains other files.
5. Deploy, then open the public URL on iPad.

Do not upload private athlete videos into the repository. Uploaded/transcoded videos are ignored by `.dockerignore`.

## Important Limits

The current build is a working product prototype, not a validated AI biomechanics engine. It is an analysis and coach-discussion tool, not a coaching prescription, medical diagnosis, treatment tool, or injury-risk decision system.

Ground reaction force values are pose-timing proxies, not measured force. They should not be presented as measured values unless ArcAI ingests force-plate / pressure-insole data or a validated estimator. This limit is deliberate so the prototype does not overstate facts.

## Implemented

- Screen-transition UI: splash logo, home/upload, analyzing animation, and analysis result.
- PWA manifest and service worker.
- Video upload and original-video panel.
- Black-background reconstruction canvas under the source video with player landmarks, manual rim calibration, virtual board/support/court, and vGRF proxy vectors.
- Full Space, Body Zoom, and Compare views.
- Motion-based experimental ball candidate tracking. Ball-flight metrics stay pending unless the tracked trajectory passes quality checks.
- YOLO CSV import for ball tracks generated outside the browser, such as Colab experiments. Imported tracks are still treated as detection data, not a validated biomechanical measurement.
- Metric tabs for Ball, Body, Chain, and Force.
- ArcAI-specific prototype metrics: kinetic-chain score, hand-shot risk, and GRF-release coupling proxy.
- Local/API server: `GET /api/health`, `GET /api/evidence`, `POST /api/analyze`, `POST /api/transcode`, `POST /api/checkout`.
- OpenAPI contract at `api/openapi.json`.
- Billing UI and checkout stub. Live payments require Stripe keys and product price IDs.

## Evidence Sources

Evidence is stored in `data/evidence.json`. The scope is public information only, checked on 2026-06-10:

- HomeCourt: https://www.homecourt.ai/
- Noah Basketball: https://www.noahbasketball.com/
- ShotTracker: https://shottracker.com/
- MediaPipe Pose Landmarker: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- Barzykina et al., 2025: https://arxiv.org/abs/2506.13779
- Zhu et al., 2026: https://arxiv.org/abs/2602.03177
- Stripe Checkout: https://docs.stripe.com/checkout/quickstart

## Production Work Remaining

Real production analysis requires:

1. Validated pose / ball / rim / court detectors.
2. Camera calibration and scale estimation.
3. Event detection for set point, release, apex, entry, landing, and make/miss.
4. GRF source integration or peer-reviewed estimator validation.
5. Data privacy, consent, retention, and regional compliance review.
6. Stripe product configuration and server-side checkout session creation.

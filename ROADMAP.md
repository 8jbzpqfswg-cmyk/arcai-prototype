# ArcAI Improvement Notes

## 2026-06-12 follow-up items

- Analyzing animation: add a clearer trailing time lag so the dots feel more like a shot arc, not simultaneous pulsing.
- Landmark video: draw vGRF proxy from the fixed floor contact point, not from the body center.
- Landmark video: reduce or hide vGRF proxy after the jump/flight phase so it does not look like force is active in the air.
- Ball assist: explain whether the user should tap before release, at release, or after release.
- Ball assist: avoid the native video control bar blocking taps near the bottom of the original video.
- Ball detection: move from the current lightweight motion tracker to a real ball detector or a guided frame-by-frame tracker.
- Metrics: review all analysis values and decide which should be reference ranges, which should be personal baselines, and which should stay pending until detection quality is high.

## Product principle

ArcAI should remain observation-first. It should visualize measurable motion and comparison data for discussion with a coach or clinician. It should not prescribe corrections or diagnose technique from a single uploaded video.

# ArcAI Improvement Notes

## 2026-06-12 follow-up items

- Done 2026-06-13: Analyzing animation now uses a slower delayed pulse along the shot arc.
- Done 2026-06-13: Landmark video draws vGRF proxy from a fixed floor/court coordinate instead of the zoomed body frame.
- Done 2026-06-13: vGRF proxy visibility now fades when the athlete is estimated to be airborne or not actively extending.
- Done 2026-06-13: Ball assist explains the recommended tap timing: clearly visible ball, ideally just after release and before apex.
- Done 2026-06-13: Rim/ball picking temporarily hides native video controls so the bottom bar does not block taps.
- Ball detection: move from the current lightweight motion tracker to a real ball detector or a guided frame-by-frame tracker.
- Metrics: review all analysis values and decide which should be reference ranges, which should be personal baselines, and which should stay pending until detection quality is high.

## Product principle

ArcAI should remain observation-first. It should visualize measurable motion and comparison data for discussion with a coach or clinician. It should not prescribe corrections or diagnose technique from a single uploaded video.

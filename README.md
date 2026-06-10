# swing-cv-web

On-device golf swing analyzer. Pick or film swings in the browser → MediaPipe
pose runs **entirely client-side** (your video never leaves the device) →
slow-mo player with skeleton + hand-tracer overlay, auto-detected key positions,
tempo, hand speed, kinematic sequence and swing-to-swing consistency.

**Live:** https://swing-cv-web.vercel.app

It's the web sibling of the Python `swing-cv` tool. Honest by design: it
measures what 2D pose is actually validated for, flags only mishit-causing
faults, and — per strokes-gained research — tells you when your swing isn't
your real scoring leak.

## Features (v2)
- **Slow-mo player** — skeleton + hand-path tracer drawn live over your video;
  0.25×/0.5×/1×, frame stepping, jump to address/top/impact/finish
- **Hand speed** — speed curve with peak & impact markers, scaled to mph from
  your height (clearly labeled an estimate; hands ≠ clubhead)
- **Kinematic sequence (experimental)** — pelvis/torso/hands firing order +
  timing before impact, X-factor top vs downswing stretch, from single-camera
  depth estimates with honesty caveats
- **Long videos** — a motion-energy scan finds each swing in a range session
  (up to 3 min), then each swing is analyzed separately; multiple files work too
- **Consistency panel** — mean ± SD across swings, most-variable metric
  highlighted; repeatability of your own motion is the skill marker the
  research actually supports (r = 0.801, same 2D method)

## Stack
- **Next.js 15** (App Router, TypeScript) — static, deploys to Vercel
- **@mediapipe/tasks-vision** Pose Landmarker (WASM + model from CDN, GPU delegate)
- Analysis: `lib/analysis.ts` · drawing: `lib/draw.ts` · pose/scan: `lib/pose.ts`
- UI: `components/Player.tsx`, `SpeedChart.tsx`, `SequenceCard.tsx`, `ConsistencyCard.tsx`

## Dev
```bash
npm install
npm run dev     # http://localhost:3000  (#demo for a synthetic preview)
```

## Deploy
```bash
vercel deploy --prod --scope <team>
```

## Limits (stated in-product too)
2D single camera: reliable for tempo / head / key positions / your own
repeatability; rotation & speed numbers are honest estimates; it **cannot see
club face or path** — a slice diagnosis needs club tracking or a launch monitor.

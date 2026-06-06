# swing-cv-web

On-device golf swing analyzer. Pick or film a swing in the browser → MediaPipe
pose runs **entirely client-side** (your video never leaves the device) →
auto-detected key positions (address / top / impact / finish) + tempo, head
stability, hip sway and spine tilt + an evidence-based recommendation.

**Live:** https://swing-cv-web.vercel.app

It's the web sibling of the Python `swing-cv` tool; the analysis logic in
`lib/analysis.ts` is a faithful port of `analyze.py`. Honest by design: it
measures gross body motion (reliable for tempo / head / key positions), flags
only the mishit-causing faults, and — per strokes-gained research — tells you
when your swing isn't your real scoring leak.

## Stack
- **Next.js** (App Router, TypeScript) — static export, deploys to Vercel
- **@mediapipe/tasks-vision** Pose Landmarker (WASM + model from CDN, GPU delegate)
- Analysis: `lib/analysis.ts` · drawing: `lib/draw.ts` · pose/extraction: `lib/pose.ts`

## Dev
```bash
npm install
npm run dev     # http://localhost:3000
```

## Deploy
```bash
vercel deploy --prod --scope <team>
```

## Limits (same as the Python tool)
2D single camera: reliable for tempo / head / key positions; spine and rotation
numbers are approximate (need a clean down-the-line view); it **cannot diagnose a
slice** — that's clubface-vs-path, which needs club tracking or a launch monitor.

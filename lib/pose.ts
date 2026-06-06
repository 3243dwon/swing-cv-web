// MediaPipe Pose Landmarker (web/WASM) loader + frame extraction.
// Everything runs client-side in the browser; the video never leaves the device.
import type { Frame, LM } from "./analysis";

// Loaded dynamically so it never runs during SSR.
type Landmarker = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => { landmarks: LM[][] };
  close: () => void;
};

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

export async function createLandmarker(): Promise<Landmarker> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
  const lm = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  return lm as unknown as Landmarker;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(t, Math.max(0, video.duration - 0.001));
  });
}

export type Extraction = { frames: Frame[]; times: number[]; fps: number; width: number; height: number };

// Seek through the clip at ~sampleFps and run the landmarker on each frame.
export async function extractLandmarks(
  video: HTMLVideoElement,
  landmarker: Landmarker,
  onProgress: (pct: number) => void,
  sampleFps = 30,
  maxFrames = 160
): Promise<Extraction> {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!duration || !isFinite(duration)) throw new Error("Couldn't read the video. Try a different clip (or set iPhone camera to 'Most Compatible').");

  let nSamples = Math.round(duration * sampleFps);
  nSamples = Math.max(8, Math.min(maxFrames, nSamples));
  const step = duration / nSamples;
  const fps = 1 / step;

  const frames: Frame[] = [];
  const times: number[] = [];
  let lastTs = -1;

  for (let i = 0; i < nSamples; i++) {
    const t = i * step;
    await seekTo(video, t);
    let ts = Math.round(t * 1000);
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    let res: { landmarks: LM[][] };
    try {
      res = landmarker.detectForVideo(video, ts);
    } catch {
      res = { landmarks: [] };
    }
    frames.push(res.landmarks && res.landmarks.length ? res.landmarks[0] : null);
    times.push(t);
    onProgress(Math.round(((i + 1) / nSamples) * 100));
  }

  return { frames, times, fps, width, height };
}

// Capture a single frame (by time) into a canvas for display.
export async function captureFrame(
  video: HTMLVideoElement,
  t: number,
  canvas: HTMLCanvasElement
): Promise<void> {
  await seekTo(video, t);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

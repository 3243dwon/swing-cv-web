"use client";

// AI coaching card. Off by default — the player opts in once (persisted), and even
// then nothing runs until they tap "Get AI coaching". What leaves the device is only
// the measured-numbers payload (buildCoachPayload) — never the video, image, or
// landmarks — so Tracky's "nothing uploads" promise holds until the user chooses this.
import { useEffect, useState } from "react";
import type { Analysis, Fault } from "@/lib/analysis";
import type { MetricRead } from "@/lib/grade";
import type { Club } from "@/lib/pace";
import type { Hand } from "@/lib/club";
import type { Outcome } from "@/lib/outcome";
import { buildCoachPayload } from "@/lib/coach";

const OPT_IN_KEY = "tracky-ai-coach";

type Props = {
  analysis: Analysis;
  mread: MetricRead;
  faults: Fault[];
  club: Club | null;
  hand: Hand;
  outcome: Outcome | null;
};

export default function CoachCard({ analysis, mread, faults, club, hand, outcome }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Read the persisted opt-in after mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(OPT_IN_KEY) === "1");
    } catch {
      /* localStorage unavailable — stay opted out */
    }
  }, []);

  function optIn() {
    try {
      localStorage.setItem(OPT_IN_KEY, "1");
    } catch {
      /* ignore */
    }
    setEnabled(true);
  }

  async function getCoaching() {
    setLoading(true);
    setError(null);
    setText("");
    try {
      const payload = buildCoachPayload(analysis, mread, faults, club, hand, outcome);
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        setError(
          res.status === 503
            ? "AI coaching isn't set up on this server yet. · 服务器尚未启用 AI 教练。"
            : "Couldn't reach AI coaching right now. · 暂时无法连接 AI 教练。",
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch {
      setError("Couldn't reach AI coaching right now. · 暂时无法连接 AI 教练。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>
        AI coaching · AI 教练 · Fable 5 · experimental
      </div>

      {!enabled ? (
        <>
          <p className="note" style={{ marginTop: 0 }}>
            Optional. Turns the numbers on this page into one coaching read, written by Claude
            Fable 5. Only the <b>measured numbers</b> are sent — never your video, image, or
            body-tracking. It still can&apos;t see your clubface or ball; it only relates what you
            reported to what we measured.
            <br />
            可选。把这一页的数据交给 Claude Fable 5，生成一段连贯的教练解读。只发送
            <b>测量出的数字</b>——不会发送你的视频、画面或身体追踪。它同样看不到你的杆面或球，
            只会把你的反馈和我们的测量关联起来。
          </p>
          <button type="button" className="coachbtn" onClick={optIn}>
            Enable AI coaching · 启用 AI 教练
          </button>
        </>
      ) : (
        <>
          {!text && !loading && !error && (
            <p className="note" style={{ marginTop: 0 }}>
              Written from your measured numbers only — never the video. · 仅根据测量数字生成，不读取视频。
            </p>
          )}
          {text && (
            <p className="note" style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>
              {text}
            </p>
          )}
          {error && (
            <p className="note" style={{ marginTop: 0, color: "#ffb056" }}>
              {error}
            </p>
          )}
          <button type="button" className="coachbtn" onClick={getCoaching} disabled={loading}>
            {loading
              ? "Coaching… · 生成中…"
              : text
                ? "Regenerate · 重新生成"
                : "Get AI coaching · 获取 AI 教练建议"}
          </button>
        </>
      )}
    </div>
  );
}

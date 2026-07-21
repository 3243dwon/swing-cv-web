// Shot outcome — the one thing the camera can't see but the golfer always knows:
// what the ball actually did. The user taps it (optional), and we RELATE it to what
// we MEASURED — we never let it become a clubface claim. This is how the app
// responsibly separates a slice from a pull (the line it has always refused to
// guess): both come from the same out-to-in path we already trace, and only the
// user's report tells the two apart. The rules are deliberately conservative:
//   • never promote or invent a fault that didn't fire on its own thresholds,
//   • when the report CONTRADICTS what we measured, hedge — don't reconcile,
//   • when the report names something the camera structurally CANNOT see (launch
//     height), relate it only where a measured cause exists — and say so either way,
//   • on a low-confidence trace, log the report but relate it to nothing.
import type { Fault } from "./analysis";
import type { Hand } from "./club";

export type Outcome = "flush" | "slice" | "hook" | "pull" | "push" | "thin" | "fat" | "low";

const PATH_FOCUS = "slice / swing path";
const STRIKE_FOCUS = "strike consistency";

// Which way each miss points, in the golfer's own frame (mirrors with handedness).
// slice & push end up on the weak side; hook & pull on the strong side (for a
// right-hander: weak = right, strong = left).
function sides(hand: Hand) {
  const weakEn = hand === "L" ? "left" : "right";
  const strongEn = hand === "L" ? "right" : "left";
  const weakZh = hand === "L" ? "左" : "右";
  const strongZh = hand === "L" ? "右" : "左";
  return { weakEn, strongEn, weakZh, strongZh };
}

// Chips the user taps — concrete and handedness-correct so the label isn't ambiguous.
export function outcomeChips(hand: Hand): { key: Outcome; label: string }[] {
  const { weakEn, strongEn, weakZh, strongZh } = sides(hand);
  return [
    { key: "flush", label: "Flush · 扎实/直" },
    { key: "slice", label: `Slice · 弯向${weakZh} (${weakEn})` },
    { key: "hook", label: `Hook · 弯向${strongZh} (${strongEn})` },
    { key: "pull", label: `Pull · 直接偏${strongZh} (${strongEn})` },
    { key: "push", label: `Push · 直接偏${weakZh} (${weakEn})` },
    { key: "low", label: "Low flight · 弹道低/冲不起来" },
    { key: "thin", label: "Thin/top · 打薄/剃头" },
    { key: "fat", label: "Fat/chunk · 打肥/剁地" },
  ];
}

const NAME: Record<Outcome, { en: string; zh: string }> = {
  flush: { en: "flush", zh: "扎实球" },
  slice: { en: "slice", zh: "slice（弯离身体侧）" },
  hook: { en: "hook", zh: "hook（弯向身体侧）" },
  pull: { en: "pull", zh: "拉球（直接偏向身体侧的反向）" },
  push: { en: "push", zh: "推球" },
  thin: { en: "thin/topped strike", zh: "打薄/剃头" },
  fat: { en: "fat/chunked strike", zh: "打肥/剁地" },
  low: { en: "low ball flight", zh: "低弹道" },
};

const sliceClause =
  "You told us this one sliced. An out-to-in path like the one we traced is one half of a slice — the other half is a clubface open to that path, which a single camera can't see. So this is your report lining up with the path we measured, not us reading your face. · 你告诉我们这一杆 slice 了。我们追踪到的这种外到内路径是 slice 的一半原因——另一半是杆面相对路径打开，单摄像头看不到。所以这是你的反馈和我们量到的路径吻合，不是我们读到了你的杆面。";

const pullClause =
  "You told us this one pulled — started off-line but flew fairly straight, no real curve. That's the SAME out-to-in path, just with the face roughly square to it (a pull) instead of open (a slice). We can't see the face, so your report is exactly what tells the two apart here — and it points at the path as the thing to groove. · 你告诉我们这一杆是拉球——起飞偏了但基本直飞、几乎不弯。这和 slice 是同一条外到内路径，只是杆面相对路径基本正（拉球）而不是打开（slice）。我们看不到杆面，所以正是你的反馈把两者区分开了——而且它指向路径，才是要练的地方。";

function strikeClause(o: "thin" | "fat"): string {
  const nameEn = o === "fat" ? "fat" : "thin";
  const nameZh = o === "fat" ? "打肥" : "打薄";
  return `You told us this one was ${nameEn} — that fits the moving low-point we flagged above, which is exactly the fat/thin pattern. · 你告诉我们这一杆${nameZh}了——这和上面标记的低点移动一致，正是打肥/打薄的成因。`;
}

// Launch height is the report the camera is FURTHEST from: it's set by dynamic loft,
// where the ball meets the face, and attack angle — a pose trace sees none of the three.
// So `low` never gets the confident voice thin/fat get. It relates ONLY to a measured
// moving low point (a thin strike really does fly low and run), and even then it says
// "consistent", not "this is why". Deliberately NOT matched to the posture faults: early
// extension would fit, but its focus is shared with reverse pivot, which causes the
// OPPOSITE miss (weak and high) — matching on that focus would relate half of them
// backwards, and a wrong relation is worse here than no relation.
const lowFlightClause =
  "You told us this one came out low. Launch height comes from dynamic loft, where the ball meets the face, and attack angle — a single camera sees none of them, so we're not claiming to have measured it. What we can say: the moving low point flagged above thins the strike, and a thin strike does fly low and run. Treat that as consistent, not conclusive — steady the low point and watch whether the flight comes up. · 你告诉我们这一杆弹道低。起飞高度取决于动态 loft、击球点在杆面上的位置和攻角——单摄像头一个都看不到，所以我们不会声称量到了它。我们能说的是：上面标记的低点移动会让触球变薄，而打薄确实又低又滚。请当作「吻合」而非「定论」——先把低点稳住，再看弹道会不会起来。";

const noLowFlightNote =
  "You reported a low flight, and we won't pretend we measured it — launch height comes from dynamic loft, strike location on the face and attack angle, none of which a single camera can see. We also didn't flag a moving low point on this swing, which is the one cause we could honestly have related it to. Two things worth knowing anyway: a low iron flight is often not a fault at all (modern iron lofts are far stronger than they used to be, and a penetrating flight wins in wind), and your own divot is free data — if it starts behind the ball rather than in front of it, you're hitting up on it. · 你反馈这一杆弹道低，我们不会假装量到了——起飞高度取决于动态 loft、击球点在杆面上的位置和攻角，单摄像头一个都看不到。这一杆我们也没有标记出低点移动，而那是唯一能诚实地和它关联的原因。但有两件事值得知道：铁杆弹道低往往根本不是毛病（现代铁杆的 loft 比过去强得多，低平弹道在风里反而是优势），另外你自己的草皮痕迹是免费数据——如果它从球的后方而不是前方开始，说明你在往上捞。";

function noPathNote(o: Outcome): string {
  const n = NAME[o];
  return `You reported a ${n.en}, but we didn't measure an over-the-top (out-to-in) path on this swing. Start direction and curve also come from the clubface, which a single camera can't see — a clean down-the-line clip would help us read the path. · 你反馈这一杆是${n.zh}，但这一杆我们没量到过顶（外到内）的路径。起飞方向和弯曲也来自杆面，单摄像头看不到——拍一段清晰的后方视角（DTL）能帮我们看清路径。`;
}

function disagreeNote(o: "hook" | "push"): string {
  const n = NAME[o];
  return `Worth a look: you reported a ${n.en}, but the path we traced looks over-the-top (out-to-in) — which usually produces a slice or pull, not a ${n.en}. Either the face is doing something we can't see, or this track wasn't clean; a down-the-line clip would settle it. · 值得留意：你反馈是${n.zh}，但我们追踪到的路径偏过顶（外到内）——这通常产生 slice 或拉球，而不是${n.zh}。可能是杆面在做我们看不到的事，或这段追踪不够干净；拍一段后方视角能确认。`;
}

function noStrikeNote(o: "thin" | "fat"): string {
  const n = NAME[o];
  return `You reported a ${n.en}, but we didn't measure excess head or hip movement on this swing — strike also rides on low-point control a single face-on clip can miss. · 你反馈这一杆${n.zh}，但这一杆我们没量到头或髋移动过大——触球还取决于单一正面视角可能看不到的低点控制。`;
}

function lowConfNote(o: Outcome): string {
  const n = NAME[o];
  return `We logged that you reported a ${n.en}, but this track wasn't clean enough to relate it to what we measured — re-film for a clean read. · 我们记下了你反馈的${n.zh}，但这段追踪不够干净，无法和测量结果关联——重拍以获得干净读数。`;
}

export type OutcomeResult = { faults: Fault[]; note: string | null };

// Move `target` to the front of the list and attach the reported-vs-measured clause.
function promote(faults: Fault[], target: Fault, reported: string): Fault[] {
  const augmented: Fault = { ...target, reported };
  return [augmented, ...faults.filter((f) => f !== target)];
}

// Relate a user-reported outcome to the faults we already fired. NEVER lowers a
// gate, NEVER promotes a fault that didn't independently fire, and on a shaky
// trace (lowConf) relates the report to nothing.
export function applyOutcome(
  faults: Fault[],
  outcome: Outcome | null,
  hand: Hand,
  lowConf: boolean
): OutcomeResult {
  if (!outcome) return { faults, note: null };
  if (lowConf) return { faults, note: lowConfNote(outcome) };
  if (outcome === "flush") return { faults, note: null };

  const pathFault = faults.find((f) => f.focus === PATH_FOCUS) ?? null;
  const strikeFault = faults.find((f) => f.focus === STRIKE_FOCUS) ?? null;

  // Curve / start-direction reports relate to the swing-path verdict.
  if (outcome === "slice" || outcome === "pull") {
    if (pathFault) return { faults: promote(faults, pathFault, outcome === "slice" ? sliceClause : pullClause), note: null };
    return { faults, note: noPathNote(outcome) };
  }
  // A hook/push is in-to-out — it CONTRADICTS a measured over-the-top path, so we
  // hedge rather than reconcile; we never promote here.
  if (outcome === "hook" || outcome === "push") {
    return { faults, note: pathFault ? disagreeNote(outcome) : noPathNote(outcome) };
  }
  // Strike reports relate to the head/hip-movement verdict.
  if (outcome === "thin" || outcome === "fat") {
    if (strikeFault) return { faults: promote(faults, strikeFault, strikeClause(outcome)), note: null };
    return { faults, note: noStrikeNote(outcome) };
  }
  // Flight height rides on the same low-point verdict, but hedged a tier further down —
  // see lowFlightClause. No measured low-point movement means no relation at all.
  if (outcome === "low") {
    if (strikeFault) return { faults: promote(faults, strikeFault, lowFlightClause), note: null };
    return { faults, note: noLowFlightNote };
  }
  return { faults, note: null };
}

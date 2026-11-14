import { useRef, useState } from "react";
import { useIsPhone } from "../lib/install";

/**
 * Hand-construction of a box from vanishing points, the way you'd do it on paper.
 * Drag the horizon, the vanishing points and the front edge.
 */
type P = [number, number];
const W = 820, H = 460;

function intersect(a1: P, a2: P, b1: P, b2: P): P | null {
  const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
  return [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
}
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function VPConstructor({ mode, showGrid = false }: { mode: "one" | "two"; showGrid?: boolean }) {
  const [horizon, setHorizon] = useState(170);
  const [vp1x, setVp1x] = useState(mode === "one" ? 410 : 80);
  const [vp2x, setVp2x] = useState(740);
  const [front, setFront] = useState<{ x: number; top: number; bottom: number }>({ x: 400, top: 230, bottom: 380 });
  const [depthL, setDepthL] = useState(0.35);
  const [depthR, setDepthR] = useState(0.3);
  const [frontW, setFrontW] = useState(180);
  const [drag, setDrag] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // On a phone the 820px-wide drawing is shown at about half size, so scale up marks and hit areas.
  const k = useIsPhone() ? 2 : 1;

  const pos = (e: React.PointerEvent): P => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = pos(e);
    if (drag === "horizon") setHorizon(Math.max(-200, Math.min(H + 200, y)));
    else if (drag === "vp1") { setVp1x(x); setHorizon(y); }
    else if (drag === "vp2") { setVp2x(x); setHorizon(y); }
    else if (drag === "top") setFront((f) => ({ ...f, top: Math.min(y, f.bottom - 20) }));
    else if (drag === "bottom") setFront((f) => ({ ...f, bottom: Math.max(y, f.top + 20) }));
    else if (drag === "front") setFront((f) => {
      const h = f.bottom - f.top;
      return { x, top: y - h / 2, bottom: y + h / 2 };
    });
  };
  const handle = (id: string, x: number, y: number, color: string, label?: string) => (
    <g key={id} style={{ cursor: "grab" }} onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); setDrag(id); }}>
      <circle cx={x} cy={y} r={16 * k} fill="transparent" />
      <circle cx={x} cy={y} r={7 * k} fill={color} stroke="#121210" strokeWidth={2 * k} />
      {label && <text x={x + 11 * k} y={y - 10 * k} fill={color} fontSize={12 * k} fontWeight={600} fontFamily="Inter">{label}</text>}
    </g>
  );

  const VP1: P = [vp1x, horizon], VP2: P = [vp2x, horizon];
  const T: P = [front.x, front.top], B: P = [front.x, front.bottom];
  const els: React.ReactNode[] = [];
  const ln = (k: string, a: P, b: P, color: string, o: Partial<React.SVGProps<SVGLineElement>> = {}) => els.push(<line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={2.2} strokeLinecap="round" {...o} vectorEffect="non-scaling-stroke" />);
  const guide = (k: string, a: P, b: P, color: string) => ln(k, a, b, color, { strokeOpacity: 0.3, strokeWidth: 1 });

  if (showGrid) {
    for (let i = -12; i <= 24; i++) {
      const gx = i * 70 - 400;
      guide(`gg${i}`, VP1, [VP1[0] + (gx - VP1[0]) * 3, H + (H - horizon) * 2], "#8fc1d4");
    }
  }

  if (mode === "one") {
    // front face is a true rectangle; depth recedes to the single VP
    const TL: P = [front.x - frontW / 2, front.top], TR: P = [front.x + frontW / 2, front.top];
    const BL: P = [front.x - frontW / 2, front.bottom], BR: P = [front.x + frontW / 2, front.bottom];
    [TL, TR, BL, BR].forEach((p, i) => guide(`g${i}`, p, VP1, "#f0a868"));
    const back = [TL, TR, BR, BL].map((p) => lerp(p, VP1, depthL));
    ln("ft", TL, TR, "#ece6da"); ln("fb", BL, BR, "#ece6da"); ln("fl", TL, BL, "#ece6da"); ln("fr", TR, BR, "#ece6da");
    [TL, TR, BR, BL].forEach((p, i) => ln(`d${i}`, p, back[i], "#f0a868"));
    ln("b1", back[0], back[1], "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4 });
    ln("b2", back[1], back[2], "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4 });
    ln("b3", back[2], back[3], "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4 });
    ln("b4", back[3], back[0], "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4 });
  } else {
    // two-point: front vertical edge, side corners along lines to each VP, back corner by intersection
    [T, B].forEach((p, i) => { guide(`g1${i}`, p, VP1, "#f0a868"); guide(`g2${i}`, p, VP2, "#8fc1d4"); });
    const LT = lerp(T, VP1, depthL), LB = lerp(B, VP1, depthL);
    const RT = lerp(T, VP2, depthR), RB = lerp(B, VP2, depthR);
    [LT, LB].forEach((p, i) => guide(`g3${i}`, p, VP2, "#8fc1d4"));
    [RT, RB].forEach((p, i) => guide(`g4${i}`, p, VP1, "#f0a868"));
    const BT = intersect(LT, VP2, RT, VP1), BBk = intersect(LB, VP2, RB, VP1);
    ln("front", T, B, "#ece6da");
    ln("lt", T, LT, "#f0a868"); ln("lb", B, LB, "#f0a868");
    ln("rt", T, RT, "#8fc1d4"); ln("rb", B, RB, "#8fc1d4");
    ln("lv", LT, LB, "#ece6da"); ln("rv", RT, RB, "#ece6da");
    if (BT && BBk) {
      const below = horizon < front.top; // looking down on the top face when the box is below eye level
      ln("btl", LT, BT, "#8fc1d4", below ? {} : { strokeDasharray: "5 5", strokeWidth: 1.4, stroke: "#8a847a" });
      ln("btr", RT, BT, "#f0a868", below ? {} : { strokeDasharray: "5 5", strokeWidth: 1.4, stroke: "#8a847a" });
      const above = horizon > front.bottom;
      ln("bbl", LB, BBk, "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4, ...(above ? { stroke: "#8fc1d4", strokeDasharray: undefined, strokeWidth: 2.2 } : {}) });
      ln("bbr", RB, BBk, "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4, ...(above ? { stroke: "#f0a868", strokeDasharray: undefined, strokeWidth: 2.2 } : {}) });
      ln("bv", BT, BBk, "#8a847a", { strokeDasharray: "5 5", strokeWidth: 1.4 });
    }
  }

  const eyeNote =
    horizon < front.top ? "The box is below eye level: you see its top." : horizon > front.bottom ? "The box is above eye level: you see its underside." : "The horizon cuts through the box: you see neither top nor bottom.";
  return (
    <div className="interactive">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        style={{ touchAction: "none", cursor: drag ? "grabbing" : "default" }}
      >
        <line x1={0} y1={horizon} x2={W} y2={horizon} stroke="#d98b4a" strokeWidth={1.5} strokeDasharray="10 6" />
        <line x1={0} y1={horizon} x2={W} y2={horizon} stroke="transparent" strokeWidth={16 * k} style={{ cursor: "ns-resize" }} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag("horizon"); }} />
        <text x={10} y={horizon - 8} fill="#d98b4a" fontSize={12 * k} fontFamily="Inter">Horizon (drag)</text>
        {els}
        {handle("vp1", vp1x, horizon, "#f0a868", mode === "one" ? "VP" : "VP1")}
        {mode === "two" && handle("vp2", vp2x, horizon, "#8fc1d4", "VP2")}
        {handle("front", front.x, (front.top + front.bottom) / 2, "#ece6da")}
        {handle("top", front.x, front.top, "#ece6da")}
        {handle("bottom", front.x, front.bottom, "#ece6da")}
        <text x={W - 10} y={H - 12} textAnchor="end" fill="#b3ab9e" fontSize={12 * k} fontFamily="Inter">{k > 1 ? eyeNote.split(":")[0] : eyeNote}</text>
      </svg>
      <div className="controls">
        {mode === "one" && <label className="field">Front width <input type="range" min={40} max={400} value={frontW} onChange={(e) => setFrontW(+e.target.value)} /></label>}
        <label className="field">{mode === "one" ? "Depth" : "Left depth"} <input type="range" min={0.05} max={0.85} step={0.01} value={depthL} onChange={(e) => setDepthL(+e.target.value)} /></label>
        {mode === "two" && <label className="field">Right depth <input type="range" min={0.05} max={0.85} step={0.01} value={depthR} onChange={(e) => setDepthR(+e.target.value)} /></label>}
        <div className="small faint" style={{ alignSelf: "center" }}>Drag the dots: vanishing points, horizon and the box's front edge.</div>
      </div>
    </div>
  );
}

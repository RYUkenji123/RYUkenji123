import type { Analysis, Pt } from "../api";
import type { PerspectiveEstimate } from "../lib/vision";
import { describeDirection } from "../lib/format";

export type LayerId =
  | "silhouette" | "primary_shapes" | "secondary_shapes" | "negative_space" | "edges"
  | "forms" | "form_axes"
  | "light" | "tone_regions" | "tone_map"
  | "perspective" | "persp_grid" | "detected_lines" | "detected_vps"
  | "subject_box" | "measure_grid" | "landmarks" | "alignment" | "symmetry" | "measured_box";

export const LAYER_META: Record<LayerId, { label: string; color: string; source: "ai" | "computed" }> = {
  silhouette: { label: "Silhouette", color: "#f0a868", source: "ai" },
  primary_shapes: { label: "Primary shapes", color: "#e9e3d8", source: "ai" },
  secondary_shapes: { label: "Secondary shapes", color: "#8fc1d4", source: "ai" },
  negative_space: { label: "Negative space", color: "#b58ad9", source: "ai" },
  edges: { label: "Edge map", color: "#f0a868", source: "computed" },
  forms: { label: "3D forms", color: "#7fd1b0", source: "ai" },
  form_axes: { label: "Form axes & cross-contours", color: "#f0a868", source: "ai" },
  light: { label: "Light direction", color: "#ffd27a", source: "ai" },
  tone_regions: { label: "Light & shadow regions", color: "#6f9bd8", source: "ai" },
  tone_map: { label: "5-band tone map", color: "#a3b37a", source: "computed" },
  perspective: { label: "Horizon, VPs & converging lines", color: "#f0a868", source: "ai" },
  persp_grid: { label: "Perspective grid", color: "#8fc1d4", source: "computed" },
  detected_lines: { label: "Detected straight edges", color: "#7fd1b0", source: "computed" },
  detected_vps: { label: "Detected vanishing points", color: "#7fd1b0", source: "computed" },
  subject_box: { label: "Subject box & ratio", color: "#f0a868", source: "ai" },
  measure_grid: { label: "Measure grid (½, ¼)", color: "#8a847a", source: "computed" },
  landmarks: { label: "Landmarks", color: "#ffd27a", source: "ai" },
  alignment: { label: "Alignment guides", color: "#8fc1d4", source: "ai" },
  symmetry: { label: "Symmetry axis", color: "#b58ad9", source: "ai" },
  measured_box: { label: "Measured subject box", color: "#7fd1b0", source: "computed" },
};

export interface Selection {
  title: string;
  subtitle?: string;
  body: string[];
}

const TONE_COLORS: Record<string, string> = {
  highlight: "#fff3c4",
  light: "#f3c97a",
  halftone: "#a3b37a",
  core_shadow: "#4f5fa8",
  reflected_light: "#78b7c9",
  cast_shadow: "#2c2f6b",
  occlusion_shadow: "#140f2a",
};
const VP_COLORS = ["#f0a868", "#8fc1d4", "#b58ad9"];

interface Props {
  W: number;
  H: number;
  analysis: Analysis | null;
  computed: { persp: PerspectiveEstimate; box: { x: number; y: number; w: number; h: number } | null } | null;
  layers: Set<LayerId>;
  gridSource: "ai" | "computed";
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

export function Overlays({ W, H, analysis: a, computed, layers, gridSource, onSelect }: Props) {
  const S = Math.max(W, H);
  const fs = S * 0.017;
  const px = (p: Pt) => `${p.x * W},${p.y * H}`;
  const poly = (pts: Pt[]) => pts.map(px).join(" ");
  const ns = { vectorEffect: "non-scaling-stroke" as const };
  const label = (x: number, y: number, text: string, color = "#ece6da", anchor: "start" | "middle" | "end" = "start") => (
    <text x={x} y={y} fill={color} fontSize={fs} fontFamily="Inter, sans-serif" fontWeight={600} textAnchor={anchor} paintOrder="stroke" stroke="#121210" strokeWidth={fs * 0.28} style={{ pointerEvents: "none" }}>
      {text}
    </text>
  );
  const click = (sel: Selection) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(sel);
  };
  const out: React.ReactNode[] = [];

  // ---------------------------------------------------------------- shapes
  const drawShape = (s: Analysis["shapes"][number], i: number, color: string, dash?: string) => {
    const cx = s.center.x * W, cy = s.center.y * H, w = s.width * W, h = s.height * H;
    const common = { fill: color, fillOpacity: 0.08, stroke: color, strokeWidth: s.role === "primary" ? 2.5 : 1.6, strokeDasharray: dash, ...ns, style: { cursor: "pointer" } as const,
      onClick: click({ title: s.label, subtitle: `${s.kind} · ${s.role} shape`, body: [s.explanation] }) };
    let el;
    if (s.kind === "circle" || s.kind === "ellipse") el = <ellipse cx={cx} cy={cy} rx={w / 2} ry={(s.kind === "circle" ? w : h) / 2} transform={`rotate(${s.rotation_deg} ${cx} ${cy})`} {...common} />;
    else if (s.kind === "rectangle" || s.points.length < 3) el = <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} transform={`rotate(${s.rotation_deg} ${cx} ${cy})`} {...common} />;
    else el = <polygon points={poly(s.points)} {...common} />;
    return <g key={`shape${i}`}>{el}{label(cx, cy, s.label, color, "middle")}</g>;
  };

  if (a && layers.has("silhouette") && a.silhouette.points.length > 2)
    out.push(
      <polygon key="sil" points={poly(a.silhouette.points)} fill="#f0a868" fillOpacity={0.12} stroke="#f0a868" strokeWidth={2.5} strokeLinejoin="round" {...ns}
        style={{ cursor: "pointer" }} onClick={click({ title: "Silhouette", body: [a.silhouette.description] })} />,
    );
  if (a && layers.has("negative_space"))
    a.negative_spaces.forEach((n, i) =>
      n.points.length > 2 &&
      out.push(
        <g key={`neg${i}`}>
          <polygon points={poly(n.points)} fill="#b58ad9" fillOpacity={0.28} stroke="#b58ad9" strokeWidth={1.5} strokeDasharray="6 4" {...ns} style={{ cursor: "pointer" }}
            onClick={click({ title: n.label, subtitle: "Negative space", body: [n.explanation] })} />
          {label(centroid(n.points).x * W, centroid(n.points).y * H, n.label, "#d7bdf0", "middle")}
        </g>,
      ),
    );
  if (a && layers.has("secondary_shapes")) a.shapes.forEach((s, i) => s.role !== "primary" && out.push(drawShape(s, i, "#8fc1d4", "5 4")));
  if (a && layers.has("primary_shapes")) a.shapes.forEach((s, i) => s.role === "primary" && out.push(drawShape(s, i, "#e9e3d8")));

  // ---------------------------------------------------------------- forms
  if (a && (layers.has("forms") || layers.has("form_axes")))
    a.forms.forEach((f, i) => out.push(<FormGlyph key={`form${i}`} f={f} W={W} H={H} showBody={layers.has("forms")} showAxes={layers.has("form_axes")} label={label}
      onClick={click({ title: f.label, subtitle: f.kind.replace("_", " "), body: [f.rotation_explanation, f.construction_tip] })} />));

  // ---------------------------------------------------------------- light
  if (a && layers.has("tone_regions"))
    a.light.regions.forEach((r, i) => {
      if (r.points.length < 3) return;
      const c = TONE_COLORS[r.type] ?? "#ccc";
      const ct = centroid(r.points);
      out.push(
        <g key={`tone${i}`}>
          <polygon points={poly(r.points)} fill={c} fillOpacity={0.45} stroke={c} strokeWidth={1.5} {...ns} style={{ cursor: "pointer" }}
            onClick={click({ title: r.label, subtitle: r.type.replace(/_/g, " "), body: [r.explanation] })} />
          {label(ct.x * W, ct.y * H, r.type.replace(/_/g, " "), "#ece6da", "middle")}
        </g>,
      );
    });
  if (a && layers.has("light") && a.light.present) {
    const t = (a.light.direction_deg * Math.PI) / 180;
    const box = a.proportions.subject_box;
    const cx = (box.x + box.w / 2) * W, cy = (box.y + box.h / 2) * H;
    const r = Math.max(box.w * W, box.h * H) * 0.62;
    const sx = cx + Math.cos(t) * r, sy = cy - Math.sin(t) * r;
    const ex = cx + Math.cos(t) * r * 0.45, ey = cy - Math.sin(t) * r * 0.45;
    out.push(
      <g key="light" style={{ cursor: "pointer" }} onClick={click({ title: "Light source", subtitle: `From ${describeDirection(a.light.direction_deg)}, ${a.light.elevation}, ${a.light.quality}`, body: [a.light.description] })}>
        <defs><marker id="arrowL" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd27a" /></marker></defs>
        <circle cx={sx} cy={sy} r={S * 0.025} fill="#ffd27a" stroke="#121210" strokeWidth={2} {...ns} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
          const aa = (k * Math.PI) / 4;
          return <line key={k} x1={sx + Math.cos(aa) * S * 0.033} y1={sy + Math.sin(aa) * S * 0.033} x2={sx + Math.cos(aa) * S * 0.045} y2={sy + Math.sin(aa) * S * 0.045} stroke="#ffd27a" strokeWidth={2} {...ns} />;
        })}
        {[-0.18, 0, 0.18].map((o, k) => {
          const px2 = -Math.sin(t) * r * o, py2 = -Math.cos(t) * r * o;
          return <line key={`r${k}`} x1={sx + px2 + (ex - sx) * 0.12} y1={sy + py2 + (ey - sy) * 0.12} x2={ex + px2} y2={ey + py2} stroke="#ffd27a" strokeWidth={2} strokeDasharray="8 5" markerEnd="url(#arrowL)" {...ns} />;
        })}
        {label(sx, sy - S * 0.055, "Light", "#ffd27a", "middle")}
      </g>,
    );
  }

  // ---------------------------------------------------------------- perspective
  const vpsForGrid: { x: number; y: number }[] =
    gridSource === "ai" && a ? a.perspective.vanishing_points : computed ? computed.persp.vps.filter((v) => v.kind === "finite") : [];
  const horizonForGrid = gridSource === "ai" && a ? a.perspective.horizon_y : computed?.persp.horizonY ?? null;
  if (layers.has("persp_grid")) {
    const g: React.ReactNode[] = [];
    vpsForGrid.forEach((vp, vi) => {
      const N = 8;
      const border: Pt[] = [];
      for (let k = 0; k <= N; k++) {
        border.push({ x: k / N, y: 0 }, { x: k / N, y: 1 }, { x: 0, y: k / N }, { x: 1, y: k / N });
      }
      border.forEach((b, k) => {
        // extend the ray from the VP through the border point a bit further
        const dx = b.x - vp.x, dy = b.y - vp.y;
        g.push(<line key={`g${vi}-${k}`} x1={vp.x * W} y1={vp.y * H} x2={(vp.x + dx * 1.6) * W} y2={(vp.y + dy * 1.6) * H} stroke={VP_COLORS[vi % 3]} strokeOpacity={0.28} strokeWidth={1} {...ns} />);
      });
    });
    if (vpsForGrid.length === 1) for (let k = 1; k < 10; k++) g.push(<line key={`v${k}`} x1={(k / 10) * W} y1={0} x2={(k / 10) * W} y2={H} stroke="#8fc1d4" strokeOpacity={0.2} {...ns} />);
    if (!vpsForGrid.length) g.push(<g key="none">{label(W * 0.02, H * 0.05, "No vanishing points available for a grid", "#8fc1d4")}</g>);
    out.push(<g key="grid" style={{ pointerEvents: "none" }}>{g}</g>);
    if (horizonForGrid != null) out.push(<line key="ghz" x1={-W * 3} y1={horizonForGrid * H} x2={W * 4} y2={horizonForGrid * H} stroke="#8fc1d4" strokeOpacity={0.6} strokeWidth={1.5} {...ns} />);
  }
  if (computed && layers.has("detected_lines"))
    out.push(
      <g key="dlines" style={{ pointerEvents: "none" }}>
        {computed.persp.segments.map((s, i) => (
          <line key={i} x1={s.x1 * W} y1={s.y1 * H} x2={s.x2 * W} y2={s.y2 * H} stroke={s.vp >= 0 ? VP_COLORS[s.vp % 3] : "#7fd1b0"} strokeOpacity={s.vp >= 0 ? 0.95 : 0.5} strokeWidth={s.vp >= 0 ? 2.5 : 1.5} {...ns} />
        ))}
      </g>,
    );
  if (computed && layers.has("detected_vps")) {
    computed.persp.segments.forEach((s, i) => {
      const vp = computed.persp.vps[s.vp];
      if (!vp || vp.kind !== "finite") return;
      const mx = ((s.x1 + s.x2) / 2) * W, my = ((s.y1 + s.y2) / 2) * H;
      out.push(<line key={`dext${i}`} x1={mx} y1={my} x2={vp.x * W} y2={vp.y * H} stroke={VP_COLORS[s.vp % 3]} strokeOpacity={0.35} strokeDasharray="4 6" {...ns} />);
    });
    computed.persp.vps.forEach((v, i) => {
      if (v.kind !== "finite") return;
      out.push(
        <g key={`dvp${i}`} style={{ cursor: "pointer" }} onClick={click({ title: `Detected vanishing point ${i + 1}`, subtitle: "Computed from straight edges", body: [`${v.support} detected edges converge here. Position is a geometric best fit and can be thrown off by texture or edges from other objects.`] })}>
          <rect x={v.x * W - S * 0.012} y={v.y * H - S * 0.012} width={S * 0.024} height={S * 0.024} fill="none" stroke={VP_COLORS[i % 3]} strokeWidth={2.5} {...ns} transform={`rotate(45 ${v.x * W} ${v.y * H})`} />
          {label(v.x * W + S * 0.02, v.y * H + S * 0.035, `detected VP${i + 1}`, VP_COLORS[i % 3])}
        </g>,
      );
    });
    if (computed.persp.horizonY != null)
      out.push(<line key="dhz" x1={-W * 3} y1={computed.persp.horizonY * H} x2={W * 4} y2={computed.persp.horizonY * H} stroke="#7fd1b0" strokeDasharray="10 6" strokeWidth={1.5} {...ns} />);
  }
  if (a && layers.has("perspective")) {
    const p = a.perspective;
    p.planes.forEach((pl, i) => pl.points.length > 2 && out.push(<polygon key={`pl${i}`} points={poly(pl.points)} fill={VP_COLORS[i % 3]} fillOpacity={0.12} stroke={VP_COLORS[i % 3]} strokeOpacity={0.6} strokeDasharray="3 4" {...ns} style={{ cursor: "pointer" }} onClick={click({ title: pl.label, subtitle: "Perspective plane", body: ["Every edge lying in this plane recedes toward the same vanishing point(s)."] })} />));
    p.converging_lines.forEach((l, i) => {
      const vp = p.vanishing_points[l.vp_index];
      const c = VP_COLORS[l.vp_index % 3] ?? "#f0a868";
      out.push(<line key={`cl${i}`} x1={l.x1 * W} y1={l.y1 * H} x2={l.x2 * W} y2={l.y2 * H} stroke={c} strokeWidth={2.5} {...ns} />);
      if (vp) out.push(<line key={`cle${i}`} x1={l.x2 * W} y1={l.y2 * H} x2={vp.x * W} y2={vp.y * H} stroke={c} strokeOpacity={0.5} strokeDasharray="6 5" {...ns} />);
    });
    if (p.horizon_y != null) {
      out.push(<line key="hz" x1={-W * 3} y1={p.horizon_y * H} x2={W * 4} y2={p.horizon_y * H} stroke="#f0a868" strokeWidth={2} {...ns} />);
      out.push(<g key="hzl">{label(W * 0.01, p.horizon_y * H - fs * 0.5, "Horizon / eye level", "#f0a868")}</g>);
    }
    p.vanishing_points.forEach((v, i) =>
      out.push(
        <g key={`vp${i}`} style={{ cursor: "pointer" }} onClick={click({ title: v.label, subtitle: "Vanishing point (AI estimate)", body: [p.explanation] })}>
          <circle cx={v.x * W} cy={v.y * H} r={S * 0.012} fill={VP_COLORS[i % 3]} stroke="#121210" strokeWidth={2} {...ns} />
          {label(v.x * W + S * 0.018, v.y * H - S * 0.015, v.label, VP_COLORS[i % 3])}
        </g>,
      ),
    );
  }

  // ---------------------------------------------------------------- proportions
  const box = a?.proportions.subject_box ?? computed?.box ?? null;
  if (box && layers.has("measure_grid")) {
    const g: React.ReactNode[] = [];
    for (const f of [0.25, 0.5, 0.75]) {
      const major = f === 0.5;
      g.push(<line key={`mh${f}`} x1={box.x * W} y1={(box.y + box.h * f) * H} x2={(box.x + box.w) * W} y2={(box.y + box.h * f) * H} stroke="#b8b0a4" strokeOpacity={major ? 0.85 : 0.45} strokeDasharray={major ? undefined : "4 5"} {...ns} />);
      g.push(<line key={`mv${f}`} x1={(box.x + box.w * f) * W} y1={box.y * H} x2={(box.x + box.w * f) * W} y2={(box.y + box.h) * H} stroke="#b8b0a4" strokeOpacity={major ? 0.85 : 0.45} strokeDasharray={major ? undefined : "4 5"} {...ns} />);
    }
    out.push(<g key="mgrid" style={{ pointerEvents: "none" }}>{g}</g>);
  }
  if (a && layers.has("subject_box")) {
    const b = a.proportions.subject_box;
    const ratio = (b.h * H) / (b.w * W);
    out.push(
      <g key="sbox">
        <rect x={b.x * W} y={b.y * H} width={b.w * W} height={b.h * H} fill="none" stroke="#f0a868" strokeWidth={2} {...ns} />
        {label(b.x * W, b.y * H - fs * 0.5, `H : W = ${ratio.toFixed(2)} : 1`, "#f0a868")}
      </g>,
    );
  }
  if (computed?.box && layers.has("measured_box")) {
    const b = computed.box;
    out.push(
      <g key="mbox">
        <rect x={b.x * W} y={b.y * H} width={b.w * W} height={b.h * H} fill="none" stroke="#7fd1b0" strokeWidth={1.5} strokeDasharray="8 5" {...ns} />
        {label((b.x + b.w) * W, (b.y + b.h) * H + fs * 1.2, `measured ${((b.h * H) / (b.w * W)).toFixed(2)} : 1`, "#7fd1b0", "end")}
      </g>,
    );
  }
  if (a && layers.has("symmetry") && a.proportions.symmetry.present) {
    const l = a.proportions.symmetry.axis;
    out.push(<line key="sym" x1={l.x1 * W} y1={l.y1 * H} x2={l.x2 * W} y2={l.y2 * H} stroke="#b58ad9" strokeWidth={2} strokeDasharray="14 5 3 5" {...ns} style={{ cursor: "pointer" }} onClick={click({ title: "Symmetry axis", body: [a.proportions.symmetry.explanation] })} />);
  }
  if (a && layers.has("alignment"))
    a.proportions.alignment_lines.forEach((l, i) => {
      // extend alignment guides across the frame
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
      out.push(
        <g key={`al${i}`} style={{ cursor: "pointer" }} onClick={click({ title: l.label, subtitle: "Alignment guide", body: ["Use this line to check that the features it connects line up in your drawing."] })}>
          <line x1={(l.x1 - dx * 0.25) * W} y1={(l.y1 - dy * 0.25) * H} x2={(l.x2 + dx * 0.25) * W} y2={(l.y2 + dy * 0.25) * H} stroke="#8fc1d4" strokeWidth={1.5} strokeDasharray="10 4" {...ns} />
          <line x1={l.x1 * W} y1={l.y1 * H} x2={l.x2 * W} y2={l.y2 * H} stroke="transparent" strokeWidth={14} {...ns} />
          {label(l.x2 * W + fs * 0.3, l.y2 * H, l.label, "#8fc1d4")}
        </g>,
      );
    });
  if (a && layers.has("landmarks"))
    a.proportions.landmarks.forEach((m, i) =>
      out.push(
        <g key={`lm${i}`}>
          <circle cx={m.x * W} cy={m.y * H} r={S * 0.007} fill="#ffd27a" stroke="#121210" strokeWidth={1.5} {...ns} />
          {label(m.x * W + S * 0.012, m.y * H + fs * 0.35, m.label, "#ffd27a")}
        </g>,
      ),
    );

  return <g>{out}</g>;
}

function centroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return { x: pts.reduce((a, p) => a + p.x, 0) / n, y: pts.reduce((a, p) => a + p.y, 0) / n };
}

function FormGlyph({ f, W, H, showBody, showAxes, label, onClick }: {
  f: Analysis["forms"][number]; W: number; H: number; showBody: boolean; showAxes: boolean;
  label: (x: number, y: number, t: string, c?: string, a?: "start" | "middle" | "end") => React.ReactNode; onClick: (e: React.MouseEvent) => void;
}) {
  const ns = { vectorEffect: "non-scaling-stroke" as const };
  const col = "#7fd1b0", acc = "#f0a868";
  const cx = f.center.x * W, cy = f.center.y * H, w = f.width * W, h = f.height * H;
  const ax1 = f.axis.x1 * W, ay1 = f.axis.y1 * H, ax2 = f.axis.x2 * W, ay2 = f.axis.y2 * H;
  const L = Math.hypot(ax2 - ax1, ay2 - ay1) || 1;
  const ux = (ax2 - ax1) / L, uy = (ay2 - ay1) / L; // along axis
  const nx = -uy, ny = ux; // perpendicular
  const axisDeg = (Math.atan2(uy, ux) * 180) / Math.PI;
  const ratio = Math.max(0.08, Math.min(1, f.ellipse_ratio || 0.3));
  const radius = (Math.abs(uy) * w + Math.abs(ux) * h) / 2 || Math.min(w, h) / 2;
  const parts: React.ReactNode[] = [];
  const stroke = { fill: "none", stroke: col, strokeWidth: 2, ...ns };
  const k = f.kind;

  if (k === "sphere" || k === "ellipsoid" || k === "organic_mass") {
    const rx = w / 2, ry = (k === "sphere" ? w : h) / 2;
    if (showBody) {
      parts.push(<ellipse key="b" cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${f.rotation_deg} ${cx} ${cy})`} {...stroke} fill={col} fillOpacity={0.07} strokeDasharray={k === "organic_mass" ? "10 4" : undefined} />);
    }
    if (showAxes) {
      // equator and meridian cross-contours oriented by the pole axis
      parts.push(<ellipse key="eq" cx={cx} cy={cy} rx={Math.max(rx, ry) * 0.98} ry={Math.max(rx, ry) * ratio} transform={`rotate(${axisDeg + 90} ${cx} ${cy})`} fill="none" stroke={acc} strokeWidth={1.5} {...ns} />);
      parts.push(<ellipse key="mer" cx={cx} cy={cy} rx={Math.max(rx, ry) * 0.98} ry={Math.max(rx, ry) * 0.45} transform={`rotate(${axisDeg} ${cx} ${cy})`} fill="none" stroke={acc} strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="5 4" {...ns} />);
      parts.push(<line key="ax" x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke={acc} strokeWidth={1.5} strokeDasharray="8 4" {...ns} />);
    }
  } else if (k === "cylinder" || k === "cone") {
    const rMaj = radius, rMin = radius * ratio;
    if (showBody) {
      const base = <ellipse key="e2" cx={ax2} cy={ay2} rx={rMaj} ry={rMin} transform={`rotate(${axisDeg + 90} ${ax2} ${ay2})`} {...stroke} />;
      if (k === "cylinder") {
        parts.push(<ellipse key="e1" cx={ax1} cy={ay1} rx={rMaj} ry={rMin} transform={`rotate(${axisDeg + 90} ${ax1} ${ay1})`} {...stroke} />, base);
        parts.push(<line key="s1" x1={ax1 + nx * rMaj} y1={ay1 + ny * rMaj} x2={ax2 + nx * rMaj} y2={ay2 + ny * rMaj} {...stroke} />);
        parts.push(<line key="s2" x1={ax1 - nx * rMaj} y1={ay1 - ny * rMaj} x2={ax2 - nx * rMaj} y2={ay2 - ny * rMaj} {...stroke} />);
      } else {
        parts.push(base);
        parts.push(<line key="s1" x1={ax1} y1={ay1} x2={ax2 + nx * rMaj} y2={ay2 + ny * rMaj} {...stroke} />);
        parts.push(<line key="s2" x1={ax1} y1={ay1} x2={ax2 - nx * rMaj} y2={ay2 - ny * rMaj} {...stroke} />);
      }
    }
    if (showAxes) {
      parts.push(<line key="ax" x1={ax1 - ux * L * 0.12} y1={ay1 - uy * L * 0.12} x2={ax2 + ux * L * 0.12} y2={ay2 + uy * L * 0.12} stroke={acc} strokeWidth={1.5} strokeDasharray="8 4" {...ns} />);
      const midX = (ax1 + ax2) / 2, midY = (ay1 + ay2) / 2;
      const rr = k === "cone" ? rMaj / 2 : rMaj;
      parts.push(<ellipse key="mid" cx={midX} cy={midY} rx={rr} ry={rr * ratio} transform={`rotate(${axisDeg + 90} ${midX} ${midY})`} fill="none" stroke={acc} strokeOpacity={0.7} strokeWidth={1.2} strokeDasharray="5 4" {...ns} />);
      parts.push(<line key="ma" x1={midX - ux * rr * ratio * 1.6} y1={midY - uy * rr * ratio * 1.6} x2={midX + ux * rr * ratio * 1.6} y2={midY + uy * rr * ratio * 1.6} stroke={acc} strokeOpacity={0.7} strokeWidth={1} {...ns} />);
    }
  } else {
    // cube / box: front face from the bounding extents, back face offset along a depth direction
    const fw = w * 0.78, fh = h * 0.78;
    const dx = w - fw, dy = -(h - fh);
    const x0 = cx - w / 2, y0 = cy - h / 2 + (h - fh);
    const front = [[x0, y0], [x0 + fw, y0], [x0 + fw, y0 + fh], [x0, y0 + fh]];
    const back = front.map(([x, y]) => [x + dx, y + dy]);
    const g = `rotate(${f.rotation_deg} ${cx} ${cy})`;
    if (showBody) {
      parts.push(<polygon key="f" points={front.map((p) => p.join(",")).join(" ")} {...stroke} fill={col} fillOpacity={0.07} transform={g} />);
      parts.push(<polyline key="b" points={[back[3], back[0], back[1], back[2]].map((p) => p.join(",")).join(" ")} {...stroke} transform={g} />);
      [0, 1, 2].forEach((i) => parts.push(<line key={`c${i}`} x1={front[i][0]} y1={front[i][1]} x2={back[i][0]} y2={back[i][1]} {...stroke} transform={g} />));
    }
    if (showAxes) {
      // hidden edges drawn through, plus the vertical axis
      parts.push(<polyline key="h" points={[back[3], back[2]].map((p) => p.join(",")).join(" ")} fill="none" stroke={acc} strokeOpacity={0.7} strokeDasharray="5 4" strokeWidth={1.2} {...ns} transform={g} />);
      parts.push(<line key="h2" x1={front[3][0]} y1={front[3][1]} x2={back[3][0]} y2={back[3][1]} stroke={acc} strokeOpacity={0.7} strokeDasharray="5 4" strokeWidth={1.2} {...ns} transform={g} />);
      parts.push(<line key="ax" x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke={acc} strokeWidth={1.5} strokeDasharray="8 4" {...ns} />);
    }
  }
  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      {parts}
      {/* fat invisible hit area */}
      <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill="transparent" />
      {showBody && label(cx, cy - h / 2 - Math.max(W, H) * 0.008, f.label, col, "middle")}
    </g>
  );
}

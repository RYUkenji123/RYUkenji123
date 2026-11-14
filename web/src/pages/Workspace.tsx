import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, type Analysis, type Project } from "../api";
import { Icon } from "../components/Icons";
import { useSession } from "../App";
import {
  adjust, blur, detectEdges, detectSegments, estimatePerspective, groupShares, groupGrey, loadImage, measureSubjectBox, quantize,
  renderEdges, renderGray, renderGroups, toGray, valueThresholds, type Gray, type PerspectiveEstimate,
} from "../lib/vision";
import { Overlays, LAYER_META, type LayerId, type Selection } from "../components/Overlays";
import { StatusChip } from "./StudioList";
import { describeDirection } from "../lib/format";

type Tool = "overview" | "shapes" | "forms" | "values" | "perspective" | "proportions" | "steps";
type ValueMode = "original" | "gray" | "2" | "3" | "5" | "7";

const TOOL_LAYERS: Record<Tool, LayerId[]> = {
  overview: [],
  shapes: ["silhouette", "primary_shapes", "secondary_shapes", "negative_space", "edges"],
  forms: ["forms", "form_axes", "silhouette"],
  values: ["tone_regions", "tone_map", "light"],
  perspective: ["perspective", "persp_grid", "detected_lines", "detected_vps"],
  proportions: ["subject_box", "measure_grid", "landmarks", "alignment", "symmetry", "measured_box"],
  steps: [],
};
const DEFAULT_ON: Record<Tool, LayerId[]> = {
  overview: [],
  shapes: ["silhouette", "primary_shapes"],
  forms: ["forms", "form_axes"],
  values: ["light"],
  perspective: ["perspective", "detected_lines"],
  proportions: ["subject_box", "measure_grid", "landmarks", "alignment"],
  steps: [],
};

const TONE_PALETTE: [number, number, number][] = [
  [52, 40, 92], // darkest accents
  [70, 96, 150], // shadow
  [130, 150, 120], // halftone
  [222, 180, 110], // light
  [255, 240, 200], // highlight
];

export default function Workspace() {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const { ai } = useSession();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState("");
  const [aiError, setAiError] = useState("");
  const [tool, setTool] = useState<Tool>("shapes");
  const [layers, setLayers] = useState<Set<LayerId>>(new Set(DEFAULT_ON.shapes));
  const [valueMode, setValueMode] = useState<ValueMode>("original");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [simplify, setSimplify] = useState(2);
  const [split, setSplit] = useState<"equal" | "balanced">("equal");
  const [twoThr, setTwoThr] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [step, setStep] = useState(0);
  const [gridSource, setGridSource] = useState<"ai" | "computed">("ai");
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [gray, setGray] = useState<Gray | null>(null);
  const [computed, setComputed] = useState<{ edgesUrl: string; persp: PerspectiveEstimate; box: ReturnType<typeof measureSubjectBox> } | null>(null);

  const pid = Number(id);
  const analysis: Analysis | null = project?.analysis?.analysis ?? null;
  const usable = !!analysis && analysis.analyzable;
  const W = project?.width ?? 1, H = project?.height ?? 1;

  // ---------------------------------------------------------------- load project + image
  const reload = useCallback(async () => {
    const r = await api<{ project: Project }>(`/projects/${pid}`);
    setProject(r.project);
    return r.project;
  }, [pid]);

  useEffect(() => {
    reload().catch((e) => setLoadError(e.message));
  }, [reload]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    loadImage(`/api/projects/${pid}/image`).then((img) => {
      if (cancelled) return;
      setGray(toGray(img, 900));
      // heavier analysis off the first paint
      setTimeout(() => {
        if (cancelled) return;
        const g = toGray(img, 640);
        const edges = detectEdges(blur(g, 1));
        const segs = detectSegments(edges);
        const persp = estimatePerspective(segs, g.w / g.h);
        setComputed({ edgesUrl: renderEdges(edges), persp, box: measureSubjectBox(blur(g, 2)) });
      }, 30);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // poll while a background analysis is running (e.g. user navigated away and back)
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (project?.analysis_status !== "running" || running) return;
    const t = setInterval(() => reload().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [project?.analysis_status, running, reload]);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setAiError("");
    setProject((p) => (p ? { ...p, analysis_status: "running" } : p));
    try {
      const r = await api<{ project: Project }>(`/projects/${pid}/analyze`, { method: "POST" });
      setProject(r.project);
      setTool("overview");
    } catch (e) {
      setAiError((e as Error).message);
      await reload().catch(() => {});
    } finally {
      setRunning(false);
    }
  }, [pid, reload]);

  useEffect(() => {
    if (search.get("analyze") && project && project.analysis_status === "pending" && ai && !running) {
      setSearch({}, { replace: true });
      runAnalysis();
    }
  }, [search, project, ai, running, runAnalysis, setSearch]);

  useEffect(() => {
    if (project?.analysis && tool === "shapes" && layers.size === 2 && !selection) setTool("overview");
    // only on first arrival of analysis
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.analysis]);

  // ---------------------------------------------------------------- value processing
  const adjusted = useMemo(() => (gray ? adjust(gray, brightness, contrast) : null), [gray, brightness, contrast]);
  const simplified = useMemo(() => (adjusted ? blur(adjusted, simplify) : null), [adjusted, simplify]);
  const study = useMemo(() => {
    if (!simplified || !adjusted) return null;
    if (valueMode === "original") return null;
    if (valueMode === "gray") return { url: renderGray(adjusted), shares: null as number[] | null, n: 0, thresholds: [] as number[] };
    const n = Number(valueMode);
    const thresholds = valueThresholds(simplified, n, split, n === 2 && twoThr != null ? twoThr : undefined);
    const groups = quantize(simplified, thresholds);
    return { url: renderGroups(simplified, groups, n), shares: groupShares(groups, n), n, thresholds };
  }, [simplified, adjusted, valueMode, split, twoThr]);
  const toneMap = useMemo(() => {
    if (!simplified || !layers.has("tone_map")) return null;
    const thresholds = valueThresholds(simplified, 5, "equal");
    const groups = quantize(simplified, thresholds);
    return { url: renderGroups(simplified, groups, 5, TONE_PALETTE), shares: groupShares(groups, 5) };
  }, [simplified, layers]);

  // ---------------------------------------------------------------- tools & layers
  const chooseTool = (t: Tool) => {
    setTool(t);
    setSelection(null);
    setView(null);
    if (t === "steps") {
      applyStepLayers(step);
      return;
    }
    if (t !== "overview") setLayers(new Set(DEFAULT_ON[t]));
    if (t === "values" && valueMode === "original") setValueMode("3");
    if (t !== "values" && t !== "overview") setValueMode("original");
  };
  const toggle = (l: LayerId) =>
    setLayers((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  function applyStepLayers(i: number) {
    const s = analysis?.steps[i];
    if (!s) return;
    const next = new Set<LayerId>();
    let vm: ValueMode = "original";
    for (const l of s.layers) {
      if (l === "value_2") vm = "2";
      else if (l === "value_3") vm = "3";
      else if (l === "value_5") vm = "5";
      else if (l in LAYER_META) next.add(l as LayerId);
    }
    setLayers(next);
    setValueMode(vm);
  }
  const goStep = (i: number) => {
    setStep(i);
    setView(null);
    applyStepLayers(i);
  };
  const toggleStepDone = async (i: number, done: boolean) => {
    const r = await api<{ completed_steps: number[] }>(`/projects/${pid}/steps`, { method: "PATCH", body: { step: i, done } });
    setProject((p) => (p ? { ...p, completed_steps: r.completed_steps } : p));
  };

  // ---------------------------------------------------------------- view (zoom / pan)
  const offCanvasBounds = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    if (layers.has("perspective") && usable) analysis!.perspective.vanishing_points.forEach((v) => pts.push(v));
    if ((layers.has("detected_vps") || layers.has("persp_grid")) && computed) computed.persp.vps.filter((v) => v.kind === "finite").forEach((v) => pts.push(v));
    let x0 = 0, y0 = 0, x1 = 1, y1 = 1;
    for (const p of pts) {
      x0 = Math.min(x0, Math.max(-2.5, p.x));
      x1 = Math.max(x1, Math.min(3.5, p.x));
      y0 = Math.min(y0, Math.max(-2.5, p.y));
      y1 = Math.max(y1, Math.min(3.5, p.y));
    }
    return { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H };
  }, [layers, usable, analysis, computed, W, H]);
  const hasOffCanvas = offCanvasBounds.w > W * 1.01 || offCanvasBounds.h > H * 1.01;
  const fit = () => setView(null);
  const vb = view ?? { x: -W * 0.03, y: -H * 0.03, w: W * 1.06, h: H * 1.06 };
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; vb: typeof vb } | null>(null);
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const c = cx != null && cy != null ? toSvg(cx, cy) : { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    const w = Math.min(W * 12, Math.max(W * 0.08, vb.w / factor));
    const h = (vb.h / vb.w) * w;
    setView({ x: c.x - ((c.x - vb.x) / vb.w) * w, y: c.y - ((c.y - vb.y) / vb.h) * h, w, h });
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  // ---------------------------------------------------------------- render
  if (loadError)
    return (
      <div className="page">
        <div className="notice err">{loadError}</div>
        <p style={{ marginTop: 12 }}><Link to="/studio">Back to the studio</Link></p>
      </div>
    );
  if (!project) return <div className="empty"><span className="spinner" /></div>;

  const status = running ? "running" : project.analysis_status;
  const baseHref = study?.url ?? `/api/projects/${pid}/image`;
  const tools: { id: Tool; label: string; icon: ReactNode; needsAi?: boolean }[] = [
    { id: "overview", label: "Overview", icon: <Icon.sparkle /> },
    { id: "shapes", label: "Shapes", icon: <Icon.shapes /> },
    { id: "forms", label: "3D Forms", icon: <Icon.forms /> },
    { id: "values", label: "Values", icon: <Icon.values /> },
    { id: "perspective", label: "Perspective", icon: <Icon.perspective /> },
    { id: "proportions", label: "Proportion", icon: <Icon.ruler /> },
    { id: "steps", label: "Steps", icon: <Icon.steps />, needsAi: true },
  ];

  return (
    <div className={`studio${panelOpen ? "" : " panel-closed"}`}>
      <div className="toolrail" role="toolbar" aria-label="Analysis tools">
        {tools.map((t) => (
          <button key={t.id} className={`tool${tool === t.id ? " on" : ""}`} onClick={() => chooseTool(t.id)} disabled={t.needsAi && !usable} title={t.needsAi && !usable ? "Needs an AI analysis" : t.label}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="stage-wrap">
        <div className="stage-top">
          <Link to="/studio" className="faint small"><Icon.arrowL /></Link>
          <strong style={{ fontSize: 15 }}>{project.title}</strong>
          <StatusChip status={status} />
          {usable && <span className={`chip ${analysis!.confidence === "high" ? "ok" : analysis!.confidence === "low" ? "warn" : ""}`}>AI confidence: {analysis!.confidence}</span>}
          <span style={{ flex: 1 }} />
          {(tool === "values" || tool === "overview" || valueMode !== "original") && (
            <div className="seg" role="group" aria-label="Value study">
              {(["original", "gray", "2", "3", "5", "7"] as ValueMode[]).map((m) => (
                <button key={m} className={valueMode === m ? "on" : ""} onClick={() => setValueMode(m)}>
                  {m === "original" ? "Original" : m === "gray" ? "Grayscale" : `${m}-value`}
                </button>
              ))}
            </div>
          )}
          <button className="ghost icon" onClick={() => setPanelOpen(!panelOpen)} title="Toggle panel" aria-label="Toggle side panel"><Icon.panel /></button>
        </div>
        <div
          className={`stage${dragging ? " dragging" : ""}`}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              // start a pinch: remember the finger spread and the view it applies to
              const [a, b] = [...pointers.current.values()];
              pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vb };
              drag.current = null;
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch { /* pointer already released */ }
              return;
            }
            drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
          }}
          onPointerMove={(e) => {
            if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const pz = pinch.current;
            if (pz && pointers.current.size >= 2 && svgRef.current) {
              const [a, b] = [...pointers.current.values()];
              const factor = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pz.dist);
              const rect = svgRef.current.getBoundingClientRect();
              // viewBox is letterboxed ("meet"): s = svg units per screen px, off = empty margin in px
              const map = (v: typeof vb) => {
                const s = Math.max(v.w / rect.width, v.h / rect.height);
                return { s, offX: (rect.width - v.w / s) / 2, offY: (rect.height - v.h / s) / 2 };
              };
              const m0 = map(pz.vb);
              const px = pz.vb.x + (pz.mid.x - rect.left - m0.offX) * m0.s; // image point under the fingers at pinch start
              const py = pz.vb.y + (pz.mid.y - rect.top - m0.offY) * m0.s;
              const w = Math.min(W * 12, Math.max(W * 0.08, pz.vb.w / factor));
              const h = (pz.vb.h / pz.vb.w) * w;
              const m1 = map({ ...pz.vb, w, h });
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              setView({ x: px - (mid.x - rect.left - m1.offX) * m1.s, y: py - (mid.y - rect.top - m1.offY) * m1.s, w, h });
              return;
            }
            const d = drag.current;
            if (!d || !svgRef.current) return;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 4) return;
            if (!d.moved) {
              d.moved = true;
              setDragging(true);
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch { /* pointer already released */ }
            }
            const rect = svgRef.current.getBoundingClientRect();
            const scale = Math.max(d.vb.w / rect.width, d.vb.h / rect.height);
            setView({ ...d.vb, x: d.vb.x - dx * scale, y: d.vb.y - dy * scale });
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            if (pointers.current.size < 2) pinch.current = null;
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            pinch.current = null;
            drag.current = null;
            setDragging(false);
          }}
        >
          <svg ref={svgRef} className="canvas" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
            <rect x={0} y={0} width={W} height={H} fill="#000" />
            <image
              href={baseHref}
              x={0}
              y={0}
              width={W}
              height={H}
              preserveAspectRatio="none"
              style={valueMode === "original" ? { filter: `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})` } : undefined}
            />
            {toneMap && <image href={toneMap.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" opacity={0.62} />}
            {computed && layers.has("edges") && <image href={computed.edgesUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" opacity={0.9} />}
            <Overlays W={W} H={H} analysis={usable ? analysis : null} computed={computed} layers={layers} gridSource={gridSource} selection={selection} onSelect={setSelection} />
          </svg>
          <div className="stage-hud">
            {hasOffCanvas && <button className="sm" onClick={() => setView({ x: offCanvasBounds.x - W * 0.05, y: offCanvasBounds.y - H * 0.05, w: offCanvasBounds.w + W * 0.1, h: offCanvasBounds.h + H * 0.1 })}>Show off-canvas VPs</button>}
            <button className="icon" onClick={() => zoomAt(1.25)} aria-label="Zoom in"><Icon.plus /></button>
            <button className="icon" onClick={() => zoomAt(0.8)} aria-label="Zoom out"><Icon.minus /></button>
            <button className="icon" onClick={fit} aria-label="Fit image"><Icon.fit /></button>
          </div>
          {status === "running" && (
            <div style={{ position: "absolute", left: 16, top: 16 }} className="notice ai">
              <div className="row"><span className="spinner" /> Claude is studying the reference: shapes, forms, light, perspective and a drawing plan. This usually takes 30-90 seconds.</div>
            </div>
          )}
        </div>
      </div>

      {panelOpen && (
        <aside className="side">
          <div className="side-inner">
            <AiBar project={project} status={status} ai={ai} error={aiError} onRun={runAnalysis} onDelete={async () => {
              if (!confirm("Delete this reference and its analysis?")) return;
              await api(`/projects/${pid}`, { method: "DELETE" });
              nav("/studio");
            }} />

            {analysis && !analysis.analyzable && (
              <div className="notice warn">
                <b>This image is hard to use as a drawing reference.</b> {analysis.summary}
                {analysis.ambiguities.length > 0 && <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{analysis.ambiguities.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                <div className="small" style={{ marginTop: 6 }}>The computed tools (values, edges, detected lines) still work.</div>
              </div>
            )}

            {selection && <SelectionCard sel={selection} onClose={() => setSelection(null)} />}

            {tool === "overview" && <OverviewPanel analysis={usable ? analysis : null} project={project} onStart={() => { chooseTool("steps"); }} />}

            {tool !== "overview" && tool !== "steps" && (
              <div>
                <h4>Layers</h4>
                {TOOL_LAYERS[tool].map((l) => (
                  <LayerToggle key={l} id={l} on={layers.has(l)} onToggle={() => toggle(l)} disabled={LAYER_META[l].source === "ai" && !usable} />
                ))}
              </div>
            )}

            {tool === "shapes" && <ShapesPanel a={usable ? analysis : null} />}
            {tool === "forms" && <FormsPanel a={usable ? analysis : null} />}
            {tool === "values" && (
              <ValuesPanel
                a={usable ? analysis : null}
                brightness={brightness} contrast={contrast} simplify={simplify} split={split} valueMode={valueMode}
                twoThr={twoThr ?? study?.thresholds[0] ?? 128}
                setBrightness={setBrightness} setContrast={setContrast} setSimplify={setSimplify} setSplit={setSplit} setTwoThr={setTwoThr}
                shares={study?.shares ?? null} n={study?.n ?? 0} toneShares={toneMap?.shares ?? null}
              />
            )}
            {tool === "perspective" && <PerspectivePanel a={usable ? analysis : null} computed={computed?.persp ?? null} gridSource={gridSource} setGridSource={setGridSource} />}
            {tool === "proportions" && <ProportionsPanel a={usable ? analysis : null} W={W} H={H} measured={computed?.box ?? null} />}
            {tool === "steps" && usable && (
              <StepsPanel a={analysis!} step={step} done={project.completed_steps} goStep={goStep} toggleDone={toggleStepDone} />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- panels

function AiBar({ project, status, ai, error, onRun, onDelete }: { project: Project; status: string; ai: boolean; error: string; onRun: () => void; onDelete: () => void }) {
  return (
    <div className="stack">
      {!ai && <div className="notice warn small">AI analysis is not configured on this server. Computed layers (marked <span className="source-tag computed">computed</span>) still work.</div>}
      {error && <div className="notice err small">{error}</div>}
      {status === "error" && !error && project.analysis_error && <div className="notice err small">{project.analysis_error}</div>}
      <div className="row wrap">
        {ai && status !== "running" && (
          <button className={project.analysis ? "" : "primary"} onClick={onRun}>
            <Icon.sparkle /> {project.analysis ? "Re-analyze" : status === "error" ? "Retry AI analysis" : "Run AI analysis"}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="ghost icon" onClick={onDelete} title="Delete reference" aria-label="Delete reference"><Icon.trash /></button>
      </div>
      {project.analysis && <div className="faint small">AI analysis by {project.analysis.model}, {new Date(project.analysis.analyzed_at).toLocaleString()}</div>}
    </div>
  );
}

function LayerToggle({ id, on, onToggle, disabled }: { id: LayerId; on: boolean; onToggle: () => void; disabled?: boolean }) {
  const m = LAYER_META[id];
  return (
    <div
      className="layer-row"
      onClick={() => !disabled && onToggle()}
      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !disabled && onToggle()}
    >
      <span className="sw" style={{ background: m.color }} />
      <span className="name">{m.label}</span>
      <span className={`source-tag ${m.source}`}>{m.source === "ai" ? "AI" : "computed"}</span>
      <span style={{ width: 16, color: on ? "var(--text)" : "var(--text-3)" }}>{on ? <Icon.eye /> : <Icon.eyeOff />}</span>
    </div>
  );
}

function SelectionCard({ sel, onClose }: { sel: Selection; onClose: () => void }) {
  return (
    <div className="explain" style={{ borderColor: "var(--accent)" }}>
      <div className="row between"><b>{sel.title}</b><button className="ghost sm" onClick={onClose}>Close</button></div>
      {sel.subtitle && <div className="faint small" style={{ marginBottom: 6 }}>{sel.subtitle}</div>}
      {sel.body.map((t, i) => <p key={i} style={{ margin: "0 0 6px" }}>{t}</p>)}
    </div>
  );
}

const NeedsAi = () => <div className="faint small">Run the AI analysis to get the explanations for this tool.</div>;

function OverviewPanel({ analysis: a, project, onStart }: { analysis: Analysis | null; project: Project; onStart: () => void }) {
  if (!a) return <div className="explain">Once the AI analysis is done you'll see a summary of the reference here, plus a 10-step drawing plan. Meanwhile try the <b>Values</b> tool, which works on any image.</div>;
  return (
    <div className="stack">
      <div>
        <h4>Subject</h4>
        <h2 style={{ marginBottom: 4 }}>{a.subject}</h2>
        <div className="row wrap"><span className="chip" style={{ textTransform: "capitalize" }}>{a.difficulty}</span><span className="chip">{a.perspective.type.replace(/_/g, " ")}</span><span className="chip">{project.completed_steps.length}/{a.steps.length} steps done</span></div>
      </div>
      <p>{a.summary}</p>
      <div>
        <h4>What this reference teaches</h4>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{a.key_lessons.map((k, i) => <li key={i}>{k}</li>)}</ul>
      </div>
      {a.ambiguities.length > 0 && (
        <div className="notice small">
          <b>Uncertain:</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{a.ambiguities.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      <button className="primary" onClick={onStart}><Icon.steps /> Start step-by-step drawing</button>
    </div>
  );
}

function ShapesPanel({ a }: { a: Analysis | null }) {
  if (!a) return <NeedsAi />;
  return (
    <div className="stack">
      <div className="explain"><b>Silhouette.</b> {a.silhouette.description}</div>
      <div>
        <h4>Shapes, largest first</h4>
        {a.shapes.map((s, i) => (
          <div key={i} className="small" style={{ marginBottom: 8 }}>
            <b style={{ color: s.role === "primary" ? "var(--accent-2)" : "var(--text)" }}>{s.label}</b> <span className="faint">({s.kind}, {s.role})</span>
            <div className="muted">{s.explanation}</div>
          </div>
        ))}
      </div>
      {a.negative_spaces.length > 0 && (
        <div>
          <h4>Negative spaces</h4>
          {a.negative_spaces.map((n, i) => <div key={i} className="small" style={{ marginBottom: 6 }}><b>{n.label}.</b> <span className="muted">{n.explanation}</span></div>)}
        </div>
      )}
      <div>
        <h4>Proportional relationships</h4>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{a.proportional_relationships.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </div>
      <div className="faint small">Tip: click any outline on the image for its explanation.</div>
    </div>
  );
}

function FormsPanel({ a }: { a: Analysis | null }) {
  if (!a) return <NeedsAi />;
  return (
    <div className="stack">
      <div className="explain">{a.form_explanation}</div>
      {a.forms.map((f, i) => (
        <div key={i} className="small">
          <b>{f.label}</b> <span className="chip" style={{ marginLeft: 4 }}>{f.kind.replace("_", " ")}</span>
          <div className="muted" style={{ marginTop: 4 }}><i>Rotation:</i> {f.rotation_explanation}</div>
          <div className="muted"><i>Construct it:</i> {f.construction_tip}</div>
        </div>
      ))}
    </div>
  );
}

function ValuesPanel(p: {
  a: Analysis | null; brightness: number; contrast: number; simplify: number; split: "equal" | "balanced"; valueMode: ValueMode; twoThr: number;
  setBrightness: (n: number) => void; setContrast: (n: number) => void; setSimplify: (n: number) => void; setSplit: (s: "equal" | "balanced") => void; setTwoThr: (n: number) => void;
  shares: number[] | null; n: number; toneShares: number[] | null;
}) {
  const names5 = ["Dark accents", "Shadow", "Halftone", "Light", "Highlight"];
  return (
    <div className="stack">
      <div>
        <h4>Adjust</h4>
        <label className="field">Brightness <input type="range" min={-60} max={60} value={p.brightness} onChange={(e) => p.setBrightness(+e.target.value)} /></label>
        <label className="field">Contrast <input type="range" min={-60} max={60} value={p.contrast} onChange={(e) => p.setContrast(+e.target.value)} /></label>
        <label className="field">Simplify detail (squint) <input type="range" min={0} max={8} value={p.simplify} onChange={(e) => p.setSimplify(+e.target.value)} /></label>
        {p.valueMode === "2" ? (
          <label className="field">Light/shadow split: {Math.round(p.twoThr)} <input type="range" min={10} max={245} value={p.twoThr} onChange={(e) => p.setTwoThr(+e.target.value)} /></label>
        ) : (
          <div className="row" style={{ marginTop: 6 }}>
            <span className="small faint">Grouping</span>
            <div className="seg">
              <button className={p.split === "equal" ? "on" : ""} onClick={() => p.setSplit("equal")}>Equal steps</button>
              <button className={p.split === "balanced" ? "on" : ""} onClick={() => p.setSplit("balanced")}>Balanced</button>
            </div>
          </div>
        )}
        <button className="ghost sm" style={{ marginTop: 6 }} onClick={() => { p.setBrightness(0); p.setContrast(0); p.setSimplify(2); }}>Reset adjustments</button>
      </div>
      {p.shares && p.n > 0 && (
        <div>
          <h4>Value distribution <span className="source-tag computed">computed</span></h4>
          <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }}>
            {p.shares.map((s, i) => <div key={i} title={`${Math.round(s * 100)}%`} style={{ width: `${s * 100}%`, background: `rgb(${groupGrey(i, p.n)},${groupGrey(i, p.n)},${groupGrey(i, p.n)})` }} />)}
          </div>
          <div className="faint small" style={{ marginTop: 4 }}>
            Share of the image in each value group, dark to light. {p.n === 2 ? "Two values separate the light family from the shadow family; this is the most important read of any subject." : p.n === 3 ? "Three values: shadow, halftone, light. Most strong drawings read clearly at this level." : "Keep halftones in the light family when you shade."}
          </div>
        </div>
      )}
      {p.toneShares && (
        <div>
          <h4>Tone map key <span className="source-tag computed">computed</span></h4>
          {names5.map((n, i) => (
            <div key={n} className="row small" style={{ marginBottom: 3 }}>
              <span className="dot" style={{ background: `rgb(${TONE_PALETTE[i].join(",")})` }} /> {n} <span className="faint mono" style={{ marginLeft: "auto" }}>{Math.round(p.toneShares![i] * 100)}%</span>
            </div>
          ))}
          <div className="faint small">Bands are luminance ranges only. Telling reflected light from halftone needs the AI tone regions, because it depends on which side of the form a tone sits on.</div>
        </div>
      )}
      {p.a ? (
        <div className="stack">
          <h4>Light <span className="source-tag ai">AI</span></h4>
          {p.a.light.present ? (
            <>
              <dl className="kv">
                <dt>From</dt><dd>{describeDirection(p.a.light.direction_deg)}</dd>
                <dt>Elevation</dt><dd style={{ textTransform: "capitalize" }}>{p.a.light.elevation}</dd>
                <dt>Quality</dt><dd style={{ textTransform: "capitalize" }}>{p.a.light.quality}</dd>
              </dl>
              <div className="explain">{p.a.light.description}</div>
              {p.a.light.regions.map((r, i) => (
                <div key={i} className="small"><b>{r.label}</b> <span className="faint">({r.type.replace(/_/g, " ")})</span><div className="muted">{r.explanation}</div></div>
              ))}
            </>
          ) : (
            <div className="explain">{p.a.light.description || "No clear directional light was identified."}</div>
          )}
        </div>
      ) : <NeedsAi />}
    </div>
  );
}


function PerspectivePanel({ a, computed, gridSource, setGridSource }: { a: Analysis | null; computed: PerspectiveEstimate | null; gridSource: "ai" | "computed"; setGridSource: (s: "ai" | "computed") => void }) {
  const label = (t: string) => t.replace("none_or_flat", "no strong perspective").replace(/_/g, "-");
  return (
    <div className="stack">
      <div className="row">
        <span className="small faint">Grid from</span>
        <div className="seg">
          <button className={gridSource === "ai" ? "on" : ""} onClick={() => setGridSource("ai")} disabled={!a}>AI VPs</button>
          <button className={gridSource === "computed" ? "on" : ""} onClick={() => setGridSource("computed")}>Detected VPs</button>
        </div>
      </div>
      {a ? (
        <div className="stack">
          <h4>AI reading <span className="source-tag ai">AI</span></h4>
          <div className="row wrap"><span className="chip accent" style={{ textTransform: "capitalize" }}>{label(a.perspective.type)}</span></div>
          <div className="explain">{a.perspective.explanation}</div>
          <dl className="kv">
            <dt>Eye level</dt><dd>{a.perspective.eye_level}</dd>
            <dt>Horizon</dt><dd>{a.perspective.horizon_y == null ? "unknown" : a.perspective.horizon_y < 0 ? "above the frame" : a.perspective.horizon_y > 1 ? "below the frame" : `${Math.round(a.perspective.horizon_y * 100)}% down the image`}</dd>
            <dt>VPs</dt><dd>{a.perspective.vanishing_points.map((v) => v.label).join(", ") || "none"}</dd>
          </dl>
          {a.perspective.distortion_notes && <div className="small muted"><b>Distortion:</b> {a.perspective.distortion_notes}</div>}
        </div>
      ) : <NeedsAi />}
      <div className="stack">
        <h4>Measured from straight edges <span className="source-tag computed">computed</span></h4>
        {!computed ? (
          <div className="faint small"><span className="spinner" style={{ width: 10, height: 10 }} /> Detecting lines…</div>
        ) : (
          <>
            <div className="small">
              Found <b>{computed.segments.length}</b> straight edges; <b>{computed.vps.length}</b> line families converge.
              Best geometric fit: <b>{label(computed.guess)}</b>
              {computed.horizonY != null && <> with the horizon about {computed.horizonY < 0 ? "above the frame" : computed.horizonY > 1 ? "below the frame" : `${Math.round(computed.horizonY * 100)}% down`}</>}.
            </div>
            {computed.notes.map((n, i) => <div key={i} className="faint small">{n}</div>)}
            {a && computed.guess !== a.perspective.type && a.perspective.type !== "ambiguous" && (
              <div className="notice small">The AI reading and the line fit disagree. Line detection only sees straight edges (texture, shadows and organic shapes confuse it), while the AI reasons about the objects. Check which lines actually belong to the same object.</div>
            )}
          </>
        )}
      </div>
      <div className="explain small">
        <b>How to use this.</b> Draw the horizon first at your eye level. Then lightly mark the vanishing points, even if they fall off the paper (tape extra paper to the side).
        Every receding edge of a box-like object must aim at its vanishing point.
      </div>
    </div>
  );
}

function ProportionsPanel({ a, W, H, measured }: { a: Analysis | null; W: number; H: number; measured: { x: number; y: number; w: number; h: number } | null }) {
  const ratio = (w: number, h: number) => (h >= w ? `1 : ${(h / w).toFixed(2)} (width : height)` : `${(w / h).toFixed(2)} : 1 (width : height)`);
  return (
    <div className="stack">
      <dl className="kv">
        <dt>Image</dt><dd className="mono">{W}×{H}px, {ratio(W, H)}</dd>
        {measured && <><dt>Subject (measured)</dt><dd className="mono">{ratio(measured.w * W, measured.h * H)}</dd></>}
        {a && <><dt>Subject (AI box)</dt><dd className="mono">{ratio(a.proportions.subject_box.w * W, a.proportions.subject_box.h * H)}</dd></>}
      </dl>
      {!measured && <div className="faint small">The subject couldn't be separated from the background automatically, so no measured box is shown.</div>}
      {a ? (
        <>
          <div className="explain"><b>Measuring unit:</b> {a.proportions.unit_label}</div>
          {a.proportions.measurements.map((m, i) => <div key={i} className="small"><b>{m.label}.</b> <span className="muted">{m.explanation}</span></div>)}
          {a.proportions.symmetry.present && <div className="small"><b>Symmetry.</b> <span className="muted">{a.proportions.symmetry.explanation}</span></div>}
          <div>
            <h4>Construction guidance</h4>
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>{a.proportions.guidance.map((g, i) => <li key={i}>{g}</li>)}</ol>
          </div>
        </>
      ) : <NeedsAi />}
      <div className="faint small">The measure grid splits the subject box into halves and quarters so you can check where landmarks fall.</div>
    </div>
  );
}

function StepsPanel({ a, step, done, goStep, toggleDone }: { a: Analysis; step: number; done: number[]; goStep: (i: number) => void; toggleDone: (i: number, d: boolean) => void }) {
  const s = a.steps[step];
  const isDone = done.includes(step);
  return (
    <div className="stack">
      <div className="row between">
        <h4 style={{ margin: 0 }}>Step {step + 1} of {a.steps.length}</h4>
        <span className="faint small">{done.length} done</span>
      </div>
      <div className="bar"><i style={{ width: `${(done.length / a.steps.length) * 100}%` }} /></div>
      {s && (
        <div className="stack">
          <h2 style={{ margin: 0 }}>{s.title}</h2>
          <p style={{ margin: 0 }}>{s.explanation}</p>
          <div className="task small"><b>Practice:</b> {s.practice_task}</div>
          <div className="faint small">The image shows this step's demonstration layers: {s.layers.map((l) => LAYER_META[l as LayerId]?.label ?? l.replace("_", "-")).join(", ") || "original image"}.</div>
          <div className="row">
            <button className="icon" disabled={step === 0} onClick={() => goStep(step - 1)} aria-label="Previous step"><Icon.arrowL /></button>
            <button className={isDone ? "" : "primary"} style={{ flex: 1 }} onClick={() => { toggleDone(step, !isDone); if (!isDone && step < a.steps.length - 1) goStep(step + 1); }}>
              {isDone ? <><Icon.check /> Done (undo)</> : "Mark done & next"}
            </button>
            <button className="icon" disabled={step >= a.steps.length - 1} onClick={() => goStep(step + 1)} aria-label="Next step"><Icon.arrowR /></button>
          </div>
        </div>
      )}
      <div className="step-list">
        {a.steps.map((st, i) => (
          <button key={i} className={`step-item${i === step ? " on" : ""}${done.includes(i) ? " done" : ""}`} onClick={() => goStep(i)}>
            <span className="step-num">{done.includes(i) ? "✓" : i + 1}</span>
            <span>{st.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

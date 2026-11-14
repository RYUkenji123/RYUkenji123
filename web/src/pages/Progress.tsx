import { useEffect, useRef, useState } from "react";
import { api, fileToDataUrl, type Criterion, type Drawing, type Project } from "../api";
import { Icon } from "../components/Icons";
import { Stars } from "./Exercises";
import { useSession } from "../App";

const CRITERIA: { id: string; label: string; fb?: keyof Pick<NonNullable<Drawing["ai_feedback"]>, "shape_accuracy" | "proportions" | "perspective" | "value_control" | "line_quality"> }[] = [
  { id: "shape", label: "Shape accuracy", fb: "shape_accuracy" },
  { id: "proportion", label: "Proportions", fb: "proportions" },
  { id: "perspective", label: "Perspective", fb: "perspective" },
  { id: "values", label: "Value control", fb: "value_control" },
  { id: "line", label: "Line quality", fb: "line_quality" },
  { id: "consistency", label: "Consistency" },
];
const COLORS = ["#d98b4a", "#8fc1d4", "#b58ad9", "#7fd1b0", "#ffd27a", "#d9786a"];

function Upload({ projects, onDone }: { projects: Project[]; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { dataUrl } = await fileToDataUrl(file, 1600);
      await api("/drawings", { body: { image: dataUrl, title: title || file.name.replace(/\.[^.]+$/, ""), project_id: projectId ? Number(projectId) : null, self_scores: scores, notes } });
      setFile(null);
      setPreview("");
      setTitle("");
      setScores({});
      setNotes("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Log a drawing</h2>
      <div className="upload-drop" style={{ padding: preview ? 8 : 26 }} onClick={() => input.current?.click()}>
        {preview ? <img src={preview} alt="" style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 6 }} /> : <div className="stack" style={{ alignItems: "center" }}><div style={{ width: 28, color: "var(--accent)" }}><Icon.upload /></div>Photo or scan of your drawing</div>}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
      </div>
      <label className="field">Title <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mug study #3" /></label>
      <label className="field">Drawn from reference (optional)
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">None / from imagination</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>
      <h4 style={{ marginTop: 6 }}>Your self-assessment</h4>
      {CRITERIA.map((c) => (
        <div key={c.id} className="row between small"><span>{c.label}</span><Stars value={scores[c.id] ?? 0} onChange={(n) => setScores({ ...scores, [c.id]: n })} /></div>
      ))}
      <textarea rows={2} placeholder="Notes: what you were working on" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <div className="notice err small">{error}</div>}
      <button className="primary" disabled={!file || busy} onClick={submit}>{busy ? <span className="spinner" /> : "Save drawing"}</button>
    </div>
  );
}

function Compare({ a, b }: { a: Drawing; b: Drawing }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (!e.buttons) return;
    const r = box.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };
  return (
    <div>
      <div ref={box} className="compare" onPointerMove={move} onPointerDown={move} style={{ touchAction: "none" }}>
        <img src={`/api/drawings/${b.id}/image`} alt={b.title} />
        <img src={`/api/drawings/${a.id}/image`} alt={a.title} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div className="handle" style={{ left: `${pos}%` }} />
      </div>
      <div className="row between small faint" style={{ marginTop: 6 }}><span>← {a.title} ({new Date(a.created_at).toLocaleDateString()})</span><span>{b.title} ({new Date(b.created_at).toLocaleDateString()}) →</span></div>
    </div>
  );
}

function TrendChart({ drawings }: { drawings: Drawing[] }) {
  const pts = drawings.filter((d) => Object.keys(d.self_scores).length);
  if (pts.length < 2) return <div className="faint small">Log at least two drawings with self-ratings to see a trend.</div>;
  const W = 560, H = 180, pad = 26;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - 1) / 4) * (H - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }} role="img" aria-label="Self-assessment trend">
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}><line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} stroke="#2f2d29" /><text x={6} y={y(v) + 4} fill="#837c71" fontSize={10}>{v}</text></g>
        ))}
        {CRITERIA.map((c, ci) => {
          const series = pts.map((d, i) => (d.self_scores[c.id] ? [x(i), y(d.self_scores[c.id])] : null)).filter(Boolean) as number[][];
          if (series.length < 1) return null;
          return (
            <g key={c.id}>
              <polyline points={series.map((p) => p.join(",")).join(" ")} fill="none" stroke={COLORS[ci]} strokeWidth={2} />
              {series.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={COLORS[ci]} />)}
            </g>
          );
        })}
      </svg>
      <div className="row wrap small">{CRITERIA.map((c, i) => <span key={c.id} className="row" style={{ gap: 5 }}><span className="dot" style={{ background: COLORS[i] }} />{c.label}</span>)}</div>
    </div>
  );
}

function FeedbackView({ d, onUpdate, ai }: { d: Drawing; onUpdate: (d: Drawing) => void; ai: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fb = d.ai_feedback;
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ drawing: Drawing }>(`/drawings/${d.id}/feedback`, { method: "POST" });
      onUpdate(r.drawing);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const crit = (label: string, c: Criterion) => (
    <div key={label} className="small" style={{ marginBottom: 8 }}>
      <div className="row between"><b>{label}</b><span className="faint mono" title="AI's rough opinion, not a measurement">AI estimate {c.estimate}/5</span></div>
      <div className="muted">{c.observation}</div>
      <div><i>Next:</i> {c.next_step}</div>
    </div>
  );
  return (
    <div className="stack">
      {!fb && (
        <div className="row">
          <button onClick={run} disabled={busy || !ai}>{busy ? <><span className="spinner" /> Reviewing…</> : <><Icon.sparkle /> Get AI feedback</>}</button>
          {!ai && <span className="faint small">AI not configured on the server</span>}
        </div>
      )}
      {error && <div className="notice err small">{error}</div>}
      {fb && (
        <div className="notice ai stack" style={{ gap: 8 }}>
          <div className="row between"><span className="source-tag ai">AI feedback · opinion, not measurement</span><button className="ghost sm" onClick={run} disabled={busy}>{busy ? <span className="spinner" /> : "Refresh"}</button></div>
          {!fb.readable && <div className="notice warn small">The AI couldn't read this upload clearly as a drawing.</div>}
          <p style={{ margin: 0, color: "var(--text)" }}>{fb.overall}</p>
          {fb.strengths.length > 0 && <div className="small"><b>Strengths:</b> {fb.strengths.join(" · ")}</div>}
          {crit("Shape accuracy", fb.shape_accuracy)}
          {crit("Proportions", fb.proportions)}
          {crit("Perspective", fb.perspective)}
          {crit("Value control", fb.value_control)}
          {crit("Line quality", fb.line_quality)}
          <div className="task small"><b>Priority exercise:</b> {fb.priority_exercise}</div>
          <div className="faint small"><b>Limits:</b> {fb.caveats}</div>
        </div>
      )}
    </div>
  );
}

export default function Progress() {
  const { ai } = useSession();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [cmp, setCmp] = useState<[number | null, number | null]>([null, null]);
  const [activity, setActivity] = useState<{ kind: string; minutes: number; day: string }[]>([]);

  const load = async () => {
    const [d, p, a] = await Promise.all([api<{ drawings: Drawing[] }>("/drawings"), api<{ projects: Project[] }>("/projects"), api<{ activity: any[] }>("/activity")]);
    setDrawings(d.drawings);
    setProjects(p.projects);
    setActivity(a.activity);
    if (d.drawings.length >= 2) setCmp((c) => (c[0] == null ? [d.drawings[0].id, d.drawings[d.drawings.length - 1].id] : c));
    return d.drawings;
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sel = drawings.find((d) => d.id === selected) ?? null;
  const ca = drawings.find((d) => d.id === cmp[0]), cb = drawings.find((d) => d.id === cmp[1]);
  const avg = (ds: Drawing[], k: string) => {
    const v = ds.map((d) => d.self_scores[k]).filter(Boolean);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const half = Math.floor(drawings.length / 2);
  const early = drawings.slice(0, Math.max(1, half)), recent = drawings.slice(half);
  const practiceDays = new Set(activity.map((a) => a.day)).size;
  const totalMin = Math.round(activity.reduce((a, b) => a + Number(b.minutes || 0), 0));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Drawing Progress</h1>
          <p className="muted">Upload drawings over time and compare. DrawLab keeps three kinds of signal separate: what's measured, how you rate yourself, and the AI's opinion.</p>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 18 }}>
        <div className="card">
          <h4>Measured <span className="source-tag computed">facts</span></h4>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Drawings logged</dt><dd className="mono">{drawings.length}</dd>
            <dt>Practice days</dt><dd className="mono">{practiceDays}</dd>
            <dt>Practice time</dt><dd className="mono">{totalMin} min</dd>
            <dt>First upload</dt><dd className="mono">{drawings[0] ? new Date(drawings[0].created_at).toLocaleDateString() : "–"}</dd>
          </dl>
        </div>
        <div className="card span2">
          <h4>Self-assessment trend <span className="source-tag" style={{ background: "var(--panel-2)" }}>your ratings</span></h4>
          <div style={{ marginTop: 8 }}><TrendChart drawings={drawings} /></div>
          {drawings.length >= 2 && (
            <div className="row wrap small" style={{ marginTop: 8 }}>
              {CRITERIA.map((c) => {
                const e = avg(early, c.id), r = avg(recent, c.id);
                if (e == null || r == null) return null;
                const d = r - e;
                return <span key={c.id} className={`chip ${d > 0.2 ? "ok" : d < -0.2 ? "err" : ""}`}>{c.label}: {e.toFixed(1)} → {r.toFixed(1)}</span>;
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 18 }}>
        <Upload projects={projects} onDone={load} />
        <div className="card span2 stack">
          <div className="card-head" style={{ marginBottom: 0 }}>
            <h2>Then vs now</h2>
            {drawings.length >= 2 && (
              <div className="row">
                <select value={cmp[0] ?? ""} onChange={(e) => setCmp([Number(e.target.value), cmp[1]])} style={{ width: 170 }}>{drawings.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
                <select value={cmp[1] ?? ""} onChange={(e) => setCmp([cmp[0], Number(e.target.value)])} style={{ width: 170 }}>{drawings.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
              </div>
            )}
          </div>
          {ca && cb ? <Compare a={ca} b={cb} /> : <div className="empty">Upload two or more drawings to compare an older one with a recent one using the slider.</div>}
        </div>
      </div>

      <h2>All drawings</h2>
      {drawings.length === 0 ? (
        <div className="empty card flat">Your drawings will appear here.</div>
      ) : (
        <div className="grid g3" style={{ alignItems: "start" }}>
          <div className="ref-grid span2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {[...drawings].reverse().map((d) => (
              <button key={d.id} className="ref-card" style={{ padding: 0, textAlign: "left", alignItems: "stretch", borderColor: selected === d.id ? "var(--accent)" : undefined }} onClick={() => setSelected(d.id)}>
                <img src={`/api/drawings/${d.id}/image`} alt={d.title} loading="lazy" />
                <div className="meta">
                  <strong>{d.title}</strong>
                  <div className="row between faint small"><span>{new Date(d.created_at).toLocaleDateString()}</span>{d.ai_feedback && <span className="source-tag ai">AI</span>}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="card">
            {sel ? (
              <div className="stack">
                <div className="row between"><h3 style={{ margin: 0 }}>{sel.title}</h3>
                  <button className="ghost icon" aria-label="Delete drawing" onClick={async () => { if (confirm("Delete this drawing?")) { await api(`/drawings/${sel.id}`, { method: "DELETE" }); setSelected(null); load(); } }}><Icon.trash /></button>
                </div>
                <img src={`/api/drawings/${sel.id}/image`} alt={sel.title} style={{ width: "100%", borderRadius: 8 }} />
                {sel.project_id && <div className="small faint">Drawn from: {projects.find((p) => p.id === sel.project_id)?.title ?? "a reference"}</div>}
                {sel.notes && <div className="small">{sel.notes}</div>}
                <h4>Your ratings</h4>
                {CRITERIA.map((c) => <div key={c.id} className="row between small"><span>{c.label}</span><span className="mono">{sel.self_scores[c.id] ? "★".repeat(sel.self_scores[c.id]) : "–"}</span></div>)}
                <FeedbackView d={sel} ai={ai} onUpdate={(nd) => setDrawings(drawings.map((x) => (x.id === nd.id ? nd : x)))} />
              </div>
            ) : (
              <div className="faint small">Select a drawing to see your ratings and get AI feedback.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

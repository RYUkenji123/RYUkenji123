import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fileToDataUrl, type Project } from "../api";
import { Icon } from "../components/Icons";
import { useSession } from "../App";

export function StatusChip({ status }: { status: Project["analysis_status"] }) {
  if (status === "done") return <span className="chip ok">Analyzed</span>;
  if (status === "running") return <span className="chip accent"><span className="spinner" style={{ width: 10, height: 10 }} /> Analyzing</span>;
  if (status === "error") return <span className="chip err">Needs retry</span>;
  return <span className="chip">Not analyzed</span>;
}

export default function StudioList() {
  const { ai } = useSession();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects)).catch((e) => setError(e.message));
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { dataUrl, width, height } = await fileToDataUrl(file);
      const r = await api<{ project: Project }>("/projects", {
        body: { image: dataUrl, width, height, title: title.trim() || file.name.replace(/\.[^.]+$/, "") },
      });
      nav(`/studio/${r.project.id}?analyze=1`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reference Breakdown Studio</h1>
          <p className="muted">Upload a photo. DrawLab separates it into shapes, 3D forms, values, perspective and proportions you can toggle on and off.</p>
        </div>
      </div>

      {!ai && (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          AI analysis isn't configured on this server (no <code>ANTHROPIC_API_KEY</code>). You can still upload references and use the
          computed tools: value studies, brightness/contrast, edge maps, detected perspective lines and measured proportions.
        </div>
      )}

      <div className="grid g3" style={{ marginBottom: 30 }}>
        <div
          className={`upload-drop span2${over ? " over" : ""}`}
          onClick={() => !busy && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        >
          {busy ? (
            <div className="stack" style={{ alignItems: "center" }}><span className="spinner" /> Uploading…</div>
          ) : (
            <div className="stack" style={{ alignItems: "center" }}>
              <div style={{ width: 36, color: "var(--accent)" }}><Icon.upload /></div>
              <div style={{ fontSize: 16 }}>Drop a reference image here, or click to choose</div>
              <div className="faint small">JPEG, PNG or WebP. Photos of still lifes, objects, figures, buildings and interiors work best.</div>
            </div>
          )}
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        <div className="card stack">
          <label className="field">
            Title (optional)
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Coffee mug, window light" />
          </label>
          <h4 style={{ marginTop: 8 }}>Tips for good references</h4>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>One clear light source makes the value and light analysis much richer.</li>
            <li>Man-made objects and rooms show perspective clearly.</li>
            <li>Avoid heavy filters, collages and tiny images.</li>
          </ul>
        </div>
      </div>
      {error && <div className="notice err" style={{ marginBottom: 18 }}>{error}</div>}

      <h2>Your references</h2>
      {!projects ? (
        <div className="empty"><span className="spinner" /></div>
      ) : projects.length === 0 ? (
        <div className="empty card flat">No references yet. Upload one above to start your first breakdown.</div>
      ) : (
        <div className="ref-grid">
          {projects.map((p) => (
            <Link key={p.id} to={`/studio/${p.id}`} className="ref-card">
              <img src={`/api/projects/${p.id}/image`} alt={p.title} loading="lazy" />
              <div className="meta">
                <strong>{p.title}</strong>
                <div className="row between">
                  <StatusChip status={p.analysis_status} />
                  <span className="faint small">{p.completed_steps.length}/10 steps</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Category, type Exercise } from "../api";
import { Icon } from "../components/Icons";

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="stars" role="radiogroup" aria-label="Self-assessment">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? "on" : ""} onClick={() => onChange(n)} aria-label={`${n} of 5`} role="radio" aria-checked={n === value}>★</button>
      ))}
    </span>
  );
}
export { Stars };

function Timer({ minutes, onElapsed }: { minutes: number; onElapsed: (sec: number) => void }) {
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const elapsed = useRef(0);
  useEffect(() => {
    setLeft(minutes * 60);
    setRunning(false);
    elapsed.current = 0;
  }, [minutes]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      elapsed.current += 1;
      onElapsed(elapsed.current);
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false);
          try {
            const ctx = new AudioContext();
            const o = ctx.createOscillator();
            o.frequency.value = 660;
            o.connect(ctx.destination);
            o.start();
            o.stop(ctx.currentTime + 0.35);
          } catch { /* audio not available */ }
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, onElapsed]);
  const mm = Math.floor(left / 60), ss = left % 60;
  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <div className="timer" aria-live="polite">{mm}:{String(ss).padStart(2, "0")}</div>
      <div className="row">
        <button className="primary" onClick={() => setRunning(!running)} disabled={left === 0}>{running ? <><Icon.pause /> Pause</> : <><Icon.play /> {left < minutes * 60 ? "Resume" : "Start"}</>}</button>
        <button onClick={() => { setRunning(false); setLeft(minutes * 60); }}><Icon.reset /> Reset</button>
      </div>
      {left === 0 && <div className="chip accent">Time! Finish your current line and assess.</div>}
    </div>
  );
}

export default function Exercises() {
  const [params] = useSearchParams();
  const [today, setToday] = useState<Exercise[]>([]);
  const [all, setAll] = useState<Exercise[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState(params.get("category") ?? "all");
  const [active, setActive] = useState<Exercise | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<{ id: number; ref: string; minutes: number; self_rating: number | null; notes: string | null; day: string }[]>([]);
  const [saved, setSaved] = useState("");

  const load = async () => {
    const [t, c, a] = await Promise.all([
      api<{ exercises: Exercise[] }>("/exercises/today"),
      api<{ categories: Category[]; exercises: Exercise[] }>("/curriculum"),
      api<{ activity: any[] }>("/activity"),
    ]);
    setToday(t.exercises);
    setAll(c.exercises);
    setCats(c.categories);
    setHistory(a.activity.filter((x) => x.kind === "exercise"));
    return { t: t.exercises, all: c.exercises };
  };
  useEffect(() => {
    load().then(({ t, all }) => {
      const start = params.get("start");
      const ex = (start && all.find((e) => e.id === start)) || t.find((e) => !e.done) || null;
      setActive(ex);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (e: Exercise) => {
    setActive(e);
    setElapsed(0);
    setRating(0);
    setNotes("");
    setSaved("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const complete = async () => {
    if (!active) return;
    const minutes = elapsed > 30 ? Math.round((elapsed / 60) * 10) / 10 : active.minutes;
    await api("/activity", { body: { kind: "exercise", ref: active.id, minutes, self_rating: rating || null, notes } });
    setSaved(`Logged ${minutes} min. Nice work.`);
    await load();
  };
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? id;
  const shown = all.filter((e) => filter === "all" || e.category === filter);
  const byId = (id: string) => all.find((e) => e.id === id);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Daily Exercises</h1>
          <p className="muted">Three focused drills picked for your level each day, weighted toward the areas you've practised least.</p>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 24 }}>
        <div className="card span2">
          {active ? (
            <div className="stack">
              <div className="row between wrap">
                <div>
                  <span className="chip">{catName(active.category)}</span>
                  <h2 style={{ marginTop: 8 }}>{active.title}</h2>
                </div>
                <span className="faint small">Suggested time {active.minutes} min</span>
              </div>
              <p>{active.instructions}</p>
              <Timer minutes={active.minutes} onElapsed={setElapsed} />
              <div className="divider" />
              <h3>Self-assessment</h3>
              <div className="small muted">{active.focus}</div>
              <Stars value={rating} onChange={setRating} />
              <textarea rows={2} placeholder="What went well? What will you change next time?" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="row">
                <button className="primary" onClick={complete}><Icon.check /> Mark complete</button>
                {saved && <span className="chip ok">{saved}</span>}
              </div>
            </div>
          ) : (
            <div className="empty">Pick an exercise to begin.</div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Today</h3><span className="chip accent">{today.filter((t) => t.done).length}/{today.length}</span></div>
          {today.map((e) => (
            <div key={e.id} className="list-item" style={{ cursor: "pointer" }} onClick={() => pick(e)}>
              <span className="step-num" style={e.done ? { background: "var(--accent)", color: "#1a1310" } : undefined}>{e.done ? "✓" : ""}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: active?.id === e.id ? 600 : 500 }}>{e.title}</div>
                <div className="faint small">{e.minutes} min · {catName(e.category)}</div>
              </div>
            </div>
          ))}
          <div className="divider" />
          <h4>Recent log</h4>
          {history.slice(0, 6).map((h) => (
            <div key={h.id} className="small row between" style={{ padding: "4px 0" }}>
              <span>{byId(h.ref)?.title ?? h.ref}</span>
              <span className="faint mono">{h.self_rating ? `★${h.self_rating} · ` : ""}{Math.round(h.minutes)}m</span>
            </div>
          ))}
          {!history.length && <div className="faint small">Nothing logged yet.</div>}
        </div>
      </div>

      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Exercise library</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 240 }}>
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid g3">
        {shown.map((e) => (
          <div key={e.id} className="card stack" style={{ gap: 6 }}>
            <div className="row between"><span className="chip">{catName(e.category)}</span><span className="faint small">{e.minutes} min</span></div>
            <strong>{e.title}</strong>
            <div className="small muted" style={{ flex: 1 }}>{e.instructions}</div>
            <div className="row between">
              <span className="faint small" style={{ textTransform: "capitalize" }}>{e.levels.join(" · ")}</span>
              <button className="sm" onClick={() => pick(e)}>Do this</button>
            </div>
          </div>
        ))}
        {!shown.length && <div className="faint">No exercises in this category yet. Gesture, anatomy and composition drills are in the full library.</div>}
      </div>
    </div>
  );
}

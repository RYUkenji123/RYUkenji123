import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Exercise, type User } from "../api";
import { Icon } from "../components/Icons";
import { useSession } from "../App";
import { StatusChip } from "./StudioList";

interface Dash {
  user: User;
  ai: boolean;
  streak: { current: number; practicedToday: boolean; totalDays: number };
  today: Exercise[];
  stats: { id: string; name: string; sessions: number; minutes: number; avg_self_rating: number | null }[];
  lessons: { done: string[]; total: number };
  totals: { exercises: number; minutes: number; drawings: number; references: number };
  projects: { id: number; title: string; analysis_status: "pending" | "running" | "done" | "error"; completed_steps: number; created_at: string }[];
  recommended: Exercise[];
  week: { day: string; minutes: number; n: number }[];
}

const CAT_LINKS: Record<string, string> = { perspective: "/perspective", light: "/light", values: "/studio", shape: "/studio", proportion: "/studio" };

export default function Dashboard() {
  const { refresh } = useSession();
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const load = () => api<Dash>("/dashboard").then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (error) return <div className="page"><div className="notice err">{error}</div></div>;
  if (!d) return <div className="empty"><span className="spinner" /></div>;

  const todayDone = d.today.filter((e) => e.done).length;
  const maxMin = Math.max(30, ...d.stats.map((s) => s.minutes));
  const days = [...Array(7)].map((_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (6 - i));
    const key = dt.toLocaleDateString("en-CA");
    const row = d.week.find((w) => w.day === key);
    return { key, label: dt.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), minutes: row ? Number(row.minutes) : 0, n: row ? Number(row.n) : 0 };
  });
  const weekMax = Math.max(20, ...days.map((x) => x.minutes));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{greeting}, {d.user.name}</h1>
          <p className="muted">{d.streak.practicedToday ? "You've practised today. Keep the momentum going." : "A short session today keeps your streak alive."}</p>
        </div>
        <div className="row">
          <label className="row small faint">
            Skill level
            <select
              value={d.user.skill_level}
              style={{ width: 150 }}
              onChange={async (e) => {
                await api("/me", { method: "PATCH", body: { skill_level: e.target.value } });
                await refresh();
                load();
              }}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <Link to="/studio" className="btn primary"><Icon.upload /> New breakdown</Link>
        </div>
      </div>

      {!d.ai && <div className="notice warn" style={{ marginBottom: 18 }}>AI features (reference analysis, feedback and the tutor) are offline because the server has no Anthropic API key. Everything else works.</div>}

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <span className="l">Daily streak</span>
          <span className="v row" style={{ gap: 6 }}><span style={{ width: 24, color: "var(--accent)", display: "flex" }}><Icon.flame /></span>{d.streak.current} day{d.streak.current === 1 ? "" : "s"}</span>
          <span className="faint small">{d.streak.totalDays} practice days in total</span>
        </div>
        <div className="card stat">
          <span className="l">Practice time</span>
          <span className="v">{d.totals.minutes} min</span>
          <span className="faint small">{d.totals.exercises} exercises logged</span>
        </div>
        <div className="card stat">
          <span className="l">Lessons</span>
          <span className="v">{d.lessons.done.length}/{d.lessons.total}</span>
          <div className="bar"><i style={{ width: `${(d.lessons.done.length / d.lessons.total) * 100}%` }} /></div>
        </div>
        <div className="card stat">
          <span className="l">Studio</span>
          <span className="v">{d.totals.references}</span>
          <span className="faint small">references · {d.totals.drawings} drawings uploaded</span>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 18 }}>
        <div className="card span2">
          <div className="card-head">
            <h2>Today's practice</h2>
            <span className="chip accent">{todayDone}/{d.today.length} done</span>
          </div>
          {d.today.map((e) => (
            <div key={e.id} className="list-item">
              <span className={`step-num`} style={e.done ? { background: "var(--accent)", color: "#1a1310" } : undefined}>{e.done ? "✓" : e.minutes}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{e.title}</div>
                <div className="faint small">{e.minutes} min · {d.stats.find((s) => s.id === e.category)?.name}</div>
              </div>
              <Link to={`/exercises?start=${e.id}`} className="btn sm">{e.done ? "Again" : "Start"}</Link>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h3>This week</h3><span className="faint small">minutes / day</span></div>
          <svg viewBox="0 0 280 140" style={{ width: "100%" }} role="img" aria-label="Practice minutes over the last 7 days">
            {days.map((x, i) => {
              const h = (x.minutes / weekMax) * 100;
              return (
                <g key={x.key}>
                  <rect x={i * 40 + 8} y={110 - Math.max(h, x.n ? 4 : 1)} width={24} height={Math.max(h, x.n ? 4 : 1)} rx={4} fill={i === 6 ? "#d98b4a" : x.n ? "#8a6a4e" : "#36342f"} />
                  <text x={i * 40 + 20} y={128} textAnchor="middle" fill="#837c71" fontSize={11} fontFamily="Inter">{x.label}</text>
                  {x.minutes > 0 && <text x={i * 40 + 20} y={104 - h} textAnchor="middle" fill="#b3ab9e" fontSize={10} fontFamily="Inter">{Math.round(x.minutes)}</text>}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 18 }}>
        <div className="card span2">
          <div className="card-head">
            <h2>Skills progress</h2>
            <span className="faint small">Practice volume (measured) · your self-ratings</span>
          </div>
          <div className="grid g2" style={{ gap: "10px 28px" }}>
            {d.stats.map((s) => (
              <div key={s.id}>
                <div className="row between small"><span>{s.name}</span><span className="faint mono">{s.minutes} min{s.avg_self_rating != null ? ` · ★ ${s.avg_self_rating}` : ""}</span></div>
                <div className="bar"><i style={{ width: `${(s.minutes / maxMin) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="faint small" style={{ marginTop: 12 }}>Bars show time you have logged, not talent. Skill feedback from the AI lives in your Progress page and is labelled as opinion.</div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Recommended next</h3></div>
          <div className="faint small" style={{ marginBottom: 6 }}>Based on the areas you have practised least.</div>
          {d.recommended.map((e) => (
            <div key={e.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{e.title}</div>
                <div className="faint small">{d.stats.find((s) => s.id === e.category)?.name}</div>
              </div>
              <Link to={`/exercises?start=${e.id}`} className="btn sm">Try</Link>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h2>Recent references</h2>
          <Link to="/studio" className="small">All references</Link>
        </div>
        {d.projects.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>No references yet. <Link to="/studio">Upload your first reference</Link> to see the breakdown studio in action.</div>
        ) : (
          <div className="ref-grid">
            {d.projects.map((p) => (
              <Link key={p.id} to={`/studio/${p.id}`} className="ref-card">
                <img src={`/api/projects/${p.id}/image`} alt={p.title} loading="lazy" />
                <div className="meta">
                  <strong>{p.title}</strong>
                  <div className="row between"><StatusChip status={p.analysis_status} /><span className="faint small">{p.completed_steps}/10 steps</span></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <h2>Learning categories</h2>
      <div className="grid g5">
        {d.stats.map((s, i) => (
          <Link key={s.id} to={CAT_LINKS[s.id] ?? `/exercises?category=${s.id}`} className="cat-card">
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <strong>{s.name}</strong>
            <span className="faint small">{s.sessions} sessions</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

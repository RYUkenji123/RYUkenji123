import { useState, type FormEvent } from "react";
import { api } from "../api";

export default function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", skill_level: "beginner" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(mode === "login" ? "/auth/login" : "/auth/register", { body: form });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-art">
        <svg viewBox="0 0 420 300" fill="none" strokeLinecap="round">
          <line x1="0" y1="120" x2="420" y2="120" stroke="#46433e" strokeDasharray="4 6" />
          <circle cx="40" cy="120" r="4" fill="#d98b4a" />
          <circle cx="390" cy="120" r="4" fill="#d98b4a" />
          {[["40", "120", "190", "150"], ["40", "120", "190", "260"], ["390", "120", "190", "150"], ["390", "120", "190", "260"], ["40", "120", "290", "170"], ["390", "120", "110", "175"]].map(([a, b, c, d], i) => (
            <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#d98b4a" strokeOpacity="0.35" />
          ))}
          <path d="M190 150 L290 170 L290 252 L190 260 L110 245 L110 175 Z" stroke="#ece6da" strokeWidth="1.6" />
          <path d="M190 150 L190 260" stroke="#ece6da" strokeWidth="1.6" />
          <path d="M110 175 L205 140 L290 170" stroke="#ece6da" strokeWidth="1.2" strokeOpacity="0.6" />
          <ellipse cx="300" cy="70" rx="36" ry="36" stroke="#ece6da" strokeWidth="1.4" />
          <path d="M278 52 a36 36 0 0 1 48 2" stroke="#d98b4a" strokeWidth="2" />
        </svg>
        <h1>See structure, not just surfaces.</h1>
        <p className="muted" style={{ maxWidth: 440 }}>
          DrawLab breaks any reference into shapes, forms, values and perspective, then walks you through drawing it step by step, with an AI tutor that explains why.
        </p>
      </div>
      <div className="auth-form">
        <form onSubmit={submit}>
          <h2>{mode === "login" ? "Welcome back" : "Create your studio"}</h2>
          {mode === "register" && (
            <label className="field">
              Name
              <input value={form.name} onChange={set("name")} autoComplete="name" />
            </label>
          )}
          <label className="field">
            Email
            <input type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
          </label>
          <label className="field">
            Password
            <input type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {mode === "register" && (
            <label className="field">
              Where are you now?
              <select value={form.skill_level} onChange={set("skill_level")}>
                <option value="beginner">Beginner: I'm learning the basics</option>
                <option value="intermediate">Intermediate: I draw regularly</option>
                <option value="advanced">Advanced: refining my skills</option>
              </select>
            </label>
          )}
          {error && <div className="notice err">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? <span className="spinner" /> : mode === "login" ? "Sign in" : "Create account"}</button>
          <button type="button" className="ghost" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

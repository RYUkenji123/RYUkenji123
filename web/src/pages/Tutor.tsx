import { useEffect, useRef, useState } from "react";
import { api, type Drawing, type Project } from "../api";
import { Icon } from "../components/Icons";
import { Markdown } from "../components/Markdown";
import { useSession } from "../App";

interface Msg { id?: number; role: "user" | "assistant"; content: string; attachment?: { kind: string; id: number; title: string } | null }

const STARTERS = [
  "Why does my drawing look flat?",
  "How do I construct a coffee mug?",
  "How do I find the vanishing point in a photo?",
  "Why does my shading look muddy?",
  "How can I improve my proportions?",
  "What should I practise next?",
];

export default function Tutor() {
  const { ai } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attach, setAttach] = useState("");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    api<{ messages: Msg[] }>("/tutor/messages").then((r) => setMsgs(r.messages)).catch(() => {});
    api<{ drawings: Drawing[] }>("/drawings").then((r) => setDrawings(r.drawings)).catch(() => {});
    api<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects)).catch(() => {});
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError("");
    setBusy(true);
    const [kind, idStr] = attach ? attach.split(":") : [null, null];
    const title = kind === "drawing" ? drawings.find((d) => d.id === Number(idStr))?.title : projects.find((p) => p.id === Number(idStr))?.title;
    const userMsg: Msg = { role: "user", content: q, attachment: kind ? { kind, id: Number(idStr), title: title ?? "" } : null };
    setMsgs((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setAttach("");
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, attachment: kind ? { kind, id: Number(idStr) } : null }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Tutor unavailable (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx).replace(/^data: /, "");
          buf = buf.slice(idx + 2);
          if (!chunk) continue;
          const ev = JSON.parse(chunk);
          if (ev.type === "delta") setMsgs((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + ev.text }; return c; });
          else if (ev.type === "error") throw new Error(ev.error);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setMsgs((m) => (m[m.length - 1]?.role === "assistant" && !m[m.length - 1].content ? m.slice(0, -2) : m));
        setInput(q);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ height: "100%", paddingBottom: 20 }}>
      <div className="chat">
        <div className="page-head" style={{ marginBottom: 10 }}>
          <div>
            <h1>AI Drawing Tutor</h1>
            <p className="muted">Ask about anything you're stuck on. The tutor explains the principle first, then gives you an exercise.</p>
          </div>
          {msgs.length > 0 && <button className="ghost sm" onClick={async () => { if (confirm("Clear the conversation?")) { await api("/tutor/messages", { method: "DELETE" }); setMsgs([]); } }}>New conversation</button>}
        </div>

        <div className="chat-log" ref={log} aria-live="polite">
          {msgs.length === 0 && (
            <div className="stack" style={{ marginTop: 30 }}>
              <div className="faint">Try one of these, or attach a drawing or reference and ask about it:</div>
              <div className="suggest">{STARTERS.map((s) => <button key={s} onClick={() => send(s)} disabled={!ai}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" && <div className="who">DrawLab Tutor</div>}
              {m.attachment && (
                <div className="row small faint" style={{ marginBottom: 6 }}>
                  <img className="thumb" style={{ width: 40, height: 40 }} src={`/api/${m.attachment.kind === "drawing" ? "drawings" : "projects"}/${m.attachment.id}/image`} alt="" /> {m.attachment.title}
                </div>
              )}
              {m.role === "assistant" ? (m.content ? <Markdown text={m.content} /> : <span className="spinner" />) : <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>}
            </div>
          ))}
        </div>

        <div className="stack">
          {!ai && <div className="notice warn small">The tutor needs an Anthropic API key on the server (ANTHROPIC_API_KEY).</div>}
          {error && <div className="notice err small">{error}</div>}
          <div className="composer">
            <textarea
              rows={2}
              placeholder="Ask the tutor… e.g. 'My cylinders look wobbly, why?'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              disabled={!ai}
            />
            <div className="row">
              <span style={{ width: 16, color: "var(--text-3)", display: "flex" }}><Icon.paperclip /></span>
              <select value={attach} onChange={(e) => setAttach(e.target.value)} style={{ width: "auto", maxWidth: 260, padding: "4px 8px", fontSize: 12.5 }} disabled={!ai}>
                <option value="">No image attached</option>
                {drawings.length > 0 && <optgroup label="My drawings">{drawings.map((d) => <option key={d.id} value={`drawing:${d.id}`}>{d.title}</option>)}</optgroup>}
                {projects.length > 0 && <optgroup label="References">{projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.title}</option>)}</optgroup>}
              </select>
              <span style={{ flex: 1 }} />
              {busy ? <button onClick={() => abort.current?.abort()}>Stop</button> : <button className="primary" onClick={() => send(input)} disabled={!input.trim() || !ai}><Icon.send /> Send</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

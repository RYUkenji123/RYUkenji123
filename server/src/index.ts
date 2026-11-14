import express, { type Request, type Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { all, one, run, UPLOAD_DIR } from "./db.js";
import { createSession, destroySession, hashPassword, requireAuth, verifyPassword, type AuthedRequest } from "./auth.js";
import { aiConfigured, analyzeReference, critiqueDrawing, describeAiError, MODEL, streamTutor } from "./ai.js";
import { CATEGORIES, dailyExercises, EXERCISES, LESSONS, type Level } from "./curriculum.js";

const app = express();
app.use(express.json({ limit: "25mb" }));

type Mime = "image/jpeg" | "image/png" | "image/webp";
const EXT: Record<Mime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME_BY_EXT: Record<string, Mime> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function saveDataUrl(dataUrl: unknown): string {
  if (typeof dataUrl !== "string") throw new HttpError(400, "Missing image");
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(415, "Unsupported image. Please upload a JPEG, PNG or WebP file.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 15 * 1024 * 1024) throw new HttpError(413, "Image is too large (max 15 MB).");
  const file = `${crypto.randomUUID()}.${EXT[m[1] as Mime]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return file;
}
function loadImage(file: string): { data: string; mediaType: Mime } {
  const ext = file.split(".").pop() ?? "";
  return { data: fs.readFileSync(path.join(UPLOAD_DIR, file)).toString("base64"), mediaType: MIME_BY_EXT[ext] ?? "image/jpeg" };
}
function sendImage(res: Response, file: string) {
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(UPLOAD_DIR, file));
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const wrap =
  (fn: (req: AuthedRequest, res: Response) => unknown) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req as AuthedRequest, res);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  };

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

// --------------------------------------------------------------------------- auth
app.get("/api/health", (_req, res) => res.json({ ok: true, ai: aiConfigured(), model: MODEL }));

app.post(
  "/api/auth/register",
  wrap((req, res) => {
    const { email, password, name, skill_level } = req.body ?? {};
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a valid email");
    if (typeof password !== "string" || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
    if (one("SELECT id FROM users WHERE email = ?", email.toLowerCase())) throw new HttpError(409, "An account with that email already exists");
    const level = ["beginner", "intermediate", "advanced"].includes(skill_level) ? skill_level : "beginner";
    const r = run(
      "INSERT INTO users (email, name, password_hash, skill_level) VALUES (?, ?, ?, ?)",
      email.toLowerCase(),
      typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : email.split("@")[0],
      hashPassword(password),
      level,
    );
    createSession(res, Number(r.lastInsertRowid));
    res.json({ ok: true });
  }),
);

app.post(
  "/api/auth/login",
  wrap((req, res) => {
    const { email, password } = req.body ?? {};
    const u = typeof email === "string" ? one("SELECT * FROM users WHERE email = ?", email.toLowerCase()) : undefined;
    if (!u || typeof password !== "string" || !verifyPassword(password, u.password_hash)) throw new HttpError(401, "Wrong email or password");
    createSession(res, u.id);
    res.json({ ok: true });
  }),
);

app.post("/api/auth/logout", (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

app.use("/api", requireAuth);

app.get("/api/me", wrap((req, res) => res.json({ user: req.user, ai: aiConfigured() })));
app.patch(
  "/api/me",
  wrap((req, res) => {
    const { skill_level, name } = req.body ?? {};
    if (["beginner", "intermediate", "advanced"].includes(skill_level)) run("UPDATE users SET skill_level = ? WHERE id = ?", skill_level, req.user.id);
    if (typeof name === "string" && name.trim()) run("UPDATE users SET name = ? WHERE id = ?", name.trim().slice(0, 60), req.user.id);
    res.json({ ok: true });
  }),
);

// --------------------------------------------------------------------------- curriculum + dashboard
app.get("/api/curriculum", (_req, res) => res.json({ categories: CATEGORIES, exercises: EXERCISES, lessons: LESSONS }));

function categoryStats(userId: number) {
  const rows = all(
    "SELECT category, COUNT(*) AS n, SUM(minutes) AS minutes, AVG(self_rating) AS avg_rating FROM activity WHERE user_id = ? AND category IS NOT NULL GROUP BY category",
    userId,
  );
  return CATEGORIES.map((c) => {
    const r = rows.find((x) => x.category === c.id);
    return {
      id: c.id,
      name: c.name,
      sessions: r ? Number(r.n) : 0,
      minutes: r ? Math.round(Number(r.minutes ?? 0)) : 0,
      avg_self_rating: r?.avg_rating != null ? Math.round(Number(r.avg_rating) * 10) / 10 : null,
    };
  });
}

function streak(userId: number) {
  const days = new Set(all("SELECT DISTINCT day FROM activity WHERE user_id = ?", userId).map((r) => r.day as string));
  let count = 0;
  const d = new Date();
  if (!days.has(d.toLocaleDateString("en-CA"))) d.setDate(d.getDate() - 1); // streak still alive until end of today
  while (days.has(d.toLocaleDateString("en-CA"))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return { current: count, practicedToday: days.has(today()), totalDays: days.size };
}

function todaysExercises(user: AuthedRequest["user"]) {
  const stats = categoryStats(user.id);
  const weak = [...stats].sort((a, b) => a.minutes - b.minutes).map((s) => s.id);
  const picks = dailyExercises(user.id, user.skill_level as Level, today(), weak);
  const done = new Set(all("SELECT ref FROM activity WHERE user_id = ? AND kind = 'exercise' AND day = ?", user.id, today()).map((r) => r.ref));
  return picks.map((e) => ({ ...e, done: done.has(e.id) }));
}

app.get(
  "/api/dashboard",
  wrap((req, res) => {
    const u = req.user;
    const stats = categoryStats(u.id);
    const lessonsDone = all("SELECT DISTINCT ref FROM activity WHERE user_id = ? AND kind = 'lesson'", u.id).map((r) => r.ref);
    const totalLessons = LESSONS.perspective.length + LESSONS.light.length;
    const exercisesDone = Number(one("SELECT COUNT(*) AS n FROM activity WHERE user_id = ? AND kind = 'exercise'", u.id)?.n ?? 0);
    const minutes = Number(one("SELECT COALESCE(SUM(minutes),0) AS m FROM activity WHERE user_id = ?", u.id)?.m ?? 0);
    const projects = all(
      "SELECT id, title, width, height, analysis_status, completed_steps, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 6",
      u.id,
    ).map((p) => ({ ...p, completed_steps: parseJson<number[]>(p.completed_steps, []).length }));
    const drawings = Number(one("SELECT COUNT(*) AS n FROM drawings WHERE user_id = ?", u.id)?.n ?? 0);
    const weakest = [...stats].sort((a, b) => a.minutes - b.minutes).slice(0, 3);
    const recommended = weakest
      .map((w) => EXERCISES.find((e) => e.category === w.id && e.levels.includes(u.skill_level as Level)) ?? EXERCISES.find((e) => e.category === w.id))
      .filter(Boolean);
    const week = all(
      "SELECT day, SUM(minutes) AS minutes, COUNT(*) AS n FROM activity WHERE user_id = ? AND day >= date('now','localtime','-6 days') GROUP BY day",
      u.id,
    );
    res.json({
      user: u,
      ai: aiConfigured(),
      streak: streak(u.id),
      today: todaysExercises(u),
      stats,
      lessons: { done: lessonsDone, total: totalLessons },
      totals: { exercises: exercisesDone, minutes: Math.round(minutes), drawings, references: Number(one("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", u.id)?.n ?? 0) },
      projects,
      recommended,
      week,
    });
  }),
);

// --------------------------------------------------------------------------- activity
app.get("/api/exercises/today", wrap((req, res) => res.json({ exercises: todaysExercises(req.user) })));

app.post(
  "/api/activity",
  wrap((req, res) => {
    const { kind, ref, minutes, self_rating, notes } = req.body ?? {};
    if (!["exercise", "lesson"].includes(kind) || typeof ref !== "string") throw new HttpError(400, "Invalid activity");
    let category: string | null = null;
    if (kind === "exercise") {
      const ex = EXERCISES.find((e) => e.id === ref);
      if (!ex) throw new HttpError(404, "Unknown exercise");
      category = ex.category;
    } else {
      if (LESSONS.perspective.some((l) => l.id === ref)) category = "perspective";
      else if (LESSONS.light.some((l) => l.id === ref)) category = "light";
      else throw new HttpError(404, "Unknown lesson");
      if (one("SELECT id FROM activity WHERE user_id = ? AND kind = 'lesson' AND ref = ?", req.user.id, ref)) return res.json({ ok: true, duplicate: true });
    }
    const rating = Number.isInteger(self_rating) && self_rating >= 1 && self_rating <= 5 ? self_rating : null;
    run(
      "INSERT INTO activity (user_id, kind, ref, category, minutes, self_rating, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      req.user.id,
      kind,
      ref,
      category,
      Math.max(0, Math.min(600, Number(minutes) || 0)),
      rating,
      typeof notes === "string" ? notes.slice(0, 2000) : null,
    );
    res.json({ ok: true });
  }),
);

app.get(
  "/api/activity",
  wrap((req, res) => {
    res.json({ activity: all("SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", req.user.id) });
  }),
);

// --------------------------------------------------------------------------- reference projects
const projectOut = (p: Record<string, any>) => ({
  id: p.id,
  title: p.title,
  width: p.width,
  height: p.height,
  analysis: parseJson(p.analysis_json, null),
  analysis_status: p.analysis_status,
  analysis_error: p.analysis_error,
  completed_steps: parseJson<number[]>(p.completed_steps, []),
  created_at: p.created_at,
});
function getProject(req: AuthedRequest) {
  const p = one("SELECT * FROM projects WHERE id = ? AND user_id = ?", Number(req.params.id), req.user.id);
  if (!p) throw new HttpError(404, "Reference not found");
  return p;
}

app.get(
  "/api/projects",
  wrap((req, res) => {
    const rows = all("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", req.user.id);
    res.json({ projects: rows.map((p) => ({ ...projectOut(p), analysis: undefined, subject: parseJson<any>(p.analysis_json, null)?.analysis?.subject ?? null })) });
  }),
);

app.post(
  "/api/projects",
  wrap((req, res) => {
    const { image, title, width, height } = req.body ?? {};
    const w = Number(width), h = Number(height);
    if (!(w > 0 && h > 0)) throw new HttpError(400, "Missing image dimensions");
    const file = saveDataUrl(image);
    const r = run(
      "INSERT INTO projects (user_id, title, image_file, width, height) VALUES (?, ?, ?, ?, ?)",
      req.user.id,
      typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "Untitled reference",
      file,
      Math.round(w),
      Math.round(h),
    );
    res.json({ project: projectOut(one("SELECT * FROM projects WHERE id = ?", Number(r.lastInsertRowid))!) });
  }),
);

app.get("/api/projects/:id", wrap((req, res) => res.json({ project: projectOut(getProject(req)) })));
app.get("/api/projects/:id/image", wrap((req, res) => sendImage(res, getProject(req).image_file)));

app.delete(
  "/api/projects/:id",
  wrap((req, res) => {
    const p = getProject(req);
    run("DELETE FROM projects WHERE id = ?", p.id);
    fs.rmSync(path.join(UPLOAD_DIR, p.image_file), { force: true });
    res.json({ ok: true });
  }),
);

const analyzing = new Set<number>();
app.post(
  "/api/projects/:id/analyze",
  wrap(async (req, res) => {
    const p = getProject(req);
    if (analyzing.has(p.id)) throw new HttpError(409, "Analysis already running");
    analyzing.add(p.id);
    run("UPDATE projects SET analysis_status = 'running', analysis_error = NULL WHERE id = ?", p.id);
    try {
      const img = loadImage(p.image_file);
      const { analysis, model } = await analyzeReference(img.data, img.mediaType, p.width, p.height, p.title);
      const stored = { model, analyzed_at: new Date().toISOString(), analysis };
      run("UPDATE projects SET analysis_json = ?, analysis_status = 'done', updated_at = datetime('now') WHERE id = ?", JSON.stringify(stored), p.id);
      run("INSERT INTO activity (user_id, kind, ref, category, minutes) VALUES (?, 'analysis', ?, 'shape', 0)", req.user.id, String(p.id));
      res.json({ project: projectOut(one("SELECT * FROM projects WHERE id = ?", p.id)!) });
    } catch (err) {
      const { status, message } = describeAiError(err);
      if (status >= 500 && !(err instanceof Error && err.name === "AiUnavailableError")) console.error(err);
      // keep a previous successful analysis usable if a re-analysis fails
      run("UPDATE projects SET analysis_status = ?, analysis_error = ? WHERE id = ?", p.analysis_json ? "done" : "error", message, p.id);
      res.status(status).json({ error: message });
    } finally {
      analyzing.delete(p.id);
    }
  }),
);

app.patch(
  "/api/projects/:id/steps",
  wrap((req, res) => {
    const p = getProject(req);
    const { step, done } = req.body ?? {};
    if (!Number.isInteger(step) || step < 0 || step > 20) throw new HttpError(400, "Invalid step");
    const steps = new Set(parseJson<number[]>(p.completed_steps, []));
    if (done) steps.add(step);
    else steps.delete(step);
    run("UPDATE projects SET completed_steps = ? WHERE id = ?", JSON.stringify([...steps].sort((a, b) => a - b)), p.id);
    if (done) run("INSERT INTO activity (user_id, kind, ref, category, minutes) VALUES (?, 'step', ?, 'still_life', 5)", req.user.id, `${p.id}:${step}`);
    res.json({ completed_steps: [...steps] });
  }),
);

// --------------------------------------------------------------------------- drawings / progress
const CRITERIA = ["shape", "proportion", "perspective", "values", "line", "consistency"];
const drawingOut = (d: Record<string, any>) => ({
  id: d.id,
  title: d.title,
  project_id: d.project_id,
  self_scores: parseJson(d.self_scores, {}),
  notes: d.notes,
  ai_feedback: parseJson(d.ai_feedback, null),
  created_at: d.created_at,
});
function getDrawing(req: AuthedRequest) {
  const d = one("SELECT * FROM drawings WHERE id = ? AND user_id = ?", Number(req.params.id), req.user.id);
  if (!d) throw new HttpError(404, "Drawing not found");
  return d;
}

app.get("/api/drawings", wrap((req, res) => res.json({ drawings: all("SELECT * FROM drawings WHERE user_id = ? ORDER BY created_at ASC", req.user.id).map(drawingOut) })));

app.post(
  "/api/drawings",
  wrap((req, res) => {
    const { image, title, project_id, self_scores, notes } = req.body ?? {};
    const scores: Record<string, number> = {};
    for (const k of CRITERIA) {
      const v = Number(self_scores?.[k]);
      if (Number.isInteger(v) && v >= 1 && v <= 5) scores[k] = v;
    }
    let pid: number | null = null;
    if (project_id != null) {
      const p = one("SELECT id FROM projects WHERE id = ? AND user_id = ?", Number(project_id), req.user.id);
      pid = p ? Number(p.id) : null;
    }
    const file = saveDataUrl(image);
    const r = run(
      "INSERT INTO drawings (user_id, title, image_file, project_id, self_scores, notes) VALUES (?, ?, ?, ?, ?, ?)",
      req.user.id,
      typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "Untitled drawing",
      file,
      pid,
      JSON.stringify(scores),
      typeof notes === "string" ? notes.slice(0, 2000) : "",
    );
    run("INSERT INTO activity (user_id, kind, ref, category, minutes) VALUES (?, 'drawing', ?, 'still_life', 0)", req.user.id, String(r.lastInsertRowid));
    res.json({ drawing: drawingOut(one("SELECT * FROM drawings WHERE id = ?", Number(r.lastInsertRowid))!) });
  }),
);

app.get("/api/drawings/:id/image", wrap((req, res) => sendImage(res, getDrawing(req).image_file)));
app.delete(
  "/api/drawings/:id",
  wrap((req, res) => {
    const d = getDrawing(req);
    run("DELETE FROM drawings WHERE id = ?", d.id);
    fs.rmSync(path.join(UPLOAD_DIR, d.image_file), { force: true });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/drawings/:id/feedback",
  wrap(async (req, res) => {
    const d = getDrawing(req);
    const ref = d.project_id ? one("SELECT * FROM projects WHERE id = ?", d.project_id) : undefined;
    try {
      const fb = await critiqueDrawing(
        loadImage(d.image_file),
        ref ? loadImage(ref.image_file) : null,
        `Title: ${d.title}. Student level: ${req.user.skill_level}. Student notes: ${d.notes || "(none)"}.${ref ? "" : " No reference image was provided."}`,
      );
      const stored = { ...fb, model: MODEL, generated_at: new Date().toISOString() };
      run("UPDATE drawings SET ai_feedback = ? WHERE id = ?", JSON.stringify(stored), d.id);
      res.json({ drawing: drawingOut(one("SELECT * FROM drawings WHERE id = ?", d.id)!) });
    } catch (err) {
      const { status, message } = describeAiError(err);
      res.status(status).json({ error: message });
    }
  }),
);

// --------------------------------------------------------------------------- tutor
app.get(
  "/api/tutor/messages",
  wrap((req, res) => {
    res.json({
      messages: all("SELECT id, role, content, attachment, created_at FROM tutor_messages WHERE user_id = ? ORDER BY id ASC", req.user.id).map((m) => ({
        ...m,
        attachment: parseJson(m.attachment, null),
      })),
    });
  }),
);
app.delete(
  "/api/tutor/messages",
  wrap((req, res) => {
    run("DELETE FROM tutor_messages WHERE user_id = ?", req.user.id);
    res.json({ ok: true });
  }),
);

app.post(
  "/api/tutor/chat",
  wrap(async (req, res) => {
    const { message, attachment } = req.body ?? {};
    if (typeof message !== "string" || !message.trim()) throw new HttpError(400, "Empty message");
    let att: { kind: "drawing" | "project"; id: number; title: string } | null = null;
    let attImage: { data: string; mediaType: Mime } | null = null;
    let attContext = "";
    if (attachment?.kind === "drawing" || attachment?.kind === "project") {
      const table = attachment.kind === "drawing" ? "drawings" : "projects";
      const row = one(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`, Number(attachment.id), req.user.id);
      if (row) {
        att = { kind: attachment.kind, id: row.id, title: row.title };
        attImage = loadImage(row.image_file);
        if (attachment.kind === "project") {
          const a = parseJson<any>(row.analysis_json, null)?.analysis;
          if (a) attContext = `\n[DrawLab analysis of this reference: subject=${a.subject}; perspective=${a.perspective?.type}; light=${a.light?.description}; summary=${a.summary}]`;
        }
      }
    }

    const history = all("SELECT role, content, attachment FROM tutor_messages WHERE user_id = ? ORDER BY id DESC LIMIT 20", req.user.id).reverse();
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => {
      const a = parseJson<any>(m.attachment, null);
      return { role: m.role as "user" | "assistant", content: a ? `${m.content}\n[The student attached their ${a.kind === "drawing" ? "drawing" : "reference"} "${a.title}" here.]` : m.content };
    });
    while (messages.length && messages[0].role !== "user") messages.shift();
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (attImage) content.push({ type: "image", source: { type: "base64", media_type: attImage.mediaType, data: attImage.data } });
    content.push({ type: "text", text: message.slice(0, 8000) + attContext });
    messages.push({ role: "user", content });

    const stats = categoryStats(req.user.id);
    const learnerContext = `Learner: ${req.user.name}, self-reported level: ${req.user.skill_level}. Practice minutes by category: ${stats
      .map((s) => `${s.name}=${s.minutes}`)
      .join(", ")}.`;

    let stream;
    try {
      stream = streamTutor(messages, learnerContext);
    } catch (err) {
      const { status, message: msg } = describeAiError(err);
      return res.status(status).json({ error: msg });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    let text = "";
    let closed = false;
    // res 'close' fires when the client disconnects (req 'close' fires as soon as the body is read).
    res.on("close", () => {
      if (res.writableEnded) return;
      closed = true;
      stream.abort();
    });
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          text += ev.delta.text;
          send({ type: "delta", text: ev.delta.text });
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        text ||= "I can't help with that one. Try asking about a drawing concept instead.";
        send({ type: "delta", text });
      }
      run("INSERT INTO tutor_messages (user_id, role, content, attachment) VALUES (?, 'user', ?, ?)", req.user.id, message.slice(0, 8000), att ? JSON.stringify(att) : null);
      run("INSERT INTO tutor_messages (user_id, role, content) VALUES (?, 'assistant', ?)", req.user.id, text);
      send({ type: "done" });
    } catch (err) {
      if (!closed) send({ type: "error", error: describeAiError(err).message });
    }
    res.end();
  }),
);

// --------------------------------------------------------------------------- static frontend (production)
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(
    express.static(webDist, {
      setHeaders(res, file) {
        // Hashed bundles can be cached forever; the service worker, manifest and HTML must update promptly.
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "no-cache");
        if (file.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
      },
    }),
  );
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`DrawLab API listening on http://localhost:${port} (AI ${aiConfigured() ? "enabled, model " + MODEL : "NOT configured: set ANTHROPIC_API_KEY"})`);
});

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Reads a user-selected image, downsizes it (long edge <= maxEdge) and returns a JPEG data URL. */
export async function fileToDataUrl(file: File, maxEdge = 1600): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(file.type)) throw new Error("Unsupported file type. Please choose a JPEG, PNG or WebP image.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file could not be read as an image."));
      i.src = url;
    });
    if (img.naturalWidth < 64 || img.naturalHeight < 64) throw new Error("Image is too small to analyze (minimum 64×64 px).");
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; // flatten transparency
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: c.toDataURL("image/jpeg", 0.9), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface User { id: number; email: string; name: string; skill_level: "beginner" | "intermediate" | "advanced" }
export interface Exercise { id: string; category: string; title: string; instructions: string; minutes: number; levels: string[]; focus: string; done?: boolean }
export interface Category { id: string; name: string; blurb: string }

export type Pt = { x: number; y: number };
export type Line = { x1: number; y1: number; x2: number; y2: number };
export interface Analysis {
  analyzable: boolean;
  confidence: "high" | "medium" | "low";
  subject: string;
  summary: string;
  ambiguities: string[];
  difficulty: string;
  silhouette: { description: string; points: Pt[] };
  shapes: { kind: string; role: "primary" | "secondary" | "tertiary"; label: string; explanation: string; center: Pt; width: number; height: number; rotation_deg: number; points: Pt[] }[];
  negative_spaces: { label: string; points: Pt[]; explanation: string }[];
  proportional_relationships: string[];
  forms: { kind: string; label: string; center: Pt; width: number; height: number; rotation_deg: number; axis: Line; ellipse_ratio: number; rotation_explanation: string; construction_tip: string }[];
  form_explanation: string;
  light: { present: boolean; direction_deg: number; elevation: string; quality: string; description: string; regions: { type: string; label: string; points: Pt[]; explanation: string }[] };
  perspective: {
    type: string;
    explanation: string;
    horizon_y: number | null;
    eye_level: string;
    vanishing_points: { label: string; x: number; y: number }[];
    converging_lines: (Line & { vp_index: number })[];
    planes: { label: string; points: Pt[] }[];
    distortion_notes: string;
  };
  proportions: {
    subject_box: { x: number; y: number; w: number; h: number };
    unit_label: string;
    landmarks: { label: string; x: number; y: number }[];
    measurements: { label: string; explanation: string }[];
    alignment_lines: (Line & { label: string })[];
    symmetry: { present: boolean; axis: Line; explanation: string };
    guidance: string[];
  };
  steps: { title: string; explanation: string; practice_task: string; layers: string[] }[];
  key_lessons: string[];
}
export interface Project {
  id: number;
  title: string;
  width: number;
  height: number;
  analysis: { model: string; analyzed_at: string; analysis: Analysis } | null;
  analysis_status: "pending" | "running" | "done" | "error";
  analysis_error: string | null;
  completed_steps: number[];
  created_at: string;
  subject?: string | null;
}
export interface Criterion { observation: string; estimate: number; next_step: string }
export interface Feedback {
  readable: boolean;
  overall: string;
  strengths: string[];
  shape_accuracy: Criterion;
  proportions: Criterion;
  perspective: Criterion;
  value_control: Criterion;
  line_quality: Criterion;
  priority_exercise: string;
  caveats: string;
  model: string;
  generated_at: string;
}
export interface Drawing { id: number; title: string; project_id: number | null; self_scores: Record<string, number>; notes: string; ai_feedback: Feedback | null; created_at: string }

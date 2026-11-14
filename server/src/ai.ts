import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = process.env.DRAWLAB_MODEL ?? "claude-opus-5-5";
// Server-side refusal fallback: if a safety classifier declines, the API reroutes
// the same request to a suitable fallback model within the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AiUnavailableError extends Error {}

let client: Anthropic | null = null;
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}
function getClient(): Anthropic {
  if (!aiConfigured()) {
    throw new AiUnavailableError(
      "AI analysis is not configured on this server. Set ANTHROPIC_API_KEY and restart the backend. Local image processing (value studies, edges, line detection) still works.",
    );
  }
  if (!client) client = new Anthropic();
  return client;
}

/** Converts SDK errors into messages that are safe and useful to show in the UI. */
export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof AiUnavailableError) return { status: 503, message: err.message };
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 503, message: "The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY." };
  if (err instanceof Anthropic.RateLimitError)
    return { status: 429, message: "The AI service is rate limited right now. Please try again in a minute." };
  if (err instanceof Anthropic.BadRequestError)
    return { status: 400, message: `The AI service rejected the request: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError)
    return { status: 502, message: "Could not reach the AI service. Check the server's network connection." };
  if (err instanceof Anthropic.APIError)
    return { status: 502, message: `AI service error (${err.status ?? "unknown"}). Please retry.` };
  if (err instanceof Error) return { status: 500, message: err.message };
  return { status: 500, message: "Unknown error" };
}

// ---------------------------------------------------------------------------
// Reference analysis schema. All coordinates are normalized: x = 0 at the left
// edge and 1 at the right edge, y = 0 at the top and 1 at the bottom.
// ---------------------------------------------------------------------------
const Pt = z.object({ x: z.number(), y: z.number() });
const Line = z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() });

const Shape = z.object({
  kind: z.enum(["circle", "ellipse", "rectangle", "triangle", "polygon", "organic"]),
  role: z.enum(["primary", "secondary", "tertiary"]),
  label: z.string(),
  explanation: z.string().describe("Why this simplification fits and what to watch for."),
  center: Pt,
  width: z.number().describe("Normalized width of the shape's bounding extent."),
  height: z.number().describe("Normalized height of the shape's bounding extent."),
  rotation_deg: z.number().describe("Clockwise rotation in degrees for circle/ellipse/rectangle."),
  points: z.array(Pt).describe("Outline vertices for triangle/polygon/organic shapes, clockwise. Empty for circle/ellipse/rectangle."),
});

const Form = z.object({
  kind: z.enum(["sphere", "ellipsoid", "cube", "box", "cylinder", "cone", "organic_mass"]),
  label: z.string(),
  center: Pt,
  width: z.number(),
  height: z.number(),
  rotation_deg: z.number(),
  axis: Line.describe("The form's central axis (cylinder/cone length axis, box vertical axis, sphere pole axis). For cones, (x1,y1) is the apex and (x2,y2) the base centre."),
  ellipse_ratio: z
    .number()
    .describe("For cylinders/cones: minor/major ratio of the visible end ellipse (0 = edge-on, 1 = facing viewer). 0 if not applicable."),
  rotation_explanation: z.string().describe("How the form is turned/tilted in space relative to the viewer."),
  construction_tip: z.string(),
});

const ToneRegion = z.object({
  type: z.enum(["highlight", "light", "halftone", "core_shadow", "reflected_light", "cast_shadow", "occlusion_shadow"]),
  label: z.string(),
  points: z.array(Pt).describe("Approximate outline polygon of the region."),
  explanation: z.string(),
});

const Step = z.object({
  title: z.string(),
  explanation: z.string().describe("What to do and the principle behind it, specific to this reference."),
  practice_task: z.string().describe("A short focused exercise the learner can do for this step."),
  layers: z
    .array(
      z.enum([
        "silhouette",
        "primary_shapes",
        "secondary_shapes",
        "negative_space",
        "forms",
        "form_axes",
        "landmarks",
        "alignment",
        "symmetry",
        "perspective",
        "light",
        "tone_regions",
        "value_2",
        "value_3",
        "value_5",
        "edges",
      ]),
    )
    .describe("Overlay layers that best demonstrate this step."),
});

export const AnalysisSchema = z.object({
  analyzable: z.boolean().describe("False if the image is not a usable drawing reference (blank, abstract noise, text-only, too blurry)."),
  confidence: z.enum(["high", "medium", "low"]),
  subject: z.string(),
  summary: z.string().describe("2-3 sentences: what makes this reference look the way it does."),
  ambiguities: z.array(z.string()).describe("Anything uncertain about the analysis (occlusions, unclear light, lens distortion, cropping)."),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  silhouette: z.object({
    description: z.string(),
    points: z.array(Pt).describe("Outline of the main subject's overall silhouette, 12-40 points, clockwise."),
  }),
  shapes: z.array(Shape).describe("3-12 simple 2D shapes, largest first."),
  negative_spaces: z.array(
    z.object({ label: z.string(), points: z.array(Pt), explanation: z.string() }),
  ),
  proportional_relationships: z.array(z.string()).describe("E.g. 'The head fits about 3 times into the torso height'."),
  forms: z.array(Form).describe("2-10 basic 3D forms the subject simplifies into."),
  form_explanation: z.string().describe("How complicated parts reduce to these forms and how they connect/overlap."),
  light: z.object({
    present: z.boolean(),
    direction_deg: z
      .number()
      .describe("Direction the light comes FROM, as an angle on the picture plane: 0 = from the right, 90 = from the top, 180 = from the left, 270 = from below."),
    elevation: z.enum(["front", "high", "side", "low", "back", "diffuse"]),
    quality: z.enum(["hard", "soft", "mixed"]),
    description: z.string(),
    regions: z.array(ToneRegion),
  }),
  perspective: z.object({
    type: z.enum(["none_or_flat", "one_point", "two_point", "three_point", "curvilinear", "ambiguous"]),
    explanation: z.string().describe("Why this perspective type, citing visible evidence."),
    horizon_y: z.number().nullable().describe("Normalized y of the horizon / eye level; may be <0 or >1 if off-image; null if unknown."),
    eye_level: z.string().describe("Where the viewer's eye is relative to the subject (e.g. looking slightly down on it)."),
    vanishing_points: z.array(z.object({ label: z.string(), x: z.number(), y: z.number() })).describe("May lie outside 0-1."),
    converging_lines: z.array(Line.extend({ vp_index: z.number().int() })).describe("Visible edges that recede toward each vanishing point."),
    planes: z.array(z.object({ label: z.string(), points: z.array(Pt) })),
    distortion_notes: z.string(),
  }),
  proportions: z.object({
    subject_box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).describe("Bounding box of the main subject (normalized)."),
    unit_label: z.string().describe("A measuring unit the artist can use, e.g. 'head height' or 'width of the cup rim'."),
    landmarks: z.array(z.object({ label: z.string(), x: z.number(), y: z.number() })),
    measurements: z.array(z.object({ label: z.string(), explanation: z.string() })),
    alignment_lines: z.array(Line.extend({ label: z.string() })),
    symmetry: z.object({ present: z.boolean(), axis: Line, explanation: z.string() }),
    guidance: z.array(z.string()),
  }),
  steps: z.array(Step).describe("Exactly 10 steps following the construction-first process."),
  key_lessons: z.array(z.string()).describe("3-5 transferable principles this reference teaches."),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const ANALYSIS_SYSTEM = `You are DrawLab, a patient drawing instructor with an atelier background. You analyze reference photos so a beginner-to-intermediate artist understands WHY the subject looks the way it does and HOW to construct it.

Rules:
- Ground every claim in what is actually visible in this specific image. Never pad with generic content.
- Coordinates are normalized to the image: x=0 left edge, x=1 right edge, y=0 top edge, y=1 bottom edge. Place overlays carefully on the real features; they are drawn directly over the photo.
- Prefer few, large, honest simplifications over many tiny ones.
- If something is uncertain (light direction, perspective type, hidden structure), say so in "ambiguities" and lower "confidence" rather than inventing certainty. Use perspective type "ambiguous" or "none_or_flat" when there is no clear evidence.
- If the image is not a usable reference (blank, pure texture, text, extremely blurry), set analyzable=false, explain in summary/ambiguities, and keep the arrays minimal.
- The 10 steps follow: silhouette -> largest shapes -> proportions/landmarks -> 3D forms -> perspective/construction lines -> contours/details -> light direction -> big value masses -> shadows/highlights -> refinement. Make each explanation and practice task specific to this reference.
- Write in plain, encouraging language. Teach principles, not just instructions.`;

export async function analyzeReference(imageBase64: string, mediaType: "image/jpeg" | "image/png" | "image/webp", width: number, height: number, title: string): Promise<{ analysis: Analysis; model: string }> {
  const c = getClient();
  const stream = c.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(AnalysisSchema) },
    system: ANALYSIS_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: `Reference title: "${title}". Image size: ${width}x${height}px (aspect ratio ${(width / height).toFixed(3)}). Produce the full drawing breakdown.`,
          },
        ],
      },
    ],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new Error("The AI declined to analyze this image. Try a different reference.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error("The analysis was cut off before it finished. Please retry.");
  }
  const parsed = msg.parsed_output ?? null;
  const check = AnalysisSchema.safeParse(parsed);
  if (!check.success) throw new Error("The AI returned an analysis that could not be read. Please retry.");
  return { analysis: check.data, model: msg.model };
}

// ---------------------------------------------------------------------------
// Drawing feedback
// ---------------------------------------------------------------------------
const Criterion = z.object({
  observation: z.string().describe("What you actually see in the drawing for this criterion."),
  estimate: z.number().int().describe("Rough 1-5 estimate. This is an opinion, not a measurement."),
  next_step: z.string(),
});
export const FeedbackSchema = z.object({
  readable: z.boolean().describe("False if the upload is not a drawing or is unreadable."),
  overall: z.string(),
  strengths: z.array(z.string()),
  shape_accuracy: Criterion,
  proportions: Criterion,
  perspective: Criterion,
  value_control: Criterion,
  line_quality: Criterion,
  priority_exercise: z.string().describe("The single most useful exercise to do next and why."),
  caveats: z.string().describe("Limits of this feedback (photo quality, unfinished drawing, no reference given, etc.)."),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export async function critiqueDrawing(
  drawing: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  reference: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null,
  context: string,
): Promise<Feedback> {
  const c = getClient();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (reference) {
    content.push({ type: "text", text: "REFERENCE the student drew from:" });
    content.push({ type: "image", source: { type: "base64", media_type: reference.mediaType, data: reference.data } });
  }
  content.push({ type: "text", text: "STUDENT DRAWING:" });
  content.push({ type: "image", source: { type: "base64", media_type: drawing.mediaType, data: drawing.data } });
  content.push({
    type: "text",
    text: `${context}\nGive constructive, specific feedback. Your 1-5 estimates are subjective opinions from a photo and must be framed that way.`,
  });
  const stream = c.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(FeedbackSchema) },
    system:
      "You are a kind but honest drawing teacher. Point to concrete areas of the drawing. Explain the principle behind each correction. Never claim objective measurement of artistic skill.",
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to review this image.");
  const check = FeedbackSchema.safeParse(msg.parsed_output ?? null);
  if (!check.success) throw new Error("The AI feedback could not be read. Please retry.");
  return check.data;
}

// ---------------------------------------------------------------------------
// Tutor chat (streaming)
// ---------------------------------------------------------------------------
export const TUTOR_SYSTEM = `You are the DrawLab tutor: a warm, knowledgeable drawing teacher.

How you teach:
- Diagnose first. If the question is vague ("why does my drawing look flat?"), name the 2-3 most likely causes and how to tell which one applies.
- Teach the underlying principle (form, light logic, perspective geometry, value grouping, measurement) in simple language before giving fixes.
- Give a concrete practice exercise with a time or quantity (e.g. "draw 15 boxes in 10 minutes, rotating each 15°").
- When a picture helps, include a small inline SVG diagram in a fenced code block tagged \`svg\` (viewBox about 0 0 320 200, stroke-only line art, stroke="#e9e3d8", accent "#d98b4a", no scripts, no external refs). Keep diagrams simple and labeled.
- If the student attached an image, refer to specific visible areas of it.
- If you are not sure what the student means, ask one short clarifying question.
- Keep answers focused: short paragraphs, headings or bullet lists where useful, under ~350 words unless asked for more.`;

export function streamTutor(messages: Anthropic.Beta.BetaMessageParam[], learnerContext: string) {
  const c = getClient();
  return c.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      { type: "text", text: TUTOR_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: learnerContext },
    ],
    messages,
  });
}

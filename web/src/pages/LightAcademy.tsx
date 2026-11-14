import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icons";
import { render, ZONE_COLORS, ZONE_LABEL, type FormKind, type LightParams, type Zone } from "../lib/raytrace";

const LESSONS = [
  {
    id: "l-source", title: "Light source identification",
    intro: "Before shading anything, find the light: where it comes from, how high it is, and whether it is hard (sun, spotlight) or soft (overcast sky, big window).",
    points: ["Follow the cast shadow back toward the object: the light is on the opposite side.", "Hard light gives crisp shadow edges; soft light gives gradual ones.", "One dominant light keeps a drawing readable. Treat other lights as secondary."],
    task: "Find 5 photos and draw an arrow on each showing where the light comes from. Note hard or soft.",
    zones: ["light", "shadow", "cast"] as Zone[], preset: { azimuth: -30, elevation: 45, softness: 0.1 },
  },
  {
    id: "l-form-cast", title: "Form shadows vs cast shadows",
    intro: "A form shadow is the side of an object turned away from the light. A cast shadow is the shape an object throws onto another surface.",
    points: ["Form shadows have soft-ish edges that follow the form's curvature.", "Cast shadows are usually darker and sharper near the object, getting softer farther away.", "Cast shadows follow the surface they land on: they bend over steps and wrap around forms."],
    task: "Shade a sphere and a cube with one light. Keep the form shadow and cast shadow as two separate shapes.",
    zones: ["shadow", "cast", "core"] as Zone[], preset: { azimuth: -40, elevation: 38, softness: 0.05 },
  },
  {
    id: "l-core", title: "The core shadow",
    intro: "The core shadow is the darkest band of the form shadow, right where the form turns away from the light (the terminator).",
    points: ["It sits just inside the shadow, next to the edge between light and shadow.", "On round forms it is a soft band; on boxes it collapses onto the edge.", "Getting the core shadow shape right is what makes a form look round."],
    task: "Draw 5 spheres with the light from different directions. Draw only the terminator line and core shadow first.",
    zones: ["core", "halftone", "reflected"] as Zone[], preset: { azimuth: 20, elevation: 25, softness: 0.15 },
  },
  {
    id: "l-reflected", title: "Reflected light",
    intro: "Light bounces off nearby surfaces (often the ground) back into the shadow side, lifting it slightly.",
    points: ["Reflected light is always darker than anything in the light family.", "It appears on shadow planes facing the bouncing surface.", "Overdoing reflected light is the most common reason drawings look like plastic."],
    task: "Use the Ground bounce slider to see the effect. Shade a sphere with subtle reflected light that never gets brighter than the halftones.",
    zones: ["reflected", "core", "shadow"] as Zone[], preset: { azimuth: -60, elevation: 50, softness: 0.1, bounce: 0.9 },
  },
  {
    id: "l-occlusion", title: "Ambient occlusion",
    intro: "Where two surfaces meet or nearly touch, little light gets in, so those creases are the darkest darks in a drawing.",
    points: ["The contact point between object and ground is darker than the cast shadow around it.", "Occlusion appears even in soft, diffuse light where there are no hard shadows.", "Use it to 'seat' objects on the ground."],
    task: "Draw three objects touching a table. Put a small, very dark accent at each contact point.",
    zones: ["occlusion", "cast"] as Zone[], preset: { azimuth: 0, elevation: 70, softness: 0.8, ambient: 0.4 },
  },
  {
    id: "l-highlight", title: "Highlight placement",
    intro: "A highlight is the reflection of the light source itself. Its position depends on both the light and where you are standing.",
    points: ["On a sphere it sits between the light's direction and your eye.", "Shiny surfaces: small, bright highlights. Matte: wide, faint ones.", "Keep the highlight in the light family and save paper white for it."],
    task: "Draw a shiny and a matte sphere side by side with the same light.",
    zones: ["highlight", "light"] as Zone[], preset: { azimuth: -40, elevation: 40, softness: 0 },
  },
  {
    id: "l-shadow-shapes", title: "Shadow shapes",
    intro: "Shadows are shapes. Design them as clearly as you design the outline, and the form will read even without blending.",
    points: ["Squint and simplify: one shape for the light, one for the shadow.", "The shadow shape describes the form it falls on.", "A low light gives long cast shadows; a high light gives short ones."],
    task: "Move the light from low to high and draw 4 thumbnails showing only the shadow shapes, filled flat.",
    zones: ["shadow", "cast", "light"] as Zone[], preset: { azimuth: -20, elevation: 18, softness: 0.05 },
  },
];

const DEFAULTS: LightParams = { azimuth: -40, elevation: 40, softness: 0.1, intensity: 1, ambient: 0.18, bounce: 0.6 };
const RW = 420, RH = 300;

function LightLab({ preset, highlight }: { preset: Partial<LightParams>; highlight: Zone[] }) {
  const [kind, setKind] = useState<FormKind>("sphere");
  const [p, setP] = useState<LightParams>({ ...DEFAULTS, ...preset });
  const [mode, setMode] = useState<"shaded" | "zones">("shaded");
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      // render at half resolution while values change quickly, then full
      ctx.putImageData(render(kind, p, RW, RH, mode), 0, 0);
    });
    return () => cancelAnimationFrame(raf.current);
  }, [kind, p, mode]);

  const setFromPad = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
    const dist = Math.min(1, Math.hypot(x, y));
    // pad = top-down view: centre = straight overhead, edge = horizon; up = behind the object
    const azimuth = (Math.atan2(-y, x) * 180) / Math.PI;
    setP((q) => ({ ...q, azimuth, elevation: Math.max(4, 90 - dist * 86) }));
  };
  const padX = Math.cos((p.azimuth * Math.PI) / 180) * ((90 - p.elevation) / 86);
  const padY = -Math.sin((p.azimuth * Math.PI) / 180) * ((90 - p.elevation) / 86);
  const S = (k: keyof LightParams, label: string, min: number, max: number, step = 0.01) => (
    <label className="field">
      <span className="row between"><span>{label}</span><span className="mono faint">{p[k].toFixed(step < 1 ? 2 : 0)}</span></span>
      <input type="range" min={min} max={max} step={step} value={p[k]} onChange={(e) => setP({ ...p, [k]: +e.target.value })} />
    </label>
  );

  return (
    <div className="interactive">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 190px", gap: 0 }}>
        <canvas ref={canvas} width={RW} height={RH} style={{ width: "100%", imageRendering: "auto" }} aria-label={`${kind} lit from ${Math.round(p.azimuth)} degrees`} />
        <div style={{ padding: 14, borderLeft: "1px solid var(--line)", background: "var(--bg-2)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="small faint">Light position (top view). Drag the sun.</div>
          <div
            ref={pad}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setFromPad(e); }}
            onPointerMove={(e) => e.buttons && setFromPad(e)}
            style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: "50%", border: "1px solid var(--line-2)", background: "radial-gradient(circle, #2e2c28, #1a1917)", cursor: "crosshair", touchAction: "none" }}
          >
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: kind === "cube" ? 3 : "50%", background: "#8a847a" }} />
            <div style={{ position: "absolute", left: `${50 + padX * 50}%`, top: `${50 + padY * 50}%`, width: 20, height: 20, marginLeft: -10, marginTop: -10, borderRadius: "50%", background: "#ffd27a", boxShadow: "0 0 16px #ffd27a" }} />
            <div className="faint" style={{ position: "absolute", bottom: -2, width: "100%", textAlign: "center", fontSize: 10 }}>you</div>
            <div className="faint" style={{ position: "absolute", top: 2, width: "100%", textAlign: "center", fontSize: 10 }}>behind</div>
          </div>
          <div className="small mono faint">Elevation {Math.round(p.elevation)}°</div>
        </div>
      </div>
      <div className="controls">
        <div className="seg">{(["sphere", "cube", "cylinder"] as FormKind[]).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)} style={{ textTransform: "capitalize" }}>{k}</button>)}</div>
        <div className="seg"><button className={mode === "shaded" ? "on" : ""} onClick={() => setMode("shaded")}>Rendered</button><button className={mode === "zones" ? "on" : ""} onClick={() => setMode("zones")}>Light zones</button></div>
        {S("elevation", "Light height", 4, 90, 1)}
        {S("softness", "Softness (light size)", 0, 1)}
        {S("ambient", "Sky / ambient light", 0, 0.5)}
        {S("bounce", "Ground bounce", 0, 1)}
      </div>
      {mode === "zones" && (
        <div className="controls" style={{ borderTop: "none", paddingTop: 0 }}>
          {(Object.keys(ZONE_LABEL) as Zone[]).filter((z) => z !== "bg").map((z) => (
            <div key={z} className="row small" style={{ fontWeight: highlight.includes(z) ? 600 : 400, color: highlight.includes(z) ? "var(--text)" : "var(--text-2)" }}>
              <span className="dot" style={{ background: `rgb(${ZONE_COLORS[z].join(",")})`, width: 12, height: 12 }} /> {ZONE_LABEL[z]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LightAcademy() {
  const [active, setActive] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    api<{ activity: { kind: string; ref: string }[] }>("/activity").then((r) => setDone(new Set(r.activity.filter((a) => a.kind === "lesson").map((a) => a.ref)))).catch(() => {});
  }, []);
  const l = LESSONS[active];
  const complete = async () => {
    await api("/activity", { body: { kind: "lesson", ref: l.id, minutes: 15 } });
    setDone(new Set([...done, l.id]));
    if (active < LESSONS.length - 1) setActive(active + 1);
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Light & Shadow Academy</h1>
          <p className="muted">Move the light and watch shadows respond. The scene is ray traced: shadows, bounce light and occlusion are calculated, not painted.</p>
        </div>
        <span className="chip accent">{[...done].filter((d) => d.startsWith("l-")).length} / {LESSONS.length} complete</span>
      </div>
      <div className="academy">
        <nav className="lesson-nav">
          {LESSONS.map((x, i) => (
            <button key={x.id} className={`lesson-btn${i === active ? " on" : ""}`} onClick={() => setActive(i)}>
              <span className={`check${done.has(x.id) ? " done" : ""}`}>{done.has(x.id) && <span style={{ width: 10, color: "#1a1310", display: "flex" }}><Icon.check /></span>}</span>
              {i + 1}. {x.title}
            </button>
          ))}
        </nav>
        <article className="stack lesson-body" key={l.id}>
          <h2>{l.title}</h2>
          <p className="muted" style={{ fontSize: 15 }}>{l.intro}</p>
          <LightLab preset={l.preset} highlight={l.zones} />
          <div className="small faint">Switch to <b>Light zones</b> to see {l.zones.map((z) => ZONE_LABEL[z].toLowerCase()).join(", ")} highlighted in the key.</div>
          <h3>Key ideas</h3>
          <ul>{l.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <div className="task"><b>Exercise:</b> {l.task}</div>
          <div className="row">
            <button className="primary" onClick={complete} disabled={done.has(l.id)}>{done.has(l.id) ? "Completed" : "Mark lesson complete"}</button>
            {active < LESSONS.length - 1 && <button className="ghost" onClick={() => setActive(active + 1)}>Next lesson <Icon.arrowR /></button>}
          </div>
        </article>
      </div>
    </div>
  );
}

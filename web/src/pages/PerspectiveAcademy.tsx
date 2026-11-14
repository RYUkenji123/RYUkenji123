import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { Scene3D, perspectiveKind, type Cam, type Obj } from "../components/Scene3D";
import { VPConstructor } from "../components/VPConstructor";
import { Icon } from "../components/Icons";

interface Lesson {
  id: string;
  title: string;
  intro: string;
  points: string[];
  task: string;
  widget: ReactNode;
}

function Slider({ label, value, min, max, step = 1, onChange, unit = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <label className="field">
      <span className="row between"><span>{label}</span><span className="mono faint">{Math.round(value * 10) / 10}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

/** Rotatable box (or scene) with camera controls. VPs are computed from the geometry. */
function BoxLab({ preset }: { preset: "space" | "box" | "one" | "two" | "three" | "rotate" | "city" | "foreshorten" }) {
  const init = {
    space: { yaw: 30, tilt: 0, pitch: 0, height: 2.6, focal: 520, distance: 8 },
    box: { yaw: 35, tilt: 0, pitch: 0, height: 2.4, focal: 520, distance: 8 },
    one: { yaw: 0, tilt: 0, pitch: 0, height: 2.8, focal: 520, distance: 8 },
    two: { yaw: 35, tilt: 0, pitch: 0, height: 2.6, focal: 520, distance: 8 },
    three: { yaw: 35, tilt: 0, pitch: 24, height: 0.6, focal: 420, distance: 6 },
    rotate: { yaw: 25, tilt: 25, pitch: 0, height: 1.6, focal: 520, distance: 8 },
    city: { yaw: 20, tilt: 0, pitch: 0, height: 1.7, focal: 460, distance: 10 },
    foreshorten: { yaw: 70, tilt: 0, pitch: 0, height: 1.0, focal: 300, distance: 3.5 },
  }[preset];
  const [s, set] = useState(init);
  const upd = (k: keyof typeof s) => (v: number) => set({ ...s, [k]: v });
  const [hidden, setHidden] = useState(true);
  const [ext, setExt] = useState(true);
  const cam: Cam = { height: s.height, distance: s.distance, pitch: s.pitch, focal: s.focal };
  const objects: Obj[] = useMemo(() => {
    if (preset === "city")
      return [
        { kind: "box", pos: [-3.2, 0, 3], size: [2, 4.5, 2], yaw: s.yaw },
        { kind: "box", pos: [0.2, 0, 6], size: [2.4, 6, 2.4], yaw: s.yaw },
        { kind: "box", pos: [3.4, 0, 2], size: [1.6, 2.6, 3], yaw: s.yaw },
        { kind: "box", pos: [0, 0, 0], size: [1.4, 0.8, 1], yaw: s.yaw },
      ];
    if (preset === "foreshorten") return [{ kind: "box", pos: [0, 0.4, 1.5], size: [0.7, 0.7, 5], yaw: s.yaw }];
    if (preset === "three") return [{ kind: "box", pos: [0, 0, 0], size: [2, 5, 2], yaw: s.yaw }];
    return [{ kind: "box", pos: [0, preset === "rotate" ? 0.8 : 0, 0], size: [2.4, 1.8, 2.4], yaw: s.yaw, tilt: s.tilt }];
  }, [preset, s.yaw, s.tilt]);

  return (
    <div className="interactive">
      <Scene3D objects={objects} cam={cam} showHidden={hidden} showExtensions={ext} showGround={preset === "space" || preset === "city"} scale={preset === "three" ? 0.8 : 1} />
      <div className="controls">
        <Slider label="Rotate object (yaw)" value={s.yaw} min={-90} max={90} onChange={upd("yaw")} unit="°" />
        {preset === "rotate" && <Slider label="Tip object forward" value={s.tilt} min={-60} max={60} onChange={upd("tilt")} unit="°" />}
        <Slider label="Eye level (camera height)" value={s.height} min={-1} max={8} step={0.1} onChange={upd("height")} />
        <Slider label="Look up / down (camera tilt)" value={s.pitch} min={-40} max={40} onChange={upd("pitch")} unit="°" />
        <Slider label="Lens (focal length)" value={s.focal} min={200} max={1100} step={10} onChange={upd("focal")} />
        <Slider label="Distance" value={s.distance} min={3} max={16} step={0.1} onChange={upd("distance")} />
        <label className="row small"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Draw through (hidden edges)</label>
        <label className="row small"><input type="checkbox" checked={ext} onChange={(e) => setExt(e.target.checked)} /> Extend edges to VPs</label>
        <div className="row" style={{ alignSelf: "center" }}><span className="chip accent">{perspectiveKind(objects, cam)}</span></div>
      </div>
    </div>
  );
}

function CylinderLab({ preset }: { preset: "ellipses" | "cylinders" }) {
  const [s, set] = useState({ height: preset === "ellipses" ? 2.2 : 2.6, tilt: preset === "ellipses" ? 0 : 0, yaw: 0, focal: 520, distance: 7 });
  const upd = (k: keyof typeof s) => (v: number) => set({ ...s, [k]: v });
  const cam: Cam = { height: s.height, distance: s.distance, pitch: 0, focal: s.focal };
  const objects: Obj[] =
    preset === "ellipses"
      ? [{ kind: "cylinder", pos: [0, -0.4, 0], radius: 1.2, height: 4.4, yaw: s.yaw, tilt: s.tilt, rings: 6 }]
      : [
          { kind: "cylinder", pos: [-2.2, 0, 0], radius: 0.9, height: 2.2, yaw: s.yaw, tilt: s.tilt, rings: 3 },
          { kind: "cylinder", pos: [1.6, 0.9, 0.5], radius: 0.8, height: 2.6, yaw: s.yaw + 40, tilt: 90, rings: 3 },
        ];
  return (
    <div className="interactive">
      <Scene3D objects={objects} cam={cam} ellipseAxes showVPs={false} />
      <div className="controls">
        <Slider label="Eye level" value={s.height} min={-1.5} max={6} step={0.1} onChange={upd("height")} />
        <Slider label="Tilt cylinder" value={s.tilt} min={-90} max={90} onChange={upd("tilt")} unit="°" />
        <Slider label="Turn cylinder" value={s.yaw} min={-90} max={90} onChange={upd("yaw")} unit="°" />
        <Slider label="Lens" value={s.focal} min={200} max={1100} step={10} onChange={upd("focal")} />
        <div className="small faint" style={{ alignSelf: "center" }}>Orange lines: each ellipse's minor axis, which always lines up with the cylinder's central axis.</div>
      </div>
    </div>
  );
}

const LESSONS: Lesson[] = [
  {
    id: "p-3d-space", title: "Understanding 3D space",
    intro: "Perspective is just what happens when 3D space is projected onto a flat picture plane from one eye position. Objects farther away look smaller, and parallel lines that recede from you appear to meet.",
    points: ["The horizon line is always at your eye level. Raise the camera and the horizon rises with it.", "Everything below eye level shows its top; everything above shows its underside.", "Ground-plane grid lines that go into the distance converge; lines parallel to the picture plane stay parallel."],
    task: "Draw a horizon line, then 6 boxes floating at different heights: 2 above, 2 on, 2 below the horizon. Check which faces you can see on each.",
    widget: <BoxLab preset="space" />,
  },
  {
    id: "p-boxes", title: "Drawing basic boxes",
    intro: "The box is the most important form in drawing. Almost everything (heads, cars, furniture, ribcages) can be built from a box that you then carve.",
    points: ["Draw every box with its 3 sets of parallel edges: each set converges to its own vanishing point, or stays parallel.", "Draw through the box: show the hidden back edges. It's how you check the form is consistent.", "Lines in one set must never diverge as they move away from you."],
    task: "Fill a page with 20 boxes in different rotations. Draw through each one, then extend the edges lightly to check convergence.",
    widget: <BoxLab preset="box" />,
  },
  {
    id: "p-one-point", title: "One-point perspective",
    intro: "When a box faces you squarely, its front face is a true rectangle and only the depth lines recede, all to a single vanishing point on the horizon.",
    points: ["Horizontal and vertical edges stay horizontal and vertical.", "Only lines going straight away from you converge to the VP.", "Great for corridors, roads, rooms seen straight-on."],
    task: "Drag the VP and the horizon. Then draw 5 boxes in one-point perspective at different positions around a single VP.",
    widget: <VPConstructor mode="one" showGrid />,
  },
  {
    id: "p-two-point", title: "Two-point perspective",
    intro: "Turn the box so you look at a corner and you need two vanishing points, both on the horizon. Verticals stay vertical.",
    points: ["Both VPs sit on the horizon (your eye level).", "VPs close together cause distortion; keep them far apart, often off the page.", "Construct the back corner where lines from the two side edges cross."],
    task: "Construct 3 boxes here, then on paper: one below, one cut by, and one above the horizon, sharing the same two VPs.",
    widget: <VPConstructor mode="two" />,
  },
  {
    id: "p-three-point", title: "Three-point perspective",
    intro: "When you tilt your view up or down, the vertical edges also converge, to a third vanishing point far above or below.",
    points: ["Looking up at a tall building: verticals converge upward (worm's-eye view).", "Looking down: verticals converge downward (bird's-eye view).", "The stronger the tilt, the closer the third VP and the more dramatic the drawing."],
    task: "Tilt the camera here until the third VP appears. Then draw a tall tower from a worm's-eye view.",
    widget: <BoxLab preset="three" />,
  },
  {
    id: "p-rotating", title: "Rotating boxes in space",
    intro: "A box that is tipped as well as turned has all three edge sets converging, each to its own VP, even if your view is level. Each object can have its own VPs.",
    points: ["Different objects in one scene can have different VPs if they're rotated differently.", "Only objects sitting flat on the ground share VPs on the horizon.", "Tipped boxes are the basis for drawing heads and figures in motion."],
    task: "Draw 10 boxes tumbling through space, each in a different rotation. Use this lab to check the hardest angle.",
    widget: <BoxLab preset="rotate" />,
  },
  {
    id: "p-ellipses", title: "Ellipses in perspective",
    intro: "A circle seen in perspective becomes an ellipse. How round it looks depends on how far it is from your eye level.",
    points: ["At eye level a circle is a flat line; it gets fuller the farther above or below the horizon it is.", "The minor axis of the ellipse is always aligned with the axis of the cylinder or wheel.", "Ellipses never have pointed ends."],
    task: "Draw a column of 6 ellipses stacked vertically, getting fuller away from a horizon line in the middle.",
    widget: <CylinderLab preset="ellipses" />,
  },
  {
    id: "p-cylinders", title: "Cylinders in perspective",
    intro: "Build a cylinder from its central axis: draw the axis first, then the end ellipses perpendicular to it, then join the sides tangent to the ellipses.",
    points: ["The far end ellipse is fuller than the near end when the cylinder points away.", "Cylinders lying down: their axis converges toward the VPs just like a box edge.", "Fit a cylinder inside a box if you are unsure of its perspective."],
    task: "Draw 10 cylinders: 5 standing, 5 lying at different angles. Draw the central axis and minor axes first.",
    widget: <CylinderLab preset="cylinders" />,
  },
  {
    id: "p-environments", title: "Perspective in environments",
    intro: "In a scene, all objects resting square on the same ground share vanishing points on one horizon. Your eye height sets the feel of the whole scene.",
    points: ["Place the horizon first. A low horizon feels monumental; a high one feels like an overview.", "Size changes with distance: objects twice as far away look half as tall.", "Use the ground grid to place objects at consistent depths."],
    task: "Draw a street corner with 4 buildings sharing two VPs. Add one person at eye level to every sidewalk: their heads all sit on the horizon.",
    widget: <BoxLab preset="city" />,
  },
  {
    id: "p-foreshortening", title: "Foreshortening",
    intro: "Forms pointing toward you appear compressed: their length shrinks and the near end grows. Wide lenses and close distances exaggerate this.",
    points: ["Overlap is your strongest tool: near forms overlap far forms.", "Exaggerate the size difference between the near and far ends.", "Think in cross-sections (ellipses) rather than outlines."],
    task: "Draw an arm or a pipe pointing at you as a stack of overlapping cylinders. Compare a gentle and an extreme version.",
    widget: <BoxLab preset="foreshorten" />,
  },
];

export default function PerspectiveAcademy() {
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
          <h1>Perspective Academy</h1>
          <p className="muted">Ten lessons from basic space to foreshortening. Every vanishing point here is calculated from real 3D geometry, so you can experiment freely.</p>
        </div>
        <span className="chip accent">{done.size} / {LESSONS.length} complete</span>
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
          {l.widget}
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

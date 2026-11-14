/**
 * A small pinhole-camera renderer for teaching perspective. Vanishing points are not drawn
 * by hand: they are computed by projecting each edge direction, so they are always correct.
 */
type V3 = [number, number, number];

export interface Cam {
  height: number; // eye height above the ground
  distance: number; // camera distance from origin
  pitch: number; // degrees, + looks up
  focal: number; // focal length in screen px units (smaller = wider lens)
}
export interface BoxObj { kind: "box"; pos: V3; size: V3; yaw: number; tilt?: number }
export interface CylObj { kind: "cylinder"; pos: V3; radius: number; height: number; yaw: number; tilt: number; rings?: number }
export type Obj = BoxObj | CylObj;

const rad = (d: number) => (d * Math.PI) / 180;
const rotY = ([x, y, z]: V3, a: number): V3 => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rotX = ([x, y, z]: V3, a: number): V3 => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World -> camera space (camera at (0, height, -distance), looking +z, pitched). */
function toCam(p: V3, cam: Cam): V3 {
  const rel = sub(p, [0, cam.height, -cam.distance]);
  return rotX(rel, rad(cam.pitch));
}
function dirToCam(d: V3, cam: Cam): V3 {
  return rotX(d, rad(cam.pitch));
}
export function project(p: V3, cam: Cam): [number, number] | null {
  const c = toCam(p, cam);
  if (c[2] <= 0.05) return null;
  return [(cam.focal * c[0]) / c[2], (-cam.focal * c[1]) / c[2]];
}
/** Vanishing point of a world direction; null if parallel to the picture plane. */
export function vanish(d: V3, cam: Cam): [number, number] | null {
  const c = dirToCam(d, cam);
  if (Math.abs(c[2]) < 1e-4) return null;
  // d and -d share one vanishing point, so the sign of z cancels out.
  return [(cam.focal * c[0]) / c[2], (-cam.focal * c[1]) / c[2]];
}

interface Edge { a: V3; b: V3; dir: number; hidden: boolean }

function boxGeometry(o: BoxObj, cam: Cam) {
  const [sx, sy, sz] = o.size;
  const tilt = rad(o.tilt ?? 0);
  const local: V3[] = [];
  for (const y of [0, sy]) for (const z of [-sz / 2, sz / 2]) for (const x of [-sx / 2, sx / 2]) local.push([x, y, z]);
  const xf = (p: V3) => add(rotY(rotX(p, tilt), rad(o.yaw)), o.pos);
  const v = local.map(xf);
  const axes: V3[] = [rotY(rotX([1, 0, 0], tilt), rad(o.yaw)), rotY(rotX([0, 1, 0], tilt), rad(o.yaw)), rotY(rotX([0, 0, 1], tilt), rad(o.yaw))];
  // faces: index sets + outward normal
  const faces: { idx: number[]; n: V3 }[] = [
    { idx: [0, 1, 3, 2], n: axes[1].map((c) => -c) as V3 },
    { idx: [4, 5, 7, 6], n: axes[1] },
    { idx: [0, 1, 5, 4], n: axes[2].map((c) => -c) as V3 },
    { idx: [2, 3, 7, 6], n: axes[2] },
    { idx: [0, 2, 6, 4], n: axes[0].map((c) => -c) as V3 },
    { idx: [1, 3, 7, 5], n: axes[0] },
  ];
  const camPos: V3 = [0, cam.height, -cam.distance];
  const visible = faces.map((f) => {
    const c = f.idx.reduce<V3>((acc, i) => add(acc, v[i]), [0, 0, 0]).map((x) => x / 4) as V3;
    return dot(f.n, sub(camPos, c)) > 0;
  });
  const edgeList: [number, number, number][] = [
    [0, 1, 0], [2, 3, 0], [4, 5, 0], [6, 7, 0],
    [0, 4, 1], [1, 5, 1], [2, 6, 1], [3, 7, 1],
    [0, 2, 2], [1, 3, 2], [4, 6, 2], [5, 7, 2],
  ];
  const edges: Edge[] = edgeList.map(([a, b, dir]) => {
    const vis = faces.some((f, fi) => visible[fi] && f.idx.includes(a) && f.idx.includes(b));
    return { a: v[a], b: v[b], dir, hidden: !vis };
  });
  const faceList = faces.map((f, i) => ({ pts: f.idx.map((k) => v[k]), visible: visible[i], n: f.n }));
  return { edges, axes, faces: faceList };
}

export const VP_COLORS = ["#f0a868", "#8fc1d4", "#b58ad9"];

export function Scene3D({
  objects, cam, width = 820, height = 480, scale = 1, showVPs = true, showExtensions = true, showHidden = true, showHorizon = true, showGround = false,
  ellipseAxes = false, children,
}: {
  objects: Obj[]; cam: Cam; width?: number; height?: number; scale?: number; showVPs?: boolean; showExtensions?: boolean; showHidden?: boolean;
  showHorizon?: boolean; showGround?: boolean; ellipseAxes?: boolean; children?: React.ReactNode;
}) {
  const cx = width / 2, cy = height / 2;
  const P = (p: [number, number]) => [cx + p[0] * scale, cy + p[1] * scale] as [number, number];
  const out: React.ReactNode[] = [];
  const horizonY = (() => {
    const v = vanish([0, 0, 1], cam);
    return v ? P(v)[1] : null;
  })();

  if (showGround) {
    for (let i = -10; i <= 10; i++) {
      const a = project([i, 0, -2], cam), b = project([i, 0, 40], cam);
      const c = project([-10, 0, i * 2 + 18], cam), d = project([10, 0, i * 2 + 18], cam);
      if (a && b) out.push(<line key={`gx${i}`} x1={P(a)[0]} y1={P(a)[1]} x2={P(b)[0]} y2={P(b)[1]} stroke="#3a3833" strokeWidth={1} />);
      if (c && d) out.push(<line key={`gz${i}`} x1={P(c)[0]} y1={P(c)[1]} x2={P(d)[0]} y2={P(d)[1]} stroke="#3a3833" strokeWidth={1} />);
    }
  }
  if (showHorizon && horizonY != null) {
    out.push(<line key="hz" x1={0} y1={horizonY} x2={width} y2={horizonY} stroke="#d98b4a" strokeWidth={1.5} strokeDasharray="10 6" />);
    out.push(<text key="hzt" x={width / 2} y={horizonY - 7} textAnchor="middle" fill="#d98b4a" fontSize={12} fontFamily="Inter">Horizon line = eye level</text>);
  }

  const vpSeen = new Map<string, { p: [number, number]; color: string; label: string }>();
  objects.forEach((o, oi) => {
    if (o.kind === "box") {
      const g = boxGeometry(o, cam);
      // faces (light fill for visible)
      g.faces.forEach((f, fi) => {
        if (!f.visible) return;
        const pts = f.pts.map((p) => project(p, cam));
        if (pts.some((p) => !p)) return;
        const shade = 0.05 + Math.max(0, dot(f.n, [0.4, 0.8, -0.45])) * 0.1;
        out.push(<polygon key={`f${oi}-${fi}`} points={pts.map((p) => P(p!).join(",")).join(" ")} fill="#ece6da" fillOpacity={shade} />);
      });
      g.axes.forEach((ax, ai) => {
        const vp = vanish(ax, cam);
        if (!vp) return;
        const key = `${Math.round(vp[0])}:${Math.round(vp[1])}`;
        if (!vpSeen.has(key)) vpSeen.set(key, { p: P(vp), color: VP_COLORS[ai], label: ai === 1 ? "VP3 (vertical)" : `VP${ai === 0 ? 1 : 2}` });
        if (showExtensions) {
          g.edges.filter((e) => e.dir === ai).forEach((e, k) => {
            const a = project(e.a, cam), b = project(e.b, cam);
            if (!a || !b) return;
            // extend from the edge toward its VP
            const pa = P(a), pb = P(b), pv = P(vp);
            const near = Math.hypot(pa[0] - pv[0], pa[1] - pv[1]) < Math.hypot(pb[0] - pv[0], pb[1] - pv[1]) ? pa : pb;
            out.push(<line key={`x${oi}-${ai}-${k}`} x1={near[0]} y1={near[1]} x2={pv[0]} y2={pv[1]} stroke={VP_COLORS[ai]} strokeOpacity={0.35} strokeWidth={1} />);
          });
        }
      });
      g.edges.forEach((e, k) => {
        if (e.hidden && !showHidden) return;
        const a = project(e.a, cam), b = project(e.b, cam);
        if (!a || !b) return;
        const pa = P(a), pb = P(b);
        out.push(<line key={`e${oi}-${k}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={e.hidden ? "#8a847a" : VP_COLORS[e.dir]} strokeWidth={e.hidden ? 1.2 : 2.4} strokeDasharray={e.hidden ? "5 5" : undefined} strokeLinecap="round" />);
      });
    } else {
      const rings = o.rings ?? 2;
      const axis = rotY(rotX([0, 1, 0], rad(o.tilt)), rad(o.yaw));
      const u = rotY(rotX([1, 0, 0], rad(o.tilt)), rad(o.yaw));
      const w = rotY(rotX([0, 0, 1], rad(o.tilt)), rad(o.yaw));
      const ringPts: [number, number][][] = [];
      for (let r = 0; r < rings; r++) {
        const t = rings === 1 ? 0 : r / (rings - 1);
        const c = add(o.pos, axis.map((a) => a * o.height * t) as V3);
        const pts: [number, number][] = [];
        for (let k = 0; k <= 64; k++) {
          const th = (k / 64) * Math.PI * 2;
          const p = add(c, add(u.map((a) => a * o.radius * Math.cos(th)) as V3, w.map((a) => a * o.radius * Math.sin(th)) as V3));
          const pp = project(p, cam);
          if (pp) pts.push(P(pp));
        }
        ringPts.push(pts);
        const isEnd = r === 0 || r === rings - 1;
        out.push(<polyline key={`ring${oi}-${r}`} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={isEnd ? "#7fd1b0" : "#7fd1b0"} strokeOpacity={isEnd ? 1 : 0.55} strokeWidth={isEnd ? 2.2 : 1.3} strokeDasharray={isEnd ? undefined : "5 4"} />);
        if (ellipseAxes && pts.length > 10) {
          // minor axis of each ellipse lies along the projected cylinder axis
          const pc = project(c, cam);
          const a2 = project(add(c, axis.map((a) => a * o.radius * 1.4) as V3), cam), a1 = project(sub(c, axis.map((a) => a * o.radius * 1.4) as V3), cam);
          if (pc && a1 && a2) out.push(<line key={`minor${oi}-${r}`} x1={P(a1)[0]} y1={P(a1)[1]} x2={P(a2)[0]} y2={P(a2)[1]} stroke="#f0a868" strokeWidth={1.2} />);
        }
      }
      // silhouette sides: extreme points of the end ellipses perpendicular to the projected axis
      const p0 = project(o.pos, cam), p1 = project(add(o.pos, axis.map((a) => a * o.height) as V3), cam);
      if (p0 && p1 && ringPts.length >= 2) {
        const A = P(p0), B = P(p1);
        const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const ext = (pts: [number, number][], sgn: number) => pts.reduce((best, p) => ((p[0] * nx + p[1] * ny) * sgn > (best[0] * nx + best[1] * ny) * sgn ? p : best), pts[0]);
        const first = ringPts[0], last = ringPts[ringPts.length - 1];
        for (const sgn of [1, -1]) {
          const a = ext(first, sgn), b = ext(last, sgn);
          out.push(<line key={`side${oi}${sgn}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#7fd1b0" strokeWidth={2.2} />);
        }
        out.push(<line key={`axis${oi}`} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#f0a868" strokeDasharray="8 5" strokeWidth={1.3} />);
      }
    }
  });

  if (showVPs)
    [...vpSeen.values()].forEach((v, i) => {
      const inside = v.p[0] > 8 && v.p[0] < width - 8 && v.p[1] > 8 && v.p[1] < height - 8;
      if (inside) {
        out.push(<circle key={`vp${i}`} cx={v.p[0]} cy={v.p[1]} r={6} fill={v.color} stroke="#121210" strokeWidth={2} />);
        out.push(<text key={`vpt${i}`} x={v.p[0] + 9} y={v.p[1] - 8} fill={v.color} fontSize={12} fontWeight={600} fontFamily="Inter">{v.label}</text>);
      } else if (Math.abs(v.p[0]) < 1e6 && Math.abs(v.p[1]) < 1e6) {
        const ex = Math.max(14, Math.min(width - 14, v.p[0])), ey = Math.max(14, Math.min(height - 14, v.p[1]));
        const ang = Math.atan2(v.p[1] - cy, v.p[0] - cx);
        out.push(
          <g key={`vpo${i}`}>
            <polygon points="0,-6 12,0 0,6" fill={v.color} transform={`translate(${ex},${ey}) rotate(${(ang * 180) / Math.PI})`} />
            <text x={ex < cx ? 22 : width - 22} textAnchor={ex < cx ? "start" : "end"} y={Math.max(26, Math.min(height - 18, ey + 22))} fill={v.color} fontSize={11} fontFamily="Inter">{v.label} (off canvas)</text>
          </g>,
        );
      }
    });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ background: "#121210" }}>
      {out}
      {children}
    </svg>
  );
}

/** Classifies the perspective of a set of boxes for the current camera. */
export function perspectiveKind(objects: Obj[], cam: Cam): string {
  let finite = 0;
  const boxes = objects.filter((o): o is BoxObj => o.kind === "box");
  if (!boxes.length) return "";
  const b = boxes[0];
  const axes: V3[] = [rotY(rotX([1, 0, 0], rad(b.tilt ?? 0)), rad(b.yaw)), rotY(rotX([0, 1, 0], rad(b.tilt ?? 0)), rad(b.yaw)), rotY(rotX([0, 0, 1], rad(b.tilt ?? 0)), rad(b.yaw))];
  for (const a of axes) {
    const c = dirToCam(a, cam);
    if (Math.abs(c[2]) > 0.02) finite++;
  }
  return finite <= 1 ? "One-point perspective" : finite === 2 ? "Two-point perspective" : "Three-point perspective";
}

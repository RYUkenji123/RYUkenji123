/**
 * Tiny CPU ray tracer for the Light & Shadow Academy.
 * One form (sphere / cube / cylinder) on a ground plane, one directional light, sky ambient,
 * a single bounce of light from the ground (reflected light) and short-range ambient occlusion.
 * It can also classify each pixel into the classic light-and-shadow zones.
 */
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export type FormKind = "sphere" | "cube" | "cylinder";
export interface LightParams {
  azimuth: number; // degrees, 0 = from camera-right, 90 = from behind object, -90 = from the viewer
  elevation: number; // degrees above the ground
  softness: number; // 0 hard .. 1 soft
  intensity: number; // 0..1.5
  ambient: number; // 0..0.5 sky light
  bounce: number; // 0..1 ground reflectance
}
export type Zone = "highlight" | "light" | "halftone" | "core" | "reflected" | "shadow" | "cast" | "occlusion" | "ground" | "bg";
export const ZONE_COLORS: Record<Zone, [number, number, number]> = {
  highlight: [255, 244, 200],
  light: [240, 196, 120],
  halftone: [170, 170, 110],
  core: [70, 60, 140],
  reflected: [110, 170, 200],
  shadow: [60, 90, 140],
  cast: [35, 35, 90],
  occlusion: [15, 10, 40],
  ground: [60, 58, 52],
  bg: [24, 24, 22],
};
export const ZONE_LABEL: Record<Zone, string> = {
  highlight: "Highlight",
  light: "Light",
  halftone: "Halftone",
  core: "Core shadow",
  reflected: "Reflected light",
  shadow: "Form shadow",
  cast: "Cast shadow",
  occlusion: "Occlusion shadow",
  ground: "Lit ground",
  bg: "Background",
};

interface Hit { t: number; n: V; obj: "form" | "ground" }

const CYL_R = 0.85, CYL_H = 1.9, CUBE = 0.85, CUBE_YAW = (32 * Math.PI) / 180;

function hitForm(kind: FormKind, o: V, d: V, tMax = 1e9): Hit | null {
  if (kind === "sphere") {
    const c: V = [0, 1, 0], r = 1;
    const oc = sub(o, c);
    const b = dot(oc, d), cc = dot(oc, oc) - r * r;
    const disc = b * b - cc;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t < 1e-4) t = -b + s;
    if (t < 1e-4 || t > tMax) return null;
    return { t, n: norm(sub(add(o, mul(d, t)), c)), obj: "form" };
  }
  if (kind === "cube") {
    // rotate ray into the cube's local frame
    const cs = Math.cos(-CUBE_YAW), sn = Math.sin(-CUBE_YAW);
    const rot = (v: V): V => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs];
    const lo = rot(sub(o, [0, CUBE, 0])), ld = rot(d);
    let tmin = -1e9, tmax = 1e9, axis = 0, sign = 1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ld[i]) < 1e-9) {
        if (Math.abs(lo[i]) > CUBE) return null;
        continue;
      }
      let t1 = (-CUBE - lo[i]) / ld[i], t2 = (CUBE - lo[i]) / ld[i];
      let s = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (tmin < 1e-4 || tmin > tMax) return null;
    const ln: V = [0, 0, 0];
    ln[axis] = sign;
    const c2 = Math.cos(CUBE_YAW), s2 = Math.sin(CUBE_YAW);
    return { t: tmin, n: [ln[0] * c2 + ln[2] * s2, ln[1], -ln[0] * s2 + ln[2] * c2], obj: "form" };
  }
  // cylinder: vertical, base at y=0
  let best: Hit | null = null;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a > 1e-9) {
    const b = o[0] * d[0] + o[2] * d[2], c = o[0] * o[0] + o[2] * o[2] - CYL_R * CYL_R;
    const disc = b * b - a * c;
    if (disc >= 0) {
      for (const t of [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a]) {
        const y = o[1] + d[1] * t;
        if (t > 1e-4 && t < tMax && y >= 0 && y <= CYL_H) {
          const p = add(o, mul(d, t));
          best = { t, n: norm([p[0], 0, p[2]]), obj: "form" };
          break;
        }
      }
    }
  }
  if (Math.abs(d[1]) > 1e-9) {
    const t = (CYL_H - o[1]) / d[1];
    if (t > 1e-4 && t < tMax && (!best || t < best.t)) {
      const p = add(o, mul(d, t));
      if (p[0] * p[0] + p[2] * p[2] <= CYL_R * CYL_R) best = { t, n: [0, 1, 0], obj: "form" };
    }
  }
  return best;
}

function hitScene(kind: FormKind, o: V, d: V): Hit | null {
  const f = hitForm(kind, o, d);
  let g: Hit | null = null;
  if (d[1] < -1e-6) {
    const t = -o[1] / d[1];
    if (t > 1e-4) g = { t, n: [0, 1, 0], obj: "ground" };
  }
  if (f && (!g || f.t < g.t)) return f;
  return g;
}

export function lightDir(p: LightParams): V {
  const az = (p.azimuth * Math.PI) / 180, el = (p.elevation * Math.PI) / 180;
  // x: right, y: up, z: away from camera
  return norm([Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]);
}

export function render(kind: FormKind, p: LightParams, w: number, h: number, mode: "shaded" | "zones"): ImageData {
  const img = new ImageData(w, h);
  const camPos: V = [0, 2.6, -6.2];
  const target: V = [0, 0.9, 0];
  const fwd = norm(sub(target, camPos));
  const right = norm(cross([0, 1, 0], fwd));
  const up = cross(fwd, right);
  const fov = 0.62;
  const L = lightDir(p);
  // jittered light directions for soft shadows
  const lightSamples: V[] = [];
  const nS = p.softness > 0.02 ? 6 : 1;
  for (let i = 0; i < nS; i++) {
    const a = (i / nS) * Math.PI * 2, r = p.softness * 0.35;
    const t1 = norm(cross(L, [0, 1, 0.001])), t2 = cross(L, t1);
    lightSamples.push(norm(add(L, add(mul(t1, Math.cos(a) * r), mul(t2, Math.sin(a) * r)))));
  }
  const aoDirs: V[] = [];
  for (let i = 0; i < 10; i++) {
    const phi = i * 2.399963, z = 1 - (i + 0.5) / 10;
    const r = Math.sqrt(1 - z * z);
    aoDirs.push([Math.cos(phi) * r, z, Math.sin(phi) * r]);
  }
  const shadowAmount = (pt: V) => {
    let lit = 0;
    for (const ld of lightSamples) if (!hitForm(kind, pt, ld)) lit++;
    return lit / lightSamples.length;
  };
  const occlusion = (pt: V, n: V) => {
    // tangent frame around n
    const t1 = norm(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]));
    const t2 = cross(n, t1);
    let occ = 0;
    for (const a of aoDirs) {
      const d = norm(add(add(mul(t1, a[0]), mul(t2, a[2])), mul(n, a[1])));
      const hh = hitScene(kind, pt, d);
      if (hh && hh.t < 0.9) occ += 1 - hh.t / 0.9;
    }
    return 1 - occ / aoDirs.length;
  };
  // how brightly the lit ground bounces light upward
  const groundLit = Math.max(0, L[1]) * p.intensity;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w - 0.5) * 2 * fov * (w / h), v = -((y + 0.5) / h - 0.5) * 2 * fov;
      const d = norm(add(fwd, add(mul(right, u), mul(up, v))));
      const hit = hitScene(kind, camPos, d);
      const j = (y * w + x) * 4;
      let col: [number, number, number];
      if (!hit || hit.t > 400) {
        col = mode === "zones" ? ZONE_COLORS.bg : [24, 24, 22];
      } else {
        const pt = add(add(camPos, mul(d, hit.t)), mul(hit.n, 1e-3));
        const n = hit.n;
        const ndl = dot(n, L);
        const vis = ndl > 0 ? shadowAmount(pt) : 0;
        const ao = occlusion(pt, n);
        const albedo = hit.obj === "ground" ? 0.55 : 0.82;
        const direct = Math.max(0, ndl) * vis * p.intensity;
        const sky = p.ambient * (0.5 + 0.5 * n[1]) * ao;
        const bounce = hit.obj === "form" ? p.bounce * groundLit * 0.55 * Math.max(0, -n[1] * 0.6 + 0.4 * (1 - Math.abs(n[1]))) * Math.max(0, 0.3 - ndl) * ao : 0;
        const hv = norm(sub(L, d));
        const spec = hit.obj === "form" && direct > 0 ? Math.pow(Math.max(0, dot(n, hv)), 60) * (1 - p.softness * 0.7) * p.intensity : 0;
        const lum = albedo * (direct + sky + bounce) + spec * 0.9;
        if (mode === "shaded") {
          const g = Math.round(255 * Math.min(1, Math.pow(Math.max(0, lum), 1 / 2.2)));
          col = hit.obj === "ground" ? [g * 0.96, g * 0.92, g * 0.86] as [number, number, number] : [g, g * 0.97, g * 0.92] as [number, number, number];
        } else {
          let z: Zone;
          if (hit.obj === "ground") {
            z = ao < 0.62 && vis < 0.5 ? "occlusion" : vis < 0.5 ? "cast" : "ground";
            if (ndl <= 0) z = "cast";
          } else if (ao < 0.55) z = "occlusion";
          else if (ndl > 0 && vis > 0.5) {
            z = spec > 0.35 ? "highlight" : ndl > 0.45 ? "light" : "halftone";
          } else if (ndl > 0 && vis <= 0.5) z = "cast"; // shadow cast onto the form by itself
          else if (ndl > -0.22) z = "core";
          else z = bounce > 0.035 ? "reflected" : "shadow";
          col = ZONE_COLORS[z];
        }
      }
      if (hit && hit.obj === "ground") {
        // fade the ground plane into the background with distance (atmospheric falloff)
        const f = Math.min(1, Math.max(0, (hit.t - 9) / 30));
        const bg = mode === "zones" ? ZONE_COLORS.bg : [24, 24, 22];
        col = [col[0] + (bg[0] - col[0]) * f, col[1] + (bg[1] - col[1]) * f, col[2] + (bg[2] - col[2]) * f];
      }
      img.data[j] = col[0];
      img.data[j + 1] = col[1];
      img.data[j + 2] = col[2];
      img.data[j + 3] = 255;
    }
  }
  return img;
}

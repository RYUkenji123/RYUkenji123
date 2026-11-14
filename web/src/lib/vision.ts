/**
 * Client-side, deterministic image processing used by the Reference Breakdown Studio.
 * Everything here is measured directly from pixels (no AI), so the UI labels these
 * layers as "computed".
 */

export interface Gray {
  w: number;
  h: number;
  /** Luminance 0..255, row-major. */
  data: Float32Array;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/** Rec. 709 luminance of an image, downscaled so the long edge is <= maxEdge. */
export function toGray(img: HTMLImageElement, maxEdge = 900): Gray {
  const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = 0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2];
  }
  return { w, h, data };
}

/** Brightness in [-100, 100], contrast in [-100, 100]. */
export function adjust(g: Gray, brightness: number, contrast: number): Gray {
  const c = contrast / 100;
  const f = (1.0157 * (c * 255 + 255)) / (255 * (1.0157 - c * 0.99)); // standard contrast curve
  const b = brightness * 1.28;
  const out = new Float32Array(g.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = f * (g.data[i] - 128) + 128 + b;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return { w: g.w, h: g.h, data: out };
}

/** Light blur to reduce texture noise before grouping values (separable box blur, 2 passes). */
export function blur(g: Gray, r: number): Gray {
  if (r <= 0) return g;
  const { w, h } = g;
  let src = g.data;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / (2 * r + 1);
        acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    const out = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    src = out;
  }
  return { w, h, data: src };
}

export function histogram(g: Gray): number[] {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i] | 0]++;
  return hist;
}

/** Otsu's threshold: the split that best separates the image into two value groups. */
export function otsu(g: Gray): number {
  const hist = histogram(g);
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/**
 * Thresholds for an N-value study.
 * - "equal": equal luminance steps (what a value scale looks like).
 * - "balanced": quantile split so each value group covers a similar share of the image,
 *   useful for low-contrast photos.
 */
export function valueThresholds(g: Gray, n: number, mode: "equal" | "balanced", twoValueThreshold?: number): number[] {
  if (n === 2) return [twoValueThreshold ?? otsu(g)];
  if (mode === "equal") return Array.from({ length: n - 1 }, (_, i) => ((i + 1) * 256) / n);
  const hist = histogram(g);
  const total = g.data.length;
  const out: number[] = [];
  let acc = 0, k = 1;
  for (let v = 0; v < 256 && k < n; v++) {
    acc += hist[v];
    while (k < n && acc >= (total * k) / n) {
      out.push(v + 0.5);
      k++;
    }
  }
  while (out.length < n - 1) out.push(255);
  return out;
}

/** Maps each pixel to a value group index 0..n-1 (0 = darkest). */
export function quantize(g: Gray, thresholds: number[]): Uint8Array {
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = g.data[i];
    let k = 0;
    while (k < thresholds.length && v >= thresholds[k]) k++;
    out[i] = k;
  }
  return out;
}

/** Display grey for value group k of n (paper white down to near-black). */
export const groupGrey = (k: number, n: number) => Math.round(18 + (k / (n - 1)) * (240 - 18));

export function renderGroups(g: Gray, groups: Uint8Array, n: number, palette?: [number, number, number][]): string {
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < groups.length; i++, j += 4) {
    if (palette) {
      const [r, gg, b] = palette[groups[i]];
      img.data[j] = r;
      img.data[j + 1] = gg;
      img.data[j + 2] = b;
    } else {
      const v = groupGrey(groups[i], n);
      img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
    }
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function renderGray(g: Gray): string {
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = g.data[i];
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function groupShares(groups: Uint8Array, n: number): number[] {
  const counts = new Array(n).fill(0);
  for (let i = 0; i < groups.length; i++) counts[groups[i]]++;
  return counts.map((c) => c / groups.length);
}

// --------------------------------------------------------------------------- edges

export interface Edges {
  w: number;
  h: number;
  mag: Float32Array;
  dir: Float32Array; // gradient direction (radians)
  mask: Uint8Array; // thinned edge pixels
}

/** Sobel gradients + non-maximum suppression + hysteresis-free percentile threshold. */
export function detectEdges(g: Gray, keepFraction = 0.08): Edges {
  const { w, h, data } = g;
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1], t = data[i - w], tr = data[i - w + 1];
      const l = data[i - 1], r = data[i + 1];
      const bl = data[i + w - 1], b = data[i + w], br = data[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      mag[i] = Math.hypot(gx, gy);
      dir[i] = Math.atan2(gy, gx);
    }
  }
  // non-maximum suppression
  const thin = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (!m) continue;
      const a = ((dir[i] * 180) / Math.PI + 180) % 180;
      let n1: number, n2: number;
      if (a < 22.5 || a >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
      else if (a < 67.5) { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
      else if (a < 112.5) { n1 = mag[i - w]; n2 = mag[i + w]; }
      else { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
      if (m >= n1 && m >= n2) thin[i] = m;
    }
  }
  // Hysteresis thresholds (Canny): the high threshold comes from the gradient distribution so
  // busy and clean images both work; weak edges survive only when connected to strong ones.
  const vals: number[] = [];
  for (let i = 0; i < mag.length; i += 2) if (mag[i] > 4) vals.push(mag[i]);
  vals.sort((a, b) => b - a);
  const pct = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * keepFraction))] : Infinity;
  const high = Math.max(40, pct);
  const low = high * 0.4;
  const mask = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < thin.length; i++) if (thin[i] >= high) { mask[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
      const j = i + d;
      if (j >= 0 && j < thin.length && !mask[j] && thin[j] >= low) { mask[j] = 1; stack.push(j); }
    }
  }
  return { w, h, mag, dir, mask };
}

export function renderEdges(e: Edges, color = [240, 168, 104]): string {
  const c = document.createElement("canvas");
  c.width = e.w;
  c.height = e.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(e.w, e.h);
  for (let i = 0, j = 0; i < e.mask.length; i++, j += 4) {
    if (e.mask[i]) {
      img.data[j] = color[0];
      img.data[j + 1] = color[1];
      img.data[j + 2] = color[2];
      img.data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

// --------------------------------------------------------------------------- lines + vanishing points

export interface Segment {
  x1: number; y1: number; x2: number; y2: number; // normalized 0..1
  len: number; // normalized by image diagonal
  angle: number; // radians, [0, PI)
  vp: number; // index of supporting vanishing point, -1 if none
}

/**
 * Hough transform on the edge mask, then each peak is walked along the edge pixels to
 * recover the longest supported segment (with small gaps tolerated).
 */
export function detectSegments(e: Edges, maxLines = 60): Segment[] {
  const { w, h, mask } = e;
  const nTheta = 180;
  const diag = Math.hypot(w, h);
  const nRho = Math.ceil(diag * 2) + 1;
  const acc = new Uint16Array(nTheta * nRho);
  const cos = new Float32Array(nTheta), sin = new Float32Array(nTheta);
  for (let t = 0; t < nTheta; t++) {
    cos[t] = Math.cos((t * Math.PI) / nTheta);
    sin[t] = Math.sin((t * Math.PI) / nTheta);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let t = 0; t < nTheta; t++) {
        const r = Math.round(x * cos[t] + y * sin[t] + diag);
        acc[t * nRho + r]++;
      }
    }
  }
  // collect local maxima
  const minVotes = Math.max(20, Math.round(Math.min(w, h) * 0.08));
  const peaks: { t: number; r: number; v: number }[] = [];
  for (let t = 0; t < nTheta; t++) {
    for (let r = 1; r < nRho - 1; r++) {
      const v = acc[t * nRho + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -3; dt <= 3 && isMax; dt++) {
        const tt = (t + dt + nTheta) % nTheta;
        for (let dr = -4; dr <= 4; dr++) {
          if (!dt && !dr) continue;
          const rr = r + dr;
          if (rr < 0 || rr >= nRho) continue;
          if (acc[tt * nRho + rr] > v) { isMax = false; break; }
        }
      }
      if (isMax) peaks.push({ t, r, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);

  const segs: Segment[] = [];
  const used = new Uint8Array(w * h);
  const minLen = Math.min(w, h) * 0.07;
  for (const p of peaks.slice(0, maxLines * 4)) {
    if (segs.length >= maxLines) break;
    const c = cos[p.t], s = sin[p.t], rho = p.r - diag;
    // walk along the line direction (-s, c)
    const x0 = c * rho, y0 = s * rho;
    let best: [number, number] | null = null;
    let runStart: number | null = null, lastHit = -1e9;
    const hits: number[] = [];
    for (let k = -diag; k <= diag; k += 1) {
      const x = Math.round(x0 - s * k), y = Math.round(y0 + c * k);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      let hit = false;
      for (let d = -1; d <= 1 && !hit; d++) {
        const xx = Math.round(x + c * d), yy = Math.round(y + s * d);
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] && !used[yy * w + xx]) hit = true;
      }
      if (hit) {
        if (runStart === null || k - lastHit > 6) runStart = k;
        lastHit = k;
        hits.push(k);
        if (!best || k - runStart > best[1] - best[0]) best = [runStart, k];
      }
    }
    if (!best || best[1] - best[0] < minLen) continue;
    const [k1, k2] = best;
    const ax = x0 - s * k1, ay = y0 + c * k1, bx = x0 - s * k2, by = y0 + c * k2;
    // mark used pixels so near-duplicate lines are not picked again
    for (let k = k1; k <= k2; k++) {
      const x = Math.round(x0 - s * k), y = Math.round(y0 + c * k);
      for (let d = -2; d <= 2; d++) {
        const xx = Math.round(x + c * d), yy = Math.round(y + s * d);
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) used[yy * w + xx] = 1;
      }
    }
    let angle = Math.atan2(by - ay, bx - ax);
    if (angle < 0) angle += Math.PI;
    if (angle >= Math.PI) angle -= Math.PI;
    segs.push({ x1: ax / w, y1: ay / h, x2: bx / w, y2: by / h, len: Math.hypot(bx - ax, by - ay) / diag, angle, vp: -1 });
  }
  return segs;
}

export interface VanishingPoint {
  x: number; // normalized, may be far outside 0..1
  y: number;
  support: number; // number of segments
  weight: number; // summed segment length
  kind: "finite" | "vertical" | "horizontal";
}

export interface PerspectiveEstimate {
  segments: Segment[];
  vps: VanishingPoint[];
  horizonY: number | null;
  guess: "none_or_flat" | "one_point" | "two_point" | "three_point";
  notes: string[];
}

/**
 * RANSAC-style vanishing point search in pixel space (aspect ratio preserved).
 * A segment supports a VP if the line from its midpoint to the VP is within ~2.5°.
 */
export function estimatePerspective(segs: Segment[], aspect: number): PerspectiveEstimate {
  const notes: string[] = [];
  const S = segs.map((s) => ({ ...s, ax: s.x1 * aspect, ay: s.y1, bx: s.x2 * aspect, by: s.y2 }));
  const tol = (2.5 * Math.PI) / 180;
  const remaining = new Set(S.map((_, i) => i));
  const vps: VanishingPoint[] = [];

  const angleTo = (s: (typeof S)[number], px: number, py: number) => {
    const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
    const d1 = Math.atan2(s.by - s.ay, s.bx - s.ax);
    const d2 = Math.atan2(py - my, px - mx);
    let d = Math.abs(d1 - d2) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    return d;
  };

  for (let round = 0; round < 3 && remaining.size >= 3; round++) {
    const idx = [...remaining];
    let best = { score: 0, x: 0, y: 0, members: [] as number[] };
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        const s1 = S[idx[a]], s2 = S[idx[b]];
        // intersection of the two infinite lines
        const d1x = s1.bx - s1.ax, d1y = s1.by - s1.ay, d2x = s2.bx - s2.ax, d2y = s2.by - s2.ay;
        const den = d1x * d2y - d1y * d2x;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((s2.ax - s1.ax) * d2y - (s2.ay - s1.ay) * d2x) / den;
        const px = s1.ax + t * d1x, py = s1.ay + t * d1y;
        if (!isFinite(px) || Math.hypot(px - aspect / 2, py - 0.5) > 40) continue;
        let score = 0;
        const members: number[] = [];
        for (const i of idx) {
          if (angleTo(S[i], px, py) < tol) {
            score += S[i].len;
            members.push(i);
          }
        }
        if (members.length >= 3 && score > best.score) best = { score, x: px, y: py, members };
      }
    }
    if (!best.members.length) break;
    for (const i of best.members) {
      remaining.delete(i);
      segs[i].vp = vps.length;
    }
    const far = Math.hypot(best.x - aspect / 2, best.y - 0.5) > 12;
    const dirAngle = Math.abs(Math.atan2(best.y - 0.5, best.x - aspect / 2));
    const kind: VanishingPoint["kind"] = !far ? "finite" : dirAngle > Math.PI / 4 && dirAngle < (3 * Math.PI) / 4 ? "vertical" : "horizontal";
    vps.push({ x: best.x / aspect, y: best.y, support: best.members.length, weight: best.score, kind });
  }

  const finite = vps.filter((v) => v.kind === "finite");
  const verticalFinite = finite.filter((v) => v.y < -0.6 || v.y > 1.6);
  const horizonVps = finite.filter((v) => !verticalFinite.includes(v));
  let horizonY: number | null = null;
  if (horizonVps.length) horizonY = horizonVps.reduce((a, v) => a + v.y * v.weight, 0) / horizonVps.reduce((a, v) => a + v.weight, 0);

  let guess: PerspectiveEstimate["guess"] = "none_or_flat";
  if (horizonVps.length >= 2 && verticalFinite.length) guess = "three_point";
  else if (horizonVps.length >= 2) guess = "two_point";
  else if (horizonVps.length === 1 && verticalFinite.length) guess = "three_point";
  else if (horizonVps.length === 1) guess = "one_point";
  if (horizonVps.length >= 2 && Math.abs(horizonVps[0].y - horizonVps[1].y) > 0.25)
    notes.push("The two horizontal vanishing points are not level, so the camera may be tilted or the lines belong to differently-oriented objects.");
  if (segs.length < 6) notes.push("Few straight edges were found; organic subjects often have no measurable perspective lines.");
  if (vps.some((v) => v.kind !== "finite")) notes.push("Some line families are nearly parallel in the image, meaning their vanishing point is very far away (close to orthographic in that direction).");
  return { segments: segs, vps, horizonY, guess, notes };
}

/** Bounding box of the darker/foreground subject via Otsu split + border statistics. Used for measured aspect ratio. */
export function measureSubjectBox(g: Gray): { x: number; y: number; w: number; h: number } | null {
  const t = otsu(g);
  const { w, h, data } = g;
  // decide which side of the threshold is "background" from the border pixels
  let borderDark = 0, borderN = 0;
  for (let x = 0; x < w; x++) { borderN += 2; if (data[x] < t) borderDark++; if (data[(h - 1) * w + x] < t) borderDark++; }
  for (let y = 0; y < h; y++) { borderN += 2; if (data[y * w] < t) borderDark++; if (data[y * w + w - 1] < t) borderDark++; }
  const bgIsDark = borderDark / borderN > 0.5;
  const fgShare = borderDark / borderN;
  if (fgShare > 0.35 && fgShare < 0.65) return null; // background not uniform enough to separate
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fg = bgIsDark ? data[y * w + x] >= t : data[y * w + x] < t;
      if (fg) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  if (count < w * h * 0.01 || maxX < 0) return null;
  return { x: minX / w, y: minY / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h };
}

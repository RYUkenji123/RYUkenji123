import { Fragment, type ReactNode } from "react";

/** Sanitizes model-written SVG: only drawing elements/attributes survive; no scripts, links, events or styles. */
const SVG_TAGS = new Set(["svg", "g", "path", "line", "polyline", "polygon", "rect", "circle", "ellipse", "text", "tspan", "defs", "marker", "title"]);
const SVG_ATTRS = new Set([
  "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline", "id", "marker-end", "marker-start",
  "markerwidth", "markerheight", "refx", "refy", "orient", "xmlns",
]);

export function sanitizeSvg(src: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(src, "image/svg+xml");
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
    const walk = (el: Element) => {
      for (const child of [...el.children]) {
        if (!SVG_TAGS.has(child.nodeName.toLowerCase())) child.remove();
        else walk(child);
      }
      for (const attr of [...el.attributes]) {
        const n = attr.name.toLowerCase();
        const v = attr.value;
        if (!SVG_ATTRS.has(n) || /url\(|javascript:|expression/i.test(v)) {
          if (!(n.startsWith("marker") && /^url\(#[\w-]+\)$/.test(v))) el.removeAttribute(attr.name);
        }
      }
    };
    walk(root);
    root.removeAttribute("width");
    root.removeAttribute("height");
    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Small, safe Markdown renderer for tutor replies (paragraphs, headings, lists, bold/italic/code, ```svg diagrams). */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)/.exec(line.trim());
    if (fence) {
      const lang = fence[1].toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      const src = body.join("\n");
      if (lang === "svg" || (lang === "xml" && src.includes("<svg")) || (lang === "html" && src.trim().startsWith("<svg"))) {
        const clean = sanitizeSvg(src);
        if (clean) blocks.push(<div key={key++} className="diagram" dangerouslySetInnerHTML={{ __html: clean }} />);
        else if (i >= lines.length) blocks.push(<div key={key++} className="diagram faint small">Drawing diagram…</div>);
      } else {
        blocks.push(<pre key={key++} className="explain small" style={{ whiteSpace: "pre-wrap" }}>{src}</pre>);
      }
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(line);
    if (h) {
      blocks.push(<h4 key={key++}>{inline(h[2])}</h4>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={key++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</L>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```|^#{1,4}\s|^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key++}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p)}</Fragment>)}</p>);
  }
  return <div className="md">{blocks}</div>;
}

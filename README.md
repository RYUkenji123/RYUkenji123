# DrawLab

An AI-powered drawing learning studio. DrawLab breaks reference images into shapes, 3D forms, values, perspective and proportions, then teaches you how to draw them step by step.

## Features

| Area | What it does | How it works |
|---|---|---|
| **Reference Breakdown Studio** | Upload a photo, then toggle overlay layers on it: silhouette, primary/secondary shapes, negative space, 3D forms with axes and cross-contours, light direction, tonal regions, horizon/vanishing points/converging lines, perspective grid, landmarks, alignment and symmetry guides, subject ratio | Claude vision returns a structured analysis with normalized coordinates. The overlays are drawn in SVG over the image, with zoom and pan. |
| Computed layers (no AI) | Original, grayscale, 2/3/5/7-value studies, brightness/contrast, "squint" simplification, 5-band tone map, edge map, detected straight edges, vanishing points estimated from those edges, measured subject box | Runs in the browser on the image's pixels: luminance, Otsu thresholding, quantile grouping, Sobel + non-max suppression + hysteresis, a Hough transform, and RANSAC VP fitting |
| **Step-by-step mode** | 10 construction steps written for the uploaded reference. Each step has an explanation, a practice task, and the overlay layers that demonstrate it. Completion is saved. | From the same AI analysis |
| **Perspective Academy** | 10 lessons, from 3D space to foreshortening. You can rotate boxes, tilt the camera, change the lens and the eye level, and drag vanishing points and the horizon. | A pinhole-camera renderer computes the VPs from the geometry. Boxes can also be constructed by hand from VPs. |
| **Light & Shadow Academy** | 7 lessons. Sphere, cube and cylinder scenes where you drag the light, plus a "light zones" view (highlight, light, halftone, core shadow, reflected light, cast shadow, occlusion) | A small CPU ray tracer with shadow rays, soft-light sampling, ground bounce and ambient occlusion |
| **Daily exercises** | 3 exercises a day, chosen for your skill level and weighted toward the categories you've practised least. Includes a timer, completion logging and a self-assessment. | Deterministic daily selection on the server |
| **Progress tracker** | Upload drawings with self-ratings on 6 criteria. Shows a trend chart, a before/after comparison slider, and optional AI feedback | **Measured facts**, **self-ratings** and **AI opinion** are shown separately and labelled as such |
| **AI tutor** | Chat that teaches the principle first and then gives an exercise. Answers can include inline SVG diagrams, and you can attach your drawings or references | Claude responses streamed over SSE. Model-written SVG is sanitized before rendering. |
| Accounts | Email/password accounts (scrypt), saved projects, drawing history, activity streak | SQLite (`node:sqlite`) |

If no API key is configured, or the AI declines or can't read an image, the studio says so and the computed tools keep working. The AI analysis has an `analyzable` flag, a confidence level and a list of ambiguities, and the UI shows all three. Where the AI's perspective reading and the line-fit estimate disagree, both are shown with an explanation.

## Architecture

```
server/   Express + TypeScript API (tsx), SQLite storage, Anthropic SDK
  src/ai.ts          Claude calls: structured reference analysis, drawing critique, tutor streaming
  src/index.ts       REST API (auth, projects, drawings, activity, dashboard, tutor SSE)
  src/curriculum.ts  Categories, exercise library, lesson ids, daily selection
web/      React + Vite + TypeScript SPA
  src/lib/vision.ts      Client-side image processing (values, edges, Hough, VP estimation)
  src/lib/raytrace.ts    Light & shadow ray tracer
  src/components/        Overlays, Scene3D (perspective renderer), VPConstructor, Markdown
  src/pages/             Dashboard, Studio, Workspace, academies, exercises, progress, tutor
```

AI calls use `claude-opus-5-5` with adaptive thinking and structured outputs (Zod schemas). They also use the server-side refusal fallback (`fallbacks: "default"`), which retries a request on another model if the first one declines. To change the model, set `DRAWLAB_MODEL`.

## Running locally

Requires Node 22.13+.

```bash
npm install          # root dev tooling
npm run setup        # installs server + web dependencies
cp server/.env.example server/.env   # then set ANTHROPIC_API_KEY
npm run dev          # API on :8787, web on :5173 (proxied)
```

Production: `npm run build && npm start` serves the built SPA and the API from port 8787. Data (SQLite + uploads) is stored in `server/data/` unless you set `DRAWLAB_DATA_DIR`.

## Installing on a phone

DrawLab is an installable web app (PWA), with a manifest, app icons and an offline app shell.

1. Make the server reachable from the phone:
   - **Same Wi-Fi:** run `npm run build && npm start` on your computer, then open `http://<your-computer-ip>:8787` on the phone. On plain `http://` the home-screen icon works, but there's no offline support or full install prompt (browsers only allow those on HTTPS).
   - **Anywhere:** on [Render](https://render.com), choose **New → Blueprint**, pick this repository and enter your `ANTHROPIC_API_KEY`. `render.yaml` sets up everything else. Or deploy to another HTTPS host (Render, Railway, Fly.io…) with `NODE_ENV=production`, `ANTHROPIC_API_KEY`, and `DRAWLAB_DATA_DIR` pointing at a persistent disk.
2. Install the app:
   - **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** tap **Install** on the dashboard banner, or ⋮ → **Install app**.

On phones you get a bottom tab bar, pinch-to-zoom and drag-to-pan in the studio, and bigger touch targets in the academies. The Perspective and Light academies keep working offline once loaded. Anything that needs your account or the AI needs a connection.

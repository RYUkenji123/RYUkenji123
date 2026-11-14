import type { ReactNode } from "react";

const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  home: () => <I><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></I>,
  studio: () => <I><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2.5" /><path d="M21 16l-5-5-9 9" /></I>,
  cube: () => <I><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></I>,
  sun: () => <I><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>,
  timer: () => <I><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></I>,
  chart: () => <I><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>,
  chat: () => <I><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></I>,
  shapes: () => <I><circle cx="8" cy="8" r="5" /><path d="M14 21l4-7 4 7z" /><rect x="3" y="15" width="7" height="6" /></I>,
  forms: () => <I><ellipse cx="12" cy="5" rx="6" ry="2.5" /><path d="M6 5v13c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" /></I>,
  values: () => <I><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 5v14M15 5v14" /><path d="M3 9h6M3 13h6M9 9h6" /></I>,
  perspective: () => <I><path d="M2 12h20" /><path d="M12 12L3 21M12 12l9 9M12 12L6 3M12 12l6-9" /></I>,
  ruler: () => <I><rect x="2" y="8" width="20" height="8" rx="1" /><path d="M6 8v3M10 8v4M14 8v3M18 8v4" /></I>,
  steps: () => <I><path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" /></I>,
  upload: () => <I><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></I>,
  eye: () => <I><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>,
  eyeOff: () => <I><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></I>,
  panel: () => <I><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></I>,
  plus: () => <I><path d="M12 5v14M5 12h14" /></I>,
  minus: () => <I><path d="M5 12h14" /></I>,
  fit: () => <I><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></I>,
  trash: () => <I><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></I>,
  sparkle: () => <I><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></I>,
  check: () => <I><path d="M5 12l5 5 9-10" /></I>,
  arrowL: () => <I><path d="M15 6l-6 6 6 6" /></I>,
  arrowR: () => <I><path d="M9 6l6 6-6 6" /></I>,
  flame: () => <I><path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z" /></I>,
  logout: () => <I><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></I>,
  play: () => <I><path d="M7 4l13 8-13 8z" /></I>,
  pause: () => <I><path d="M7 4h3v16H7zM14 4h3v16h-3z" /></I>,
  reset: () => <I><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6" /></I>,
  paperclip: () => <I><path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></I>,
  send: () => <I><path d="M4 12l16-8-6 16-2.5-6.5z" /></I>,
};

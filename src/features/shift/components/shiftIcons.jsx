/** Íconos de los inicios de planta (trazo, heredan el color del texto). */
const svg = (children, size = 22) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
export const Icon = {
  camera: (s) => svg(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>, s),
  calibrate: (s) => svg(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4" /></>, s),
  load: (s) => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>, s),
  alert: (s) => svg(<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>, s),
  task: (s) => svg(<><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>, s),
  clock: (s) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, s),
  grid: (s) => svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>, s),
  user: (s) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>, s),
  bars: (s) => svg(<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />, s),
  truck: (s) => svg(<><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></>, s),
  plant: (s) => svg(<><path d="M3 21V8l9-5 9 5v13" /><path d="M8 21v-7h8v7" /></>, s),
  wrench: (s) => svg(<path d="M14 3l7 7-11 11H3v-7z" />, s),
  doc: (s) => svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>, s),
  refresh: (s) => svg(<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>, s),
  back: (s) => svg(<path d="M15 18l-6-6 6-6" />, s),
  plus: (s) => svg(<path d="M12 5v14M5 12h14" />, s),
  swap: (s) => svg(<><path d="M4 8h14l-3-3M20 16H6l3 3" /></>, s),
  box: (s) => svg(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>, s),
  pen: (s) => svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>, s),
  exit: (s) => svg(<><path d="M9 21H5V3h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>, s),
  selfie: (s) => svg(<><rect x="6" y="2" width="12" height="20" rx="2.5" /><circle cx="12" cy="10" r="2.5" /><path d="M8.5 16c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2" /></>, s),
  play: (s) => svg(<path d="M8 5v14l11-7z" />, s),
}

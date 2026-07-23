export type IconName =
  | 'dashboard' | 'yoga' | 'physio' | 'sports' | 'gym' | 'posture'
  | 'sessions' | 'analytics' | 'reports' | 'settings' | 'collapse' | 'panel'
  | 'spark' | 'chevron' | 'plus' | 'pulse' | 'play' | 'square'
  | 'skip-back' | 'skip-fwd' | 'lab';

const paths: Record<IconName, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  yoga: '<path d="M12 3v7"/><path d="M7 7.5 12 10l5-2.5"/><path d="M8 21l4-7 4 7"/><circle cx="12" cy="3" r="1.5"/>',
  physio: '<path d="M12 21V3"/><path d="M3 12h18"/><path d="M5.5 5.5l13 13"/><path d="M18.5 5.5l-13 13"/>',
  sports: '<path d="M5 3c5 2 9 6 11 11"/><path d="M3 11c4 0 8 2 10 5"/><path d="M12 3c1 5 4 9 9 11"/><circle cx="12" cy="12" r="9"/>',
  gym: '<path d="M4 9v6"/><path d="M7 7v10"/><path d="M17 7v10"/><path d="M20 9v6"/><path d="M7 12h10"/>',
  posture: '<path d="M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/><path d="M8 21c0-5 1.5-8 4-8s4 3 4 8"/><path d="M6 12l6 2 6-2"/>',
  sessions: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  analytics: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/>',
  reports: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.04 2.04-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.88v-.09A1.7 1.7 0 0 0 10.88 18.35a1.7 1.7 0 0 0-1.88.34l-.06.06-2.04-2.04.06-.06A1.7 1.7 0 0 0 7.3 14.77 1.7 1.7 0 0 0 5.74 13.74h-.09v-2.88h.09A1.7 1.7 0 0 0 7.3 9.83a1.7 1.7 0 0 0-.34-1.88L6.9 7.9l2.04-2.04.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.09h2.88v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7.9l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2.88h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  collapse: '<path d="m15 18-6-6 6-6"/><path d="M21 4v16"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  spark: '<path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  play: '<path d="M5 3l14 9-14 9z"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  'skip-back': '<path d="m11 17-4-5 4-5"/><path d="m18 17-4-5 4-5"/><path d="M19 5v14"/>',
  'skip-fwd': '<path d="m13 7 4 5-4 5"/><path d="m6 7 4 5-4 5"/><path d="M5 5v14"/>',
  lab: '<path d="M8 3h8v4l3 3v3H5v-3l3-3V3z"/><path d="M5 17h14v4H5z"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="10" r="1"/>',
};

export function icon(name: IconName, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

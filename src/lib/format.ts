export const compact = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
};

export const num = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US');

export const pct = (n: number): string => `${n > 0 ? '+' : ''}${Math.round(n)}%`;

export const pos = (p: number | null | undefined): string =>
  p === null || p === undefined ? '—' : p < 10 ? p.toFixed(1) : String(Math.round(p));

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const shortDate = (d: Date | string): string => {
  const x = new Date(d);
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
};

export const relDate = (d: Date | string, now = new Date('2026-09-14T09:00:00Z')): string => {
  const days = Math.round((now.getTime() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
};

/** "The day the prototype lives on." Keeps the seeded calendar meaningful. */
export const TODAY = new Date('2026-09-14T09:00:00Z');

export const titleCase = (s: string): string =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const enumLabel = (s: string): string =>
  s.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

/** Build an SVG polyline path for a sparkline. */
export const sparkPath = (values: number[], w = 78, h = 26): string => {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

export const scoreColor = (n: number): string =>
  n >= 80 ? 'var(--green)' : n >= 65 ? 'var(--blue)' : n >= 50 ? 'var(--amber)' : 'var(--red)';

export const scoreLabel = (n: number): string =>
  n >= 90 ? 'Excellent' : n >= 78 ? 'Good' : n >= 65 ? 'Fair' : n >= 50 ? 'Needs work' : 'Poor';

export const CAL_TYPE_LABEL: Record<string, string> = {
  BLOG: 'Blog',
  PAGE: 'Page',
  UPDATE: 'Update',
  INTERNAL_LINKING: 'Links',
  TECHNICAL: 'Technical',
  REFRESH: 'Refresh',
};

export const OPP_TYPE_LABEL: Record<string, string> = {
  NEW_CONTENT: 'New Content',
  UPDATE_PAGE: 'Update Page',
  INTERNAL_LINKING: 'Internal Linking',
  TECHNICAL: 'Technical',
  KEYWORD: 'Keyword',
  COMPETITOR: 'Competitor',
};

export const HEALTH_LABEL: Record<string, { text: string; tone: string }> = {
  GOOD: { text: 'Good', tone: 'green' },
  NEEDS_WORK: { text: 'Needs work', tone: 'amber' },
  POOR: { text: 'Poor', tone: 'red' },
  OPPORTUNITY: { text: 'Opportunity', tone: 'blue' },
};

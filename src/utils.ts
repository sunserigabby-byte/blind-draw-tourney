import type { PlayDiv } from './types';

export const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
export const clampN = (n: number, min: number) => isFinite(n) ? Math.max(min, Math.floor(n)) : min;

export const shuffle = <T,>(arr: T[], seed?: number) => {
  const a = arr.slice();
  let r = seed ?? Math.floor(Math.random() * 1e9);
  const rand = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const UPPER_COURTS = [1, 2, 3, 4, 5];
export const LOWER_COURTS = [6, 7, 8, 9, 10];

export const courtFor = (division: PlayDiv, round: number, slot: number) => {
  const pool = division === 'UPPER' ? UPPER_COURTS : LOWER_COURTS;
  return pool[(slot - 1) % pool.length];
};

export function parseScore(text?: string): [number, number] | null {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(b)) return null;
  return [a, b];
}

export function isValidDoublesScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

export function isValidQuadsScore(a: number, b: number, cap: 21 | 25 = 25) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  // cap 21: to 21, win by 2, hard cap 23 (deuce resolves at 23-21)
  // cap 25: to 21, win by 2, hard cap 25 (deuce resolves at 25-23)
  if (cap === 21) return max >= 21 && max <= 23 && diff >= 2;
  return max >= 21 && max <= 25 && diff >= 2;
}

export function isValidTriplesScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

export function isValidKobScore(a: number, b: number) {
  // Rally to 21, cap 23, win by 2
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && max <= 23 && diff >= 2;
}

// ── KOB/QOB standings computation (shared by FinalsGenerator + Leaderboard) ──

import type { KobGameRow, PlayerStats } from './types';

export function computeStandings(games: KobGameRow[], roster: string[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  for (const p of roster) stats.set(slug(p), { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 });

  for (const g of games) {
    const parsed = parseScore(g.scoreText);
    if (!parsed || !isValidKobScore(parsed[0], parsed[1])) continue;
    const [s1, s2] = parsed;
    const t1Win = s1 > s2;
    for (const p of g.t1) {
      const key = slug(p);
      if (!stats.has(key)) continue;
      const cur = stats.get(key)!;
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 1 : 0), L: cur.L + (t1Win ? 0 : 1), PF: cur.PF + s1, PA: cur.PA + s2, GP: cur.GP + 1 });
    }
    for (const p of g.t2) {
      const key = slug(p);
      if (!stats.has(key)) continue;
      const cur = stats.get(key)!;
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 0 : 1), L: cur.L + (t1Win ? 1 : 0), PF: cur.PF + s2, PA: cur.PA + s1, GP: cur.GP + 1 });
    }
  }

  return [...stats.values()]
    .filter(s => s.GP > 0)
    .sort((a, b) => {
      if (b.W !== a.W) return b.W - a.W;
      const pd = (b.PF - b.PA) - (a.PF - a.PA);
      return pd !== 0 ? pd : b.PF - a.PF;
    });
}

export function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

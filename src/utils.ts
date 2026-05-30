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

// First token of a full name, e.g. "Alex Smith" -> "Alex"
export const firstName = (full: string) => (full || '').trim().split(/\s+/)[0] || '';

// Fun default team names for Mickey & Minnie (pool play + playoff re-draw).
export const FUN_TEAM_NAMES = [
  'Sand Sharks', 'Beach Bums', 'Net Ninjas', 'Spike Squad', 'Dig Dynasty',
  'Block Party', 'Sets on the Beach', 'Bump Set Spikers', 'Sandstorm', 'Wave Riders',
  'Diggity Dogs', 'Aces Wild', 'Pancake Pals', 'Kong Kings', 'Shankapotamus',
  'Tip Top', 'Setter Uppers', 'Beach Please', 'Salty Spikers', 'Volley Llamas',
  'The Sandbaggers', 'Hot Shots', "Sun's Out", 'Notorious DIG', 'Free Ballers',
  'Dinks & Drinks', 'Sandy Cheeks', 'Net Gains', 'Spike Force', 'Bumpin Uglies',
  'The Pokey Sets', 'Served Cold',
];

export function pickFunTeamNames(count: number): string[] {
  const shuffled = shuffle(FUN_TEAM_NAMES);
  return Array.from({ length: count }, (_, i) => shuffled[i] ?? `Team ${i + 1}`);
}

// Parse the Pairs textarea into groups of names (split by & , / or +).
function parseMickeyPairs(text: string): string[][] {
  return (text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(/[&/+,]/).map(s => s.trim()).filter(Boolean))
    .filter(g => g.length >= 2);
}

// Member list for a Mickey & Minnie team, grouping any pairs that are both on the
// team with a slash. e.g. "Amanda/Chance, Millen, Angie"
export function mickeyMemberList(players: string[], pairsText = ''): string {
  const pairs = parseMickeyPairs(pairsText);
  const teamSlugs = new Set(players.map(slug));
  const used = new Set<string>();
  const parts: string[] = [];
  for (const p of players) {
    const ps = slug(p);
    if (used.has(ps)) continue;
    const pair = pairs.find(pr => pr.some(m => slug(m) === ps) && pr.every(m => teamSlugs.has(slug(m))));
    if (pair) {
      parts.push(pair.map(firstName).join('/'));
      pair.forEach(m => used.add(slug(m)));
    } else {
      parts.push(firstName(p));
      used.add(ps);
    }
  }
  return parts.join(', ');
}

// Team display: "Fun Name (Amanda/Chance, Millen, Angie)"
export function mickeyTeamLabel(team: { name: string; players: string[] }, pairsText = ''): string {
  const inner = mickeyMemberList(team.players, pairsText);
  return inner ? `${team.name} (${inner})` : team.name;
}

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

// ── Universal configurable score validation ─────────────────────────────────
// Returns true if the score meets the current rules.
// Rules: winner must reach `playTo`, win by 2 — unless at `cap`, then win by 1.
import type { ScoreSettings } from './types';

export function isValidScore(a: number, b: number, settings: ScoreSettings): boolean {
  const max = Math.max(a, b);
  const diff = Math.abs(a - b);
  if (a === b) return false;                         // ties never valid
  if (max < settings.playTo) return false;           // nobody reached play-to
  if (settings.cap !== null && max > settings.cap) return false; // over cap
  if (settings.cap !== null && max === settings.cap) return diff >= 1; // at cap, win by 1 OK
  return diff >= 2;                                  // under cap or no cap, win by 2
}

// Returns true if score parses and has a clear winner (used for standings).
// This is intentionally lenient — standings count any parseable score regardless of rules.
export function isScoredGame(scoreText?: string): boolean {
  const p = parseScore(scoreText);
  return p !== null && p[0] !== p[1];
}

// Legacy wrappers — kept so existing code still compiles during migration
export function isValidDoublesScore(a: number, b: number) {
  return isValidScore(a, b, { playTo: 21, cap: null });
}
export function isValidQuadsScore(a: number, b: number, cap: 21 | 25 = 25) {
  return isValidScore(a, b, { playTo: 21, cap });
}
export function isValidTriplesScore(a: number, b: number) {
  return isValidScore(a, b, { playTo: 21, cap: null });
}
export function isValidKobScore(a: number, b: number) {
  return isValidScore(a, b, { playTo: 21, cap: 23 });
}

// ── KOB/QOB standings computation (shared by FinalsGenerator + Leaderboard) ──

import type { KobGameRow, PlayerStats } from './types';

export function computeStandings(games: KobGameRow[], roster: string[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  for (const p of roster) stats.set(slug(p), { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 });

  for (const g of games) {
    const parsed = parseScore(g.scoreText);
    if (!parsed || parsed[0] === parsed[1]) continue;
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

// ── Mickey & Minnie standings + bracket helpers ──────────────────────────────

import type { MickeyMatchRow, MickeyTeam } from './types';

export type MickeyTeamStat = { W: number; L: number; PD: number; sets: number };

// Per-team record across both sets (Mickey + Minnie) of every pool matchup.
// Wins counted per set; PD is the running point differential.
export function computeMickeyTeamStats(
  matches: MickeyMatchRow[],
  teams: MickeyTeam[],
): Map<string, MickeyTeamStat> {
  const stats = new Map<string, MickeyTeamStat>();
  for (const t of teams) stats.set(t.id, { W: 0, L: 0, PD: 0, sets: 0 });

  const applySet = (scoreText: string | undefined, aId: string, bId: string) => {
    const s = parseScore(scoreText);
    if (!s || s[0] === s[1]) return;
    const [x, y] = s;
    const diff = Math.abs(x - y);
    const aWon = x > y;
    const a = stats.get(aId);
    const b = stats.get(bId);
    if (a) { a.sets++; if (aWon) { a.W++; a.PD += diff; } else { a.L++; a.PD -= diff; } }
    if (b) { b.sets++; if (aWon) { b.L++; b.PD -= diff; } else { b.W++; b.PD += diff; } }
  };

  for (const m of matches) {
    applySet(m.mickeyScore, m.teamAId, m.teamBId);
    applySet(m.minnieScore, m.teamAId, m.teamBId);
  }
  return stats;
}

// Winner of a playoff match by games won (majority of the games actually played).
// Handles a single game (round 1/2) or best-of-3 match play (semis/final).
export function mickeyGamesWinner(games?: string[], score?: string): 'team1' | 'team2' | null {
  const list = games && games.length ? games : score ? [score] : [];
  let a = 0, b = 0;
  for (const g of list) {
    const p = parseScore(g);
    if (!p || p[0] === p[1]) continue;
    if (p[0] > p[1]) a++; else b++;
  }
  if (a === b) return null;
  return a > b ? 'team1' : 'team2';
}

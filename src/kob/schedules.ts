// Shared KOB/QOB rotating-partner schedules for pool sizes 4–8.
// Used by both PoolGenerator (pool play) and FinalsGenerator (finals brackets).

export type ScheduleEntry = {
  t1: [number, number];
  t2: [number, number];
  sitters: number[];
  courtOffset: number; // 0 = main court, 1 = second court (for pool-of-8)
};

// Pool of 4 — 3 games, 0 sitters, everyone partners with everyone once.
const POOL4: ScheduleEntry[] = [
  { t1: [0,1], t2: [2,3], sitters: [], courtOffset: 0 },
  { t1: [0,2], t2: [1,3], sitters: [], courtOffset: 0 },
  { t1: [0,3], t2: [1,2], sitters: [], courtOffset: 0 },
];

// Pool of 5 — 5 games, each sits once, everyone partners with everyone once.
const POOL5: ScheduleEntry[] = [
  { t1: [0,1], t2: [2,3], sitters: [4], courtOffset: 0 },
  { t1: [0,2], t2: [1,4], sitters: [3], courtOffset: 0 },
  { t1: [0,3], t2: [2,4], sitters: [1], courtOffset: 0 },
  { t1: [0,4], t2: [1,3], sitters: [2], courtOffset: 0 },
  { t1: [1,2], t2: [3,4], sitters: [0], courtOffset: 0 },
];

// Pool of 6 — 6 games, each plays 4 and sits 2. Min sitting for pool-of-6.
const POOL6: ScheduleEntry[] = [
  { t1: [0,1], t2: [2,3], sitters: [4,5], courtOffset: 0 },
  { t1: [0,4], t2: [1,5], sitters: [2,3], courtOffset: 0 },
  { t1: [2,4], t2: [3,5], sitters: [0,1], courtOffset: 0 },
  { t1: [0,2], t2: [1,3], sitters: [4,5], courtOffset: 0 },
  { t1: [0,5], t2: [1,4], sitters: [2,3], courtOffset: 0 },
  { t1: [2,5], t2: [3,4], sitters: [0,1], courtOffset: 0 },
];

// Pool of 7 — 7 games, each plays 4 and sits 3. Single court.
// 15 of 21 partnerships covered.
const POOL7: ScheduleEntry[] = [
  { t1: [0,1], t2: [2,3], sitters: [4,5,6], courtOffset: 0 },
  { t1: [0,4], t2: [1,5], sitters: [2,3,6], courtOffset: 0 },
  { t1: [0,2], t2: [4,6], sitters: [1,3,5], courtOffset: 0 },
  { t1: [0,3], t2: [5,6], sitters: [1,2,4], courtOffset: 0 },
  { t1: [1,6], t2: [2,5], sitters: [0,3,4], courtOffset: 0 },
  { t1: [1,4], t2: [3,6], sitters: [0,2,5], courtOffset: 0 },
  { t1: [2,4], t2: [3,5], sitters: [0,1,6], courtOffset: 0 },
];

// Pool of 8 — 8 games across 2 simultaneous courts, 0 sitters, each plays 4 games.
// Games are paired: G1+G2 happen simultaneously, G3+G4, G5+G6, G7+G8.
// 16 of 28 partnerships covered.
const POOL8: ScheduleEntry[] = [
  { t1: [0,1], t2: [2,3], sitters: [], courtOffset: 0 },
  { t1: [4,5], t2: [6,7], sitters: [], courtOffset: 1 },
  { t1: [0,2], t2: [4,6], sitters: [], courtOffset: 0 },
  { t1: [1,3], t2: [5,7], sitters: [], courtOffset: 1 },
  { t1: [0,4], t2: [1,6], sitters: [], courtOffset: 0 },
  { t1: [2,5], t2: [3,7], sitters: [], courtOffset: 1 },
  { t1: [0,6], t2: [3,5], sitters: [], courtOffset: 0 },
  { t1: [1,7], t2: [2,4], sitters: [], courtOffset: 1 },
];

export const SCHEDULES: Record<number, ScheduleEntry[]> = {
  4: POOL4, 5: POOL5, 6: POOL6, 7: POOL7, 8: POOL8,
};

export type PoolInfo = { games: number; sitsPerPlayer: number; courts: number; warning?: string };

export const POOL_INFO: Record<number, PoolInfo> = {
  4: { games: 3, sitsPerPlayer: 0, courts: 1 },
  5: { games: 5, sitsPerPlayer: 1, courts: 1 },
  6: { games: 6, sitsPerPlayer: 2, courts: 1 },
  7: { games: 7, sitsPerPlayer: 3, courts: 1, warning: 'high sitting time (3 sits)' },
  8: { games: 8, sitsPerPlayer: 0, courts: 2 },
};

export const VALID_SIZES = [4, 5, 6, 7, 8] as const;
export type ValidSize = typeof VALID_SIZES[number];

export function poolInfoLabel(size: number): string {
  const info = POOL_INFO[size];
  if (!info) return `${size} players`;
  const parts = [`${info.games} games`];
  if (info.sitsPerPlayer === 0) parts.push('no sits');
  else parts.push(`${info.sitsPerPlayer} sit${info.sitsPerPlayer !== 1 ? 's' : ''}/player`);
  if (info.courts > 1) parts.push(`${info.courts} courts`);
  return parts.join(' · ');
}

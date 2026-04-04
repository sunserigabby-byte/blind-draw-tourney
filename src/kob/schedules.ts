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

/**
 * Reorder a single-court schedule so no player plays more than `maxConsec`
 * games in a row. Uses brute-force search for small schedules (≤8 games).
 */
export function reorderForRest(
  schedule: ScheduleEntry[],
  maxConsec: number = 2,
): ScheduleEntry[] {
  const n = schedule.length;
  if (n <= 2) return schedule;

  // Get all players in each game
  const gamePlayers = schedule.map(e => new Set([...e.t1, ...e.t2]));

  // Track best ordering
  let bestOrder: number[] | null = null;
  let bestMaxRun = Infinity;

  function maxRun(order: number[]): number {
    // For each player, find their max consecutive-game streak
    const allPlayers = new Set<number>();
    for (const gp of gamePlayers) gp.forEach(p => allPlayers.add(p));

    let worst = 0;
    for (const player of allPlayers) {
      let run = 0, maxR = 0;
      for (const gi of order) {
        if (gamePlayers[gi].has(player)) { run++; maxR = Math.max(maxR, run); }
        else run = 0;
      }
      worst = Math.max(worst, maxR);
    }
    return worst;
  }

  // Greedy search with backtracking for small schedules
  function search(used: boolean[], order: number[]) {
    if (order.length === n) {
      const mr = maxRun(order);
      if (mr < bestMaxRun) { bestMaxRun = mr; bestOrder = [...order]; }
      return;
    }
    // Prune: if current best is already at maxConsec, stop
    if (bestMaxRun <= maxConsec) return;

    for (let i = 0; i < n; i++) {
      if (used[i]) continue;

      // Quick check: would this create a run > maxConsec?
      // Check the last maxConsec games in order
      let wouldViolate = false;
      if (order.length >= maxConsec) {
        const playersInNew = gamePlayers[i];
        for (const player of playersInNew) {
          let consecutive = 0;
          for (let j = order.length - 1; j >= Math.max(0, order.length - maxConsec); j--) {
            if (gamePlayers[order[j]].has(player)) consecutive++;
            else break;
          }
          if (consecutive >= maxConsec) { wouldViolate = true; break; }
        }
      }
      if (wouldViolate && bestMaxRun <= maxConsec) continue;

      used[i] = true;
      order.push(i);
      search(used, order);
      order.pop();
      used[i] = false;
    }
  }

  search(new Array(n).fill(false), []);
  if (!bestOrder) return schedule;
  return bestOrder.map(i => schedule[i]);
}

/**
 * Reorder a multi-court schedule (like pool-of-8 with paired games).
 * Groups games into rounds (by courtOffset pattern), then reorders rounds.
 */
export function reorderRoundsForRest(
  schedule: ScheduleEntry[],
  courtsPerRound: number,
  maxConsec: number = 2,
): ScheduleEntry[] {
  if (courtsPerRound <= 1) return reorderForRest(schedule, maxConsec);

  // Group into rounds
  const rounds: ScheduleEntry[][] = [];
  for (let i = 0; i < schedule.length; i += courtsPerRound) {
    rounds.push(schedule.slice(i, i + courtsPerRound));
  }

  // Get players per round
  const roundPlayers = rounds.map(r => {
    const s = new Set<number>();
    for (const e of r) { e.t1.forEach(p => s.add(p)); e.t2.forEach(p => s.add(p)); }
    return s;
  });

  // Greedy reorder of rounds
  const n = rounds.length;
  const used = new Array(n).fill(false);
  const order: number[] = [];

  for (let step = 0; step < n; step++) {
    let bestIdx = -1, bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      // Score: max consecutive for any player if we add this round
      let worstRun = 0;
      for (const player of roundPlayers[i]) {
        let run = 1;
        for (let j = order.length - 1; j >= 0; j--) {
          if (roundPlayers[order[j]].has(player)) run++;
          else break;
        }
        worstRun = Math.max(worstRun, run);
      }
      if (worstRun < bestScore) { bestScore = worstRun; bestIdx = i; }
    }
    if (bestIdx >= 0) { used[bestIdx] = true; order.push(bestIdx); }
  }

  return order.flatMap(i => rounds[i]);
}

export function poolInfoLabel(size: number): string {
  const info = POOL_INFO[size];
  if (!info) return `${size} players`;
  const parts = [`${info.games} games`];
  if (info.sitsPerPlayer === 0) parts.push('no sits');
  else parts.push(`${info.sitsPerPlayer} sit${info.sitsPerPlayer !== 1 ? 's' : ''}/player`);
  if (info.courts > 1) parts.push(`${info.courts} courts`);
  return parts.join(' · ');
}

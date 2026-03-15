import React, { useMemo, useState } from 'react';
import type { KobGameRow } from '../types';
import { uniq, shuffle } from '../utils';

// Supported pool sizes and their schedules.
// Format: [t1_indices, t2_indices, sitter_indices, courtOffset]
// courtOffset lets multiple games share a pool but run on adjacent courts simultaneously.
type ScheduleEntry = {
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
// 14 of 21 partnerships covered.
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
  { t1: [0,1], t2: [2,3], sitters: [], courtOffset: 0 }, // Round 1, Court A
  { t1: [4,5], t2: [6,7], sitters: [], courtOffset: 1 }, // Round 1, Court B
  { t1: [0,2], t2: [4,6], sitters: [], courtOffset: 0 }, // Round 2, Court A
  { t1: [1,3], t2: [5,7], sitters: [], courtOffset: 1 }, // Round 2, Court B
  { t1: [0,4], t2: [1,6], sitters: [], courtOffset: 0 }, // Round 3, Court A
  { t1: [2,5], t2: [3,7], sitters: [], courtOffset: 1 }, // Round 3, Court B
  { t1: [0,6], t2: [3,5], sitters: [], courtOffset: 0 }, // Round 4, Court A
  { t1: [1,7], t2: [2,4], sitters: [], courtOffset: 1 }, // Round 4, Court B
];

const SCHEDULES: Record<number, ScheduleEntry[]> = { 4: POOL4, 5: POOL5, 6: POOL6, 7: POOL7, 8: POOL8 };

type PoolInfo = { games: number; sitsPerPlayer: number; courts: number; warning?: string };
const POOL_INFO: Record<number, PoolInfo> = {
  4: { games: 3, sitsPerPlayer: 0, courts: 1 },
  5: { games: 5, sitsPerPlayer: 1, courts: 1 },
  6: { games: 6, sitsPerPlayer: 2, courts: 1 },
  7: { games: 7, sitsPerPlayer: 3, courts: 1, warning: 'high sitting time (3 sits)' },
  8: { games: 8, sitsPerPlayer: 0, courts: 2 },
};

function poolInfoLabel(size: number): string {
  const info = POOL_INFO[size];
  if (!info) return `${size} players`;
  const parts = [`${info.games} games`];
  if (info.sitsPerPlayer === 0) parts.push('no sits');
  else parts.push(`${info.sitsPerPlayer} sit${info.sitsPerPlayer !== 1 ? 's' : ''}/player`);
  if (info.courts > 1) parts.push(`${info.courts} courts`);
  return parts.join(' · ');
}

// ── Flexible pool distribution ──────────────────────────────────────────────
// Find counts of pools of sizes {4,5,6,7,8} that sum to exactly N,
// maximising the count of `preferred` size.

function findFlexibleSplit(n: number, preferred: number): Record<number, number> | null {
  const VALID = [4, 5, 6, 7, 8];
  let best: number[] | null = null; // [n4, n5, n6, n7, n8]
  let bestScore = -1;

  for (let e = Math.floor(n / 8); e >= 0; e--) {
    for (let d = Math.floor((n - 8*e) / 7); d >= 0; d--) {
      for (let c = Math.floor((n - 8*e - 7*d) / 6); c >= 0; c--) {
        for (let b = Math.floor((n - 8*e - 7*d - 6*c) / 5); b >= 0; b--) {
          const rem = n - 8*e - 7*d - 6*c - 5*b;
          if (rem >= 0 && rem % 4 === 0) {
            const a = rem / 4;
            const counts = [a, b, c, d, e];
            const score = counts[VALID.indexOf(preferred)] ?? 0;
            if (score > bestScore) { best = counts; bestScore = score; }
          }
        }
      }
    }
  }

  if (!best) return null;
  const result: Record<number, number> = {};
  VALID.forEach((v, i) => { if (best![i] > 0) result[v] = best![i]; });
  return result;
}

function formFlexiblePools(players: string[], preferred: number): { pools: string[][]; leftover: string[] } {
  const n = players.length;
  if (n < 4) return { pools: [], leftover: players };

  const split = findFlexibleSplit(n, preferred);

  if (!split) {
    const count = Math.floor(n / preferred);
    const pools = Array.from({ length: count }, (_, i) =>
      players.slice(i * preferred, (i + 1) * preferred),
    );
    return { pools, leftover: players.slice(count * preferred) };
  }

  // Build sizes array: put preferred pools first, then others sorted descending
  const sizes: number[] = [];
  const prefCount = split[preferred] ?? 0;
  for (let i = 0; i < prefCount; i++) sizes.push(preferred);
  for (const [sz, count] of Object.entries(split)) {
    if (Number(sz) !== preferred) {
      for (let i = 0; i < count; i++) sizes.push(Number(sz));
    }
  }
  // Sort non-preferred sizes descending (larger pools first)
  const prefPools = sizes.splice(0, prefCount);
  sizes.sort((a, b) => b - a);
  const finalSizes = [...prefPools, ...sizes];

  const pools: string[][] = [];
  let offset = 0;
  for (const size of finalSizes) {
    pools.push(players.slice(offset, offset + size));
    offset += size;
  }
  return { pools, leftover: [] };
}

// ── Game generation ──────────────────────────────────────────────────────────

function generateGames(
  pools: string[][],
  startCourt: number,
  existingCount: number,
  poolBase: number,
): KobGameRow[] {
  const games: KobGameRow[] = [];
  const ts = Date.now();
  let courtCursor = startCourt;

  for (let pi = 0; pi < pools.length; pi++) {
    const pool = pools[pi];
    const poolNum = poolBase + existingCount + pi + 1;
    const poolCourt = courtCursor;
    const schedule = SCHEDULES[pool.length];
    const courts = POOL_INFO[pool.length]?.courts ?? 1;
    courtCursor += courts;

    if (!schedule) continue;

    for (let gi = 0; gi < schedule.length; gi++) {
      const { t1: [i1,i2], t2: [i3,i4], sitters, courtOffset } = schedule[gi];
      const sitOut: string | string[] | undefined =
        sitters.length === 0 ? undefined :
        sitters.length === 1 ? pool[sitters[0]] :
        sitters.map(i => pool[i]);

      games.push({
        id: `kob-${poolNum}-g${gi+1}-${ts}-${Math.random().toString(36).slice(2,7)}`,
        pool: poolNum, game: gi + 1,
        t1: [pool[i1], pool[i2]],
        t2: [pool[i3], pool[i4]],
        court: poolCourt + courtOffset,
        scoreText: '',
        ...(sitOut !== undefined ? { sitOut } : {}),
      });
    }
  }

  return games;
}

// ── Main export ──────────────────────────────────────────────────────────────
export function KobPoolGenerator({
  label,
  playersText,
  gender,
  games,
  setGames,
  poolBase,
}: {
  label: string;
  playersText: string;
  gender: 'kob' | 'qob';
  games: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  poolBase: number;
}) {
  const [poolSizeStr, setPoolSizeStr] = useState('4');
  const [startCourt, setStartCourt] = useState(gender === 'kob' ? 1 : 5);
  const [seedStr, setSeedStr] = useState('');

  const poolSize = Math.max(4, parseInt(poolSizeStr) || 4);
  const supported = poolSize >= 4 && poolSize <= 8;

  const players = useMemo(
    () => uniq((playersText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [playersText],
  );

  const seededPlayers = useMemo(() => {
    const seed = seedStr ? Number(seedStr) : undefined;
    return seed !== undefined ? shuffle(players, seed) : players;
  }, [players, seedStr]);

  const genderPools = useMemo(
    () => uniq(games.filter(g => !g.isFinals && g.pool >= poolBase + 1 && g.pool <= poolBase + 499).map(g => g.pool)),
    [games, poolBase],
  );
  const existingPoolCount = genderPools.length;
  const existingGames = useMemo(
    () => games.filter(g => !g.isFinals && g.pool >= poolBase + 1 && g.pool <= poolBase + 499),
    [games, poolBase],
  );
  const hasExistingGames = existingGames.length > 0;

  const { pools: previewPools, leftover } = useMemo(
    () => (supported ? formFlexiblePools(seededPlayers, poolSize) : { pools: [], leftover: seededPlayers }),
    [seededPlayers, poolSize, supported],
  );

  const canGenerate = supported && previewPools.length > 0;

  // Summary
  const sizeCounts: Record<number, number> = {};
  for (const p of previewPools) sizeCounts[p.length] = (sizeCounts[p.length] ?? 0) + 1;
  const totalGames = previewPools.reduce((sum, p) => sum + (POOL_INFO[p.length]?.games ?? 0), 0);
  const sizeLabel = Object.entries(sizeCounts)
    .sort(([a],[b]) => Number(b) - Number(a))
    .map(([sz, ct]) => `${ct}×${sz}`)
    .join(' + ');
  const hasWarningSize = previewPools.some(p => !!POOL_INFO[p.length]?.warning);
  const needsMultiCourt = previewPools.some(p => (POOL_INFO[p.length]?.courts ?? 1) > 1);

  // Court count estimate for the preview
  const totalCourts = previewPools.reduce((sum, p) => sum + (POOL_INFO[p.length]?.courts ?? 1), 0);

  function onGenerate() {
    const newGames = generateGames(previewPools, startCourt, existingPoolCount, poolBase);
    setGames(prev => [...prev, ...newGames]);
  }

  function onReset() {
    if (!window.confirm(`Clear all ${label} pool games and scores? This gender's finals will also be cleared.`)) return;
    const goldPool = gender === 'kob' ? 1001 : 1002;
    const silverPool = gender === 'kob' ? 1011 : 1012;
    setGames(prev => prev.filter(g =>
      !(g.pool >= poolBase + 1 && g.pool <= poolBase + 499) &&
      g.pool !== goldPool &&
      g.pool !== silverPool,
    ));
  }

  const isKob = gender === 'kob';
  const ringClass    = isKob ? 'ring-blue-200'  : 'ring-pink-200';
  const accentClass  = isKob ? 'text-blue-800'  : 'text-pink-800';
  const genBtnClass  = isKob ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'bg-pink-600 hover:bg-pink-700 text-white';

  // Court label per pool
  const poolCourtLabel = (pi: number, poolLen: number, base: number) => {
    const courts = POOL_INFO[poolLen]?.courts ?? 1;
    let cursor = base;
    for (let i = 0; i < pi; i++) cursor += POOL_INFO[previewPools[i].length]?.courts ?? 1;
    return courts > 1 ? `Courts ${cursor}–${cursor + courts - 1}` : `Court ${cursor}`;
  };

  return (
    <section className={`bg-white/90 backdrop-blur rounded-xl shadow ring-1 ${ringClass} p-4`}>
      <h3 className={`text-[15px] font-semibold ${accentClass} mb-3`}>{label} — Pool Generator</h3>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="flex items-center gap-1.5 text-[12px]">
          <span className="text-slate-600 font-medium">Players per pool:</span>
          <input
            type="number"
            min={4}
            max={8}
            value={poolSizeStr}
            onChange={e => setPoolSizeStr(e.target.value)}
            className={`w-16 border rounded px-2 py-1 text-[13px] font-semibold text-center ${
              !supported ? 'border-red-400 bg-red-50' : 'border-slate-300'
            }`}
          />
        </label>

        <label className="flex items-center gap-1 text-[11px]">
          Start court
          <input
            type="number" min={1} value={startCourt}
            onChange={e => setStartCourt(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 border rounded px-2 py-1 text-[11px]"
          />
        </label>

        <label className="flex items-center gap-1 text-[11px]">
          Seed
          <input
            type="text" value={seedStr}
            onChange={e => setSeedStr(e.target.value)}
            placeholder="opt."
            className="w-16 border rounded px-2 py-0.5 text-[11px]"
          />
        </label>

        <button
          className={`px-3 py-1.5 rounded-lg shadow-sm active:scale-[.99] disabled:opacity-40 text-[11px] font-medium ${genBtnClass}`}
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          {hasExistingGames ? 'Add More' : 'Generate'}
        </button>

        {hasExistingGames && (
          <button className="px-2 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-[11px]" onClick={onReset}>
            Clear
          </button>
        )}
      </div>

      {/* Pool size info chip */}
      {supported && (
        <div className="text-[11px] text-slate-500 mb-2">
          {poolInfoLabel(poolSize)}
          {POOL_INFO[poolSize]?.courts > 1 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-medium">
              runs on {POOL_INFO[poolSize].courts} simultaneous courts
            </span>
          )}
        </div>
      )}

      {!supported && poolSizeStr !== '' && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 mb-2">
          Pool size must be between 4 and 8.
        </div>
      )}

      {/* Summary */}
      {previewPools.length > 0 && (
        <p className="text-[11px] text-slate-500 mb-2">
          {players.length} player{players.length !== 1 ? 's' : ''} →{' '}
          {previewPools.length} pool{previewPools.length !== 1 ? 's' : ''} ({sizeLabel}) ·{' '}
          {totalGames} games · {totalCourts} court{totalCourts !== 1 ? 's' : ''}
        </p>
      )}

      {leftover.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 mb-2">
          ⚠ {leftover.length} player{leftover.length !== 1 ? 's' : ''} ({leftover.join(', ')}) can't fit into complete pools of 4–8 and will be excluded.
        </div>
      )}

      {hasWarningSize && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 mb-2">
          ⚠ Schedule includes a pool of 7 — players in that pool sit 3 games out of 7. Consider adjusting the roster to avoid a pool of 7.
        </div>
      )}

      {needsMultiCourt && (
        <div className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-[11px] text-sky-700 mb-2">
          Pool of 8 uses 2 courts simultaneously — 4 rounds of 2 side-by-side games, no sitting.
        </div>
      )}

      {/* Preview grid */}
      {previewPools.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <div className={`text-[11px] font-semibold mb-2 ${accentClass}`}>
            Preview — {previewPools.length} pool{previewPools.length !== 1 ? 's' : ''}
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {previewPools.map((pool, pi) => {
              const info = POOL_INFO[pool.length];
              return (
                <div key={pi} className="border rounded-lg p-2 bg-slate-50 text-[11px]">
                  <div className={`font-semibold mb-0.5 ${accentClass}`}>
                    Pool {poolBase + existingPoolCount + pi + 1} · {pool.length}p
                  </div>
                  <div className="text-[10px] text-slate-400 mb-1">
                    {poolCourtLabel(pi, pool.length, startCourt)} · {info?.games ?? '?'} games
                    {info?.warning && <span className="ml-1 text-amber-600">⚠</span>}
                  </div>
                  {pool.map((player, i) => (
                    <div key={i} className="text-slate-700 truncate">{player}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasExistingGames && (
        <div className="mt-2 text-[11px] text-slate-400">
          {existingPoolCount} pool{existingPoolCount !== 1 ? 's' : ''} active · {existingGames.length} games
        </div>
      )}
    </section>
  );
}

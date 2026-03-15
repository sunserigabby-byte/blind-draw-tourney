import React, { useMemo, useState } from 'react';
import type { KobGameRow } from '../types';
import { uniq, shuffle } from '../utils';

type PoolSizeOption = 4 | 5 | 6;

// ── Pool schedules ─────────────────────────────────────────────────────────────

// Pool of 4 — 3 games, 0 sit-outs, every player partners with every other once.
const POOL4_SCHEDULE: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

// Pool of 5 — 5 games, each sits once, every player partners with every other once.
const POOL5_SCHEDULE: [[number, number], [number, number], number[]][] = [
  [[0, 1], [2, 3], [4]],
  [[0, 2], [1, 4], [3]],
  [[0, 3], [2, 4], [1]],
  [[0, 4], [1, 3], [2]],
  [[1, 2], [3, 4], [0]],
];

// Pool of 6 — 6 games, each plays 4 and sits 2.
// Sit-out pairs: (4,5) in G1&G4, (2,3) in G2&G5, (0,1) in G3&G6.
// Covers 12 of 15 partnerships (missing the 3 sit-out pairs: 0+1, 2+3, 4+5).
// Format: [t1_indices, t2_indices, sitter_indices]
const POOL6_SCHEDULE: [[number, number], [number, number], number[]][] = [
  [[0, 1], [2, 3], [4, 5]],
  [[0, 4], [1, 5], [2, 3]],
  [[2, 4], [3, 5], [0, 1]],
  [[0, 2], [1, 3], [4, 5]],
  [[0, 5], [1, 4], [2, 3]],
  [[2, 5], [3, 4], [0, 1]],
];

const POOL_INFO: Record<PoolSizeOption, { games: number; sitsPerPlayer: number; label: string }> = {
  4: { games: 3, sitsPerPlayer: 0, label: '3 games · no sits' },
  5: { games: 5, sitsPerPlayer: 1, label: '5 games · 1 sit' },
  6: { games: 6, sitsPerPlayer: 2, label: '6 games · 2 sits' },
};

// ── Flexible pool distribution ─────────────────────────────────────────────────
// Find the combination of pools (sizes 4, 5, 6) that uses all N players
// and maximizes the number of pools of `preferred` size.

function findFlexibleSplit(
  n: number,
  preferred: PoolSizeOption,
): { pools4: number; pools5: number; pools6: number } | null {
  let best: [number, number, number] | null = null;
  let bestScore = -1;

  for (let c = Math.floor(n / 6); c >= 0; c--) {
    for (let b = Math.floor((n - 6 * c) / 5); b >= 0; b--) {
      const rem = n - 6 * c - 5 * b;
      if (rem >= 0 && rem % 4 === 0) {
        const a = rem / 4;
        const score = preferred === 4 ? a : preferred === 5 ? b : c;
        if (score > bestScore) {
          best = [a, b, c];
          bestScore = score;
        }
      }
    }
  }

  if (!best) return null;
  return { pools4: best[0], pools5: best[1], pools6: best[2] };
}

function formFlexiblePools(
  players: string[],
  preferred: PoolSizeOption,
): { pools: string[][]; leftover: string[] } {
  const n = players.length;
  if (n < 4) return { pools: [], leftover: players };

  const split = findFlexibleSplit(n, preferred);

  if (!split) {
    // No valid split — form as many complete pools of preferred size as possible
    const count = Math.floor(n / preferred);
    const pools = Array.from({ length: count }, (_, i) =>
      players.slice(i * preferred, (i + 1) * preferred),
    );
    return { pools, leftover: players.slice(count * preferred) };
  }

  const { pools4, pools5, pools6 } = split;
  const sizes: PoolSizeOption[] = [
    ...Array(pools4).fill(4),
    ...Array(pools5).fill(5),
    ...Array(pools6).fill(6),
  ];

  // Interleave sizes for even court distribution when mixing
  if (pools4 > 0 && (pools5 > 0 || pools6 > 0)) {
    sizes.sort((a, b) => b - a); // larger pools first so smaller ones come last
  }

  const pools: string[][] = [];
  let offset = 0;
  for (const size of sizes) {
    pools.push(players.slice(offset, offset + size));
    offset += size;
  }

  return { pools, leftover: [] };
}

// ── Game generation ────────────────────────────────────────────────────────────

function generateGames(
  pools: string[][],
  startCourt: number,
  existingCount: number,
  poolBase: number,
): KobGameRow[] {
  const games: KobGameRow[] = [];
  const ts = Date.now();

  for (let pi = 0; pi < pools.length; pi++) {
    const pool = pools[pi];
    const poolNum = poolBase + existingCount + pi + 1;
    const court = startCourt + pi;
    const size = pool.length as PoolSizeOption;

    if (size === 6) {
      for (let gi = 0; gi < POOL6_SCHEDULE.length; gi++) {
        const [[i1, i2], [i3, i4], sitters] = POOL6_SCHEDULE[gi];
        games.push({
          id: `kob-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
          pool: poolNum, game: gi + 1,
          t1: [pool[i1], pool[i2]],
          t2: [pool[i3], pool[i4]],
          court, scoreText: '',
          sitOut: sitters.map(i => pool[i]),
        });
      }
    } else if (size === 5) {
      for (let gi = 0; gi < POOL5_SCHEDULE.length; gi++) {
        const [[i1, i2], [i3, i4], [si]] = POOL5_SCHEDULE[gi];
        games.push({
          id: `kob-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
          pool: poolNum, game: gi + 1,
          t1: [pool[i1], pool[i2]],
          t2: [pool[i3], pool[i4]],
          court, scoreText: '',
          sitOut: pool[si],
        });
      }
    } else {
      for (let gi = 0; gi < POOL4_SCHEDULE.length; gi++) {
        const [[i1, i2], [i3, i4]] = POOL4_SCHEDULE[gi];
        games.push({
          id: `kob-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
          pool: poolNum, game: gi + 1,
          t1: [pool[i1], pool[i2]],
          t2: [pool[i3], pool[i4]],
          court, scoreText: '',
        });
      }
    }
  }

  return games;
}

// ── Main export ────────────────────────────────────────────────────────────────
// poolBase=0 for KOB (men), poolBase=500 for QOB (women).
// Pool numbers: KOB = 1–499, QOB = 501–999, Finals = 1001/1002/1011/1012.
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
  const [poolSize, setPoolSize] = useState<PoolSizeOption>(4);
  const [startCourt, setStartCourt] = useState(gender === 'kob' ? 1 : 5);
  const [seedStr, setSeedStr] = useState('');

  const players = useMemo(
    () => uniq((playersText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [playersText],
  );

  const seededPlayers = useMemo(() => {
    const seed = seedStr ? Number(seedStr) : undefined;
    return seed !== undefined ? shuffle(players, seed) : players;
  }, [players, seedStr]);

  // Only count pools in this gender's numeric range
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
    () => formFlexiblePools(seededPlayers, poolSize),
    [seededPlayers, poolSize],
  );

  const canGenerate = seededPlayers.length >= 4;

  // Pool size summary for preview
  const sizeCounts = previewPools.reduce<Record<number, number>>((acc, p) => {
    acc[p.length] = (acc[p.length] ?? 0) + 1;
    return acc;
  }, {});
  const totalGames = previewPools.reduce((sum, p) => sum + POOL_INFO[p.length as PoolSizeOption].games, 0);
  const sizeLabel = Object.entries(sizeCounts)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([size, count]) => `${count}×${size}`)
    .join(' + ');

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
  const ringClass = isKob ? 'ring-blue-200' : 'ring-pink-200';
  const accentClass = isKob ? 'text-blue-800' : 'text-pink-800';
  const btnActiveClass = isKob
    ? 'bg-blue-700 text-white border-blue-700'
    : 'bg-pink-700 text-white border-pink-700';
  const genBtnClass = isKob
    ? 'bg-blue-700 hover:bg-blue-800 text-white'
    : 'bg-pink-600 hover:bg-pink-700 text-white';

  return (
    <section className={`bg-white/90 backdrop-blur rounded-xl shadow ring-1 ${ringClass} p-4`}>
      <h3 className={`text-[15px] font-semibold ${accentClass} mb-3`}>{label} — Pool Generator</h3>

      {/* Pool size buttons */}
      <div className="mb-3">
        <div className="text-[11px] text-slate-600 font-medium mb-1.5">Pool size:</div>
        <div className="flex flex-wrap gap-2">
          {([4, 5, 6] as PoolSizeOption[]).map(s => (
            <button
              key={s}
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-medium text-left ${
                poolSize === s ? btnActiveClass : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              onClick={() => setPoolSize(s)}
            >
              <div>{s} players</div>
              <div className={`text-[10px] font-normal ${poolSize === s ? 'opacity-80' : 'text-slate-400'}`}>
                {POOL_INFO[s].label}
              </div>
            </button>
          ))}
        </div>
        {poolSize === 6 && (
          <p className="mt-1.5 text-[10px] text-slate-500">
            Pool of 6: everyone plays 4 games, sits 2 — minimum possible sitting for this pool size.
          </p>
        )}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] mb-3">
        <label className="flex items-center gap-1 text-[11px]">
          Start court
          <input
            type="number" min={1} value={startCourt}
            onChange={e => setStartCourt(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 border rounded px-2 py-0.5 text-[11px]"
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
          <button
            className="px-2 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm text-[11px]"
            onClick={onReset}
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary line */}
      <p className="text-[11px] text-slate-500 mb-2">
        {players.length} player{players.length !== 1 ? 's' : ''}
        {previewPools.length > 0 && ` → ${previewPools.length} pool${previewPools.length !== 1 ? 's' : ''} (${sizeLabel}) · ${totalGames} games total`}
        {!canGenerate && players.length > 0 && ' · Need at least 4 players.'}
      </p>

      {leftover.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 mb-2">
          ⚠ {leftover.length} player{leftover.length !== 1 ? 's' : ''} ({leftover.join(', ')}) can't fit into complete pools of 4, 5, or 6 and will be excluded. Adjust the roster count.
        </div>
      )}

      {/* Pool preview grid */}
      {previewPools.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <div className={`text-[11px] font-semibold mb-2 ${accentClass}`}>
            Preview — {previewPools.length} pool{previewPools.length !== 1 ? 's' : ''}
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {previewPools.map((pool, pi) => (
              <div key={pi} className="border rounded-lg p-2 bg-slate-50 text-[11px]">
                <div className={`font-semibold mb-1 ${accentClass}`}>
                  Pool {poolBase + existingPoolCount + pi + 1} · {pool.length}p · Court {startCourt + pi}
                </div>
                {pool.map((player, i) => (
                  <div key={i} className="text-slate-700 truncate">{player}</div>
                ))}
                <div className="text-[10px] text-slate-400 mt-1">
                  {POOL_INFO[pool.length as PoolSizeOption].label}
                </div>
              </div>
            ))}
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

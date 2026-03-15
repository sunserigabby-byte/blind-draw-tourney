import React, { useMemo, useState } from 'react';
import type { KobGameRow } from '../types';
import { uniq, shuffle } from '../utils';

type PoolSize = 4 | 5;

const POOL4_SCHEDULE: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

const POOL5_SCHEDULE: [[number, number], [number, number], number][] = [
  [[0, 1], [2, 3], 4],
  [[0, 2], [1, 4], 3],
  [[0, 3], [2, 4], 1],
  [[0, 4], [1, 3], 2],
  [[1, 2], [3, 4], 0],
];

// Find a pools-of-4 and b pools-of-5 such that 4a + 5b = n.
// preferredSize determines which we maximize.
function findBestSplit(n: number, preferredSize: PoolSize): { a: number; b: number } | null {
  if (preferredSize === 4) {
    // Maximize a (pools of 4): iterate b from 0 upward
    for (let b = 0; b <= Math.floor(n / 5); b++) {
      const rem = n - b * 5;
      if (rem >= 0 && rem % 4 === 0) return { a: rem / 4, b };
    }
  } else {
    // Maximize b (pools of 5): iterate b from max downward
    for (let b = Math.floor(n / 5); b >= 0; b--) {
      const rem = n - b * 5;
      if (rem >= 0 && rem % 4 === 0) return { a: rem / 4, b };
    }
  }
  return null;
}

function formFlexiblePools(players: string[], preferredSize: PoolSize): { pools: string[][]; leftover: string[] } {
  const n = players.length;
  if (n < 4) return { pools: [], leftover: players };

  const split = findBestSplit(n, preferredSize);

  if (!split) {
    // No valid 4+5 split — form as many complete pools of preferredSize as possible
    const completeCount = Math.floor(n / preferredSize);
    const pools = Array.from({ length: completeCount }, (_, i) =>
      players.slice(i * preferredSize, (i + 1) * preferredSize),
    );
    return { pools, leftover: players.slice(completeCount * preferredSize) };
  }

  const { a, b } = split;
  const pools: string[][] = [];
  let offset = 0;

  // Interleave pool sizes for even court distribution when both types exist
  if (a > 0 && b > 0) {
    const total = a + b;
    let countOf4 = 0, countOf5 = 0;
    for (let i = 0; i < total; i++) {
      const use5 = countOf5 < b && (countOf4 >= a || countOf5 / b < (i + 1) / total);
      const size = use5 ? 5 : 4;
      pools.push(players.slice(offset, offset + size));
      offset += size;
      if (size === 5) countOf5++; else countOf4++;
    }
  } else {
    for (let i = 0; i < a; i++) {
      pools.push(players.slice(offset, offset + 4));
      offset += 4;
    }
    for (let i = 0; i < b; i++) {
      pools.push(players.slice(offset, offset + 5));
      offset += 5;
    }
  }

  return { pools, leftover: [] };
}

function generateGames(pools: string[][], startCourt: number, existingCount: number, poolBase: number): KobGameRow[] {
  const games: KobGameRow[] = [];
  const ts = Date.now();

  for (let pi = 0; pi < pools.length; pi++) {
    const pool = pools[pi];
    const poolNum = poolBase + existingCount + pi + 1;
    const court = startCourt + pi;
    const size = pool.length as PoolSize;

    if (size === 5) {
      for (let gi = 0; gi < POOL5_SCHEDULE.length; gi++) {
        const [[i1, i2], [i3, i4], sitterIdx] = POOL5_SCHEDULE[gi];
        games.push({
          id: `kob-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
          pool: poolNum, game: gi + 1,
          t1: [pool[i1], pool[i2]],
          t2: [pool[i3], pool[i4]],
          court, scoreText: '', sitOut: pool[sitterIdx],
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
  const [poolSize, setPoolSize] = useState<PoolSize>(4);
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
  const totalGames = previewPools.reduce((sum, p) => sum + (p.length === 5 ? 5 : 3), 0);
  const poolsOf4 = previewPools.filter(p => p.length === 4).length;
  const poolsOf5 = previewPools.filter(p => p.length === 5).length;

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

  const poolSizeLabel = previewPools.length > 0
    ? `→ ${previewPools.length} pool${previewPools.length !== 1 ? 's' : ''}: ` +
      [poolsOf4 > 0 ? `${poolsOf4}×4` : '', poolsOf5 > 0 ? `${poolsOf5}×5` : ''].filter(Boolean).join(' + ') +
      ` (${totalGames} games)`
    : '';

  return (
    <section className={`bg-white/90 backdrop-blur rounded-xl shadow ring-1 ${ringClass} p-4`}>
      <h3 className={`text-[15px] font-semibold ${accentClass} mb-3`}>{label} — Pool Generator</h3>

      <div className="flex flex-wrap items-center gap-2 text-[12px] mb-3">
        {/* Pool size preference */}
        <div className="flex items-center gap-1">
          <span className="text-slate-600 font-medium text-[11px]">Preferred size:</span>
          {([4, 5] as PoolSize[]).map(s => (
            <button
              key={s}
              className={`px-2 py-0.5 rounded border text-[11px] font-medium ${poolSize === s ? btnActiveClass : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              onClick={() => setPoolSize(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 text-[11px]">
          Court
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

      <p className="text-[11px] text-slate-500 mb-2">
        {players.length} player{players.length !== 1 ? 's' : ''}
        {poolSizeLabel && ` ${poolSizeLabel}`}
        {!canGenerate && players.length > 0 && ' · Need at least 4 players.'}
      </p>

      {leftover.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 mb-2">
          ⚠ {leftover.length} player{leftover.length !== 1 ? 's' : ''} ({leftover.join(', ')}) can't fit into complete pools of 4 or 5 and will be excluded. Adjust the roster count.
        </div>
      )}

      {previewPools.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <div className="grid grid-cols-2 gap-2">
            {previewPools.map((pool, pi) => (
              <div key={pi} className="border rounded-lg p-2 bg-slate-50 text-[11px]">
                <div className={`font-semibold mb-1 ${accentClass}`}>
                  Pool {poolBase + existingPoolCount + pi + 1} · {pool.length}p · Court {startCourt + pi}
                </div>
                {pool.map((player, i) => (
                  <div key={i} className="text-slate-700 truncate">{player}</div>
                ))}
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

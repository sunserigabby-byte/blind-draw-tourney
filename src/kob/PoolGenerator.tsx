import React, { useMemo, useState } from 'react';
import type { KobGameRow } from '../types';
import { uniq, shuffle } from '../utils';

type KobMode = 'coed' | 'kob' | 'qob';

// Standard round-robin partner rotation for pool of 4 players [A,B,C,D]:
//   Game 1: A+B vs C+D
//   Game 2: A+C vs B+D
//   Game 3: A+D vs B+C
// Every player partners with every other exactly once (3 games total).
const POOL4_SCHEDULE: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function formPools(guys: string[], girls: string[], mode: KobMode): string[][] {
  let players: string[];

  if (mode === 'kob') {
    players = [...guys];
  } else if (mode === 'qob') {
    players = [...girls];
  } else {
    // Co-ed: interleave [G1,W1,G2,W2,...] so each pool of 4 gets 2M+2W when possible.
    // With pool = [G1,G2,W1,W2], schedule gives:
    //   Game 1: G1+G2 vs W1+W2 (same-gender warm-up)
    //   Game 2: G1+W1 vs G2+W2 (mixed)
    //   Game 3: G1+W2 vs G2+W1 (mixed)
    // 2 of 3 games are mixed doubles.
    const g = [...guys];
    const w = [...girls];
    players = [];
    // Pair-interleave: two guys then two girls so each chunk of 4 = [G,G,W,W]
    while (g.length >= 2 && w.length >= 2) {
      players.push(g.shift()!, g.shift()!, w.shift()!, w.shift()!);
    }
    // Remaining (unbalanced) go at the end
    players.push(...g, ...w);
  }

  const pools: string[][] = [];
  for (let i = 0; i < players.length; i += 4) {
    const chunk = players.slice(i, i + 4);
    if (chunk.length === 4) pools.push(chunk);
    // chunks of 2–3 are shown as overflow warnings; chunks of 1 are ignored
  }
  return pools;
}

function generateGames(pools: string[][], startCourt: number): KobGameRow[] {
  const games: KobGameRow[] = [];
  const ts = Date.now();

  for (let pi = 0; pi < pools.length; pi++) {
    const pool = pools[pi];
    const poolNum = pi + 1;
    const court = startCourt + pi;

    for (let gi = 0; gi < POOL4_SCHEDULE.length; gi++) {
      const [[i1, i2], [i3, i4]] = POOL4_SCHEDULE[gi];
      games.push({
        id: `kob-${poolNum}-${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
        pool: poolNum,
        game: gi + 1,
        t1: [pool[i1], pool[i2]],
        t2: [pool[i3], pool[i4]],
        court,
        scoreText: '',
      });
    }
  }

  return games;
}

export function KobPoolGenerator({
  guysText,
  girlsText,
  games,
  setGames,
}: {
  guysText: string;
  girlsText: string;
  games: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
}) {
  const [mode, setMode] = useState<KobMode>('coed');
  const [startCourt, setStartCourt] = useState(1);
  const [seedStr, setSeedStr] = useState('');

  const guys = useMemo(
    () => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [guysText],
  );
  const girls = useMemo(
    () => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [girlsText],
  );

  const seededGuys = useMemo(() => {
    const seed = seedStr ? Number(seedStr) : undefined;
    return seed !== undefined ? shuffle(guys, seed) : guys;
  }, [guys, seedStr]);

  const seededGirls = useMemo(() => {
    const seed = seedStr ? Number(seedStr) : undefined;
    return seed !== undefined ? shuffle(girls, seed ? seed + 17 : undefined) : girls;
  }, [girls, seedStr]);

  const previewPools = useMemo(
    () => formPools(seededGuys, seededGirls, mode),
    [seededGuys, seededGirls, mode],
  );

  const totalPlayers =
    mode === 'kob' ? guys.length : mode === 'qob' ? girls.length : guys.length + girls.length;
  const remainder = totalPlayers % 4;
  const canGenerate = totalPlayers >= 4;
  const hasExistingGames = games.length > 0;
  const existingPoolCount = useMemo(() => uniq(games.map(g => g.pool)).length, [games]);

  function onGenerate() {
    const pools = formPools(seededGuys, seededGirls, mode);
    // Offset pool numbers so new pools don't collide with existing ones
    const poolOffset = existingPoolCount;
    const newGames = generateGames(pools, startCourt).map(g => ({
      ...g,
      pool: g.pool + poolOffset,
    }));
    setGames(prev => [...prev, ...newGames]);
  }

  function onReset() {
    if (!window.confirm('Clear all KOB/QOB games and scores?')) return;
    setGames(() => []);
  }

  const modeLabel = (m: KobMode) =>
    m === 'coed' ? 'Co-ed (KOB + QOB)' : m === 'kob' ? 'KOB only (Men)' : 'QOB only (Women)';

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold text-sky-800">Pool Generator (KOB / QOB)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 font-medium">Mode:</span>
            {(['coed', 'kob', 'qob'] as KobMode[]).map(m => (
              <button
                key={m}
                className={
                  'px-2 py-1 rounded border text-[11px] font-medium ' +
                  (mode === m
                    ? 'bg-sky-700 text-white border-sky-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
                }
                onClick={() => setMode(m)}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={e => setStartCourt(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>

          <label className="flex items-center gap-1">
            Seed
            <input
              type="text"
              value={seedStr}
              onChange={e => setSeedStr(e.target.value)}
              placeholder="optional"
              className="w-24 border rounded px-2 py-1"
            />
          </label>

          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm active:scale-[.99] disabled:opacity-40"
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            {hasExistingGames ? 'Add More Pools' : 'Generate Pools'}
          </button>

          {hasExistingGames && (
            <button
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm text-[12px]"
              onClick={onReset}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-2">
        {mode === 'coed'
          ? 'Co-ed: pools of 4 (2M + 2W). Each player partners with every other player exactly once — 3 games per pool. Separate KOB (men) and QOB (women) standings.'
          : mode === 'kob'
          ? 'KOB: men only — pools of 4, 3 games, rotating partners. Crown the King of the Beach!'
          : 'QOB: women only — pools of 4, 3 games, rotating partners. Crown the Queen of the Beach!'}
        {' '}Rally scoring to 21, cap 23, win by 2.
      </p>

      {!canGenerate && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
          Need at least 4 players to generate pools.
        </div>
      )}

      {canGenerate && remainder > 0 && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
          ⚠ {remainder} player{remainder !== 1 ? 's' : ''} won't fit into a complete pool of 4 and
          will be excluded. Adjust the roster to a multiple of 4 for clean pools.
        </div>
      )}

      {previewPools.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="text-[12px] font-semibold text-slate-700 mb-2">
            Pool Preview — {previewPools.length} pool{previewPools.length !== 1 ? 's' : ''} ·{' '}
            {previewPools.length * 3} games
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {previewPools.map((pool, pi) => (
              <div key={pi} className="border rounded-lg p-2 bg-slate-50 text-[11px]">
                <div className="font-semibold text-slate-600 mb-1">
                  Pool {existingPoolCount + pi + 1} · Court {startCourt + pi}
                </div>
                {pool.map((player, i) => {
                  const isGuy = guys.includes(player);
                  const isGirl = girls.includes(player);
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <span
                        className={
                          isGuy
                            ? 'text-blue-400 text-[9px] font-bold'
                            : isGirl
                            ? 'text-pink-400 text-[9px] font-bold'
                            : 'text-slate-400 text-[9px]'
                        }
                      >
                        {isGuy ? 'M' : isGirl ? 'F' : '?'}
                      </span>
                      <span className="text-slate-700">{player}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasExistingGames && (
        <div className="mt-3 text-[11px] text-slate-500">
          {existingPoolCount} pool{existingPoolCount !== 1 ? 's' : ''} active · {games.length} games
          total
        </div>
      )}
    </section>
  );
}

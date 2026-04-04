import React, { useMemo, useState } from 'react';
import type { KobGameRow } from '../types';
import { uniq, shuffle } from '../utils';
import { SCHEDULES, POOL_INFO, VALID_SIZES, poolInfoLabel, reorderForRest, reorderRoundsForRest } from './schedules';
import type { ScheduleEntry } from './schedules';
import { generateRoundRobinSchedule, totalPartnerships } from './roundRobin';

// ── Flexible pool distribution ──────────────────────────────────────────────
// Find counts of pools of sizes {4,5,6,7,8} that sum to exactly N,
// maximising the count of `preferred` size.

function findFlexibleSplit(n: number, preferred: number): Record<number, number> | null {
  const VALID = [...VALID_SIZES];
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

// ── Snake-draft seeding for pools ───────────────────────────────────────────
// Distributes seeds evenly across pools so each pool has a mix of skill levels.
// e.g. 12 players into 3 pools of 4:
//   Pool 1: seeds 1, 6, 7, 12   Pool 2: seeds 2, 5, 8, 11   Pool 3: seeds 3, 4, 9, 10

function snakeDraftPools(players: string[], poolSizes: number[]): string[][] {
  const numPools = poolSizes.length;
  const pools: string[][] = Array.from({ length: numPools }, () => []);

  // Build snake order: 0,1,2,...,n-1, n-1,...,2,1,0, 0,1,2,... repeating
  const order: number[] = [];
  let forward = true;
  while (order.length < players.length) {
    const round = forward
      ? Array.from({ length: numPools }, (_, i) => i)
      : Array.from({ length: numPools }, (_, i) => numPools - 1 - i);
    for (const pi of round) {
      if (order.length < players.length && pools[pi].length < poolSizes[pi]) {
        order.push(pi);
        pools[pi].push(''); // placeholder to track size
      }
    }
    forward = !forward;
  }

  // Reset and fill with actual players
  const result: string[][] = Array.from({ length: numPools }, () => []);
  for (let i = 0; i < players.length; i++) {
    result[order[i]].push(players[i]);
  }
  return result;
}

// ── Game generation (pool mode) ─────────────────────────────────────────────

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
    const rawSchedule = SCHEDULES[pool.length];
    const courts = POOL_INFO[pool.length]?.courts ?? 1;
    courtCursor += courts;

    if (!rawSchedule) continue;
    // Reorder so no player plays more than 2 games in a row
    const schedule = courts > 1
      ? reorderRoundsForRest(rawSchedule, courts, 2)
      : reorderForRest(rawSchedule, 2);

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

// ── Round-robin game generation ─────────────────────────────────────────────

function generateRoundRobinGames(
  players: string[],
  targetRounds: number | 'all',
  startCourt: number,
  poolBase: number,
  existingCount: number,
  seeded: boolean = false,
  courtOverride?: number,
): KobGameRow[] {
  const { rounds } = generateRoundRobinSchedule(players.length, targetRounds, seeded, courtOverride);
  const games: KobGameRow[] = [];
  const ts = Date.now();
  const poolNum = poolBase + existingCount + 1;
  let gameNum = 0;

  for (const round of rounds) {
    for (const g of round.games) {
      gameNum++;
      const sitOut: string | string[] | undefined =
        round.sitters.length === 0 ? undefined :
        round.sitters.length === 1 ? players[round.sitters[0]] :
        round.sitters.map(i => players[i]);

      games.push({
        id: `kob-rr-${poolNum}-g${gameNum}-${ts}-${Math.random().toString(36).slice(2,7)}`,
        pool: poolNum,
        game: gameNum,
        t1: [players[g.t1[0]], players[g.t1[1]]],
        t2: [players[g.t2[0]], players[g.t2[1]]],
        court: startCourt + g.courtOffset,
        scoreText: '',
        // Only attach sitters to the first game of each round (avoid repeating)
        ...(g.courtOffset === 0 && sitOut !== undefined ? { sitOut } : {}),
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
  const [mode, setMode] = useState<'pools' | 'roundrobin'>('pools');
  const [poolSizeStr, setPoolSizeStr] = useState('4');
  const [startCourt, setStartCourt] = useState(gender === 'kob' ? 1 : 5);
  const [seedStr, setSeedStr] = useState('');
  const [rrMode, setRrMode] = useState<'all' | 'custom'>('all');
  const [rrRoundsStr, setRrRoundsStr] = useState('5');
  const [rrSeeded, setRrSeeded] = useState(false);
  const [rrCourtsStr, setRrCourtsStr] = useState('');
  const [poolSeeded, setPoolSeeded] = useState(false);

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

  // ── Pool mode preview ──
  const { pools: previewPools, leftover } = useMemo(() => {
    if (!supported || mode !== 'pools') return { pools: [], leftover: [] as string[] };
    const base = formFlexiblePools(seededPlayers, poolSize);
    if (!poolSeeded || base.pools.length <= 1) return base;
    // Snake-draft: redistribute players across the same pool sizes for even seeding
    const sizes = base.pools.map(p => p.length);
    const allPlayers = seededPlayers.slice(0, sizes.reduce((a, b) => a + b, 0));
    return { pools: snakeDraftPools(allPlayers, sizes), leftover: base.leftover };
  }, [seededPlayers, poolSize, supported, mode, poolSeeded]);

  const canGeneratePools = mode === 'pools' && supported && previewPools.length > 0;

  // Pool summary stats
  const sizeCounts: Record<number, number> = {};
  for (const p of previewPools) sizeCounts[p.length] = (sizeCounts[p.length] ?? 0) + 1;
  const totalGames = previewPools.reduce((sum, p) => sum + (POOL_INFO[p.length]?.games ?? 0), 0);
  const sizeLabel = Object.entries(sizeCounts)
    .sort(([a],[b]) => Number(b) - Number(a))
    .map(([sz, ct]) => `${ct}×${sz}`)
    .join(' + ');
  const hasWarningSize = previewPools.some(p => !!POOL_INFO[p.length]?.warning);
  const needsMultiCourt = previewPools.some(p => (POOL_INFO[p.length]?.courts ?? 1) > 1);
  const totalCourts = previewPools.reduce((sum, p) => sum + (POOL_INFO[p.length]?.courts ?? 1), 0);

  // ── Round-robin preview ──
  const rrGamesPerPlayer = Math.max(1, parseInt(rrRoundsStr) || 1);
  const maxAutoCourts = Math.floor(players.length / 4);
  const rrCourtsActual = rrCourtsStr ? Math.max(1, Math.min(maxAutoCourts, parseInt(rrCourtsStr) || maxAutoCourts)) : maxAutoCourts;
  const activePerRound = rrCourtsActual * 4;

  // Calculate rounds needed to give everyone their target games
  const rrCalculatedRounds = players.length >= 4 && rrMode === 'custom'
    ? Math.ceil((rrGamesPerPlayer * players.length) / activePerRound)
    : 0;
  const rrTarget = rrMode === 'all' ? ('all' as const) : rrCalculatedRounds;

  // Check if games divide evenly
  const rrTotalSlots = rrCalculatedRounds * activePerRound;
  const rrTotalNeeded = rrGamesPerPlayer * players.length;
  const rrExtraSlots = rrTotalSlots - rrTotalNeeded;
  // If extra slots > 0, some players play 1 extra game
  const rrMinGames = rrGamesPerPlayer;
  const rrMaxGames = rrExtraSlots > 0 ? rrGamesPerPlayer + 1 : rrGamesPerPlayer;
  const rrIsExact = rrExtraSlots === 0;

  const rrPreview = useMemo(() => {
    if (mode !== 'roundrobin' || players.length < 4) return null;
    return generateRoundRobinSchedule(players.length, rrTarget, rrSeeded, rrCourtsActual);
  }, [mode, players.length, rrTarget, rrSeeded, rrCourtsActual]);

  const rrTotalPossible = players.length >= 4 ? totalPartnerships(players.length) : 0;
  const rrSittersPerRound = players.length - activePerRound;
  const canGenerateRR = mode === 'roundrobin' && players.length >= 4 && rrPreview && rrPreview.rounds.length > 0;

  function onGenerate() {
    if (mode === 'pools') {
      const newGames = generateGames(previewPools, startCourt, existingPoolCount, poolBase);
      setGames(prev => [...prev, ...newGames]);
    } else {
      const newGames = generateRoundRobinGames(seededPlayers, rrTarget, startCourt, poolBase, existingPoolCount, rrSeeded, rrCourtsActual);
      setGames(prev => [...prev, ...newGames]);
    }
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

  const canGenerate = mode === 'pools' ? canGeneratePools : canGenerateRR;

  return (
    <section className={`bg-white/90 backdrop-blur rounded-xl shadow ring-1 ${ringClass} p-4`}>
      <h3 className={`text-[15px] font-semibold ${accentClass} mb-3`}>{label} — Pool Generator</h3>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-0.5 w-fit">
        <button
          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
            mode === 'pools' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setMode('pools')}
        >
          Pools
        </button>
        <button
          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
            mode === 'roundrobin' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setMode('roundrobin')}
        >
          Round Robin
        </button>
      </div>

      {/* ═══ POOLS MODE ═══ */}
      {mode === 'pools' && (
        <>
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

            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={poolSeeded}
                onChange={e => setPoolSeeded(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-slate-600 font-medium">Seeded</span>
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
              Shuffle seed
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

          {poolSeeded && previewPools.length > 1 && (
            <div className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-700 mb-2">
              Seeded: roster order = skill rank (line 1 = strongest). Seeds are snake-drafted across pools so each pool has a mix of skill levels.
            </div>
          )}

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
              {leftover.length} player{leftover.length !== 1 ? 's' : ''} ({leftover.join(', ')}) can't fit into complete pools of 4–8 and will be excluded.
            </div>
          )}

          {hasWarningSize && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 mb-2">
              Schedule includes a pool of 7 — players in that pool sit 3 games out of 7. Consider adjusting the roster to avoid a pool of 7.
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
        </>
      )}

      {/* ═══ ROUND ROBIN MODE ═══ */}
      {mode === 'roundrobin' && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {/* Round-robin sub-mode */}
            <div className="flex gap-1 bg-slate-50 border rounded-lg p-0.5">
              <button
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  rrMode === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setRrMode('all')}
              >
                Play with everyone
              </button>
              <button
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  rrMode === 'custom' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setRrMode('custom')}
              >
                Choose games
              </button>
            </div>

            {rrMode === 'custom' && (
              <label className="flex items-center gap-1.5 text-[12px]">
                <span className="text-slate-600 font-medium">Games per player:</span>
                <input
                  type="number"
                  min={1}
                  value={rrRoundsStr}
                  onChange={e => setRrRoundsStr(e.target.value)}
                  className="w-16 border rounded px-2 py-1 text-[13px] font-semibold text-center border-slate-300"
                />
              </label>
            )}

            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rrSeeded}
                onChange={e => setRrSeeded(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-slate-600 font-medium">Seeded</span>
            </label>

            <label className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-600 font-medium">Courts:</span>
              <input
                type="number"
                min={1}
                max={maxAutoCourts || 1}
                value={rrCourtsStr}
                onChange={e => setRrCourtsStr(e.target.value)}
                placeholder={String(maxAutoCourts)}
                className="w-14 border border-slate-300 rounded px-2 py-1 text-[11px] text-center"
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

          {players.length < 4 && players.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 mb-2">
              Need at least 4 players for round robin.
            </div>
          )}

          {rrSeeded && players.length >= 4 && (
            <div className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-700 mb-2">
              Seeded mode: roster order = skill rank (line 1 = strongest). Strong players are paired with weaker players for balanced games.
            </div>
          )}

          {/* Round-robin summary */}
          {rrPreview && rrPreview.rounds.length > 0 && (
            <div className="text-[11px] text-slate-500 mb-2">
              {players.length} players · {rrCourtsActual} court{rrCourtsActual !== 1 ? 's' : ''} ·{' '}
              {rrPreview.rounds.length} round{rrPreview.rounds.length !== 1 ? 's' : ''} ·{' '}
              {rrPreview.rounds.reduce((s, r) => s + r.games.length, 0)} total games
              {rrSittersPerRound > 0 && ` · ${rrSittersPerRound} sit out/round`}
              {rrMode === 'custom' && (
                rrIsExact
                  ? ` · ${rrGamesPerPlayer} games each`
                  : ` · ${rrMinGames}–${rrMaxGames} games each`
              )}
            </div>
          )}

          {/* Partnership coverage */}
          {rrPreview && rrPreview.rounds.length > 0 && (
            <div className={`px-3 py-2 rounded-lg border text-[11px] mb-2 ${
              rrPreview.coveredCount >= rrPreview.totalCount
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-sky-50 border-sky-200 text-sky-700'
            }`}>
              {rrPreview.coveredCount >= rrPreview.totalCount
                ? `All ${rrPreview.totalCount} partnerships covered — every player partners with every other player at least once.`
                : `${rrPreview.coveredCount} of ${rrPreview.totalCount} partnerships covered (${Math.round(100 * rrPreview.coveredCount / rrPreview.totalCount)}%). Not everyone will partner together — add more rounds to increase coverage.`
              }
            </div>
          )}

          {/* Round-by-round preview */}
          {rrPreview && rrPreview.rounds.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className={`text-[11px] font-semibold mb-2 ${accentClass}`}>
                Preview — {rrPreview.rounds.length} round{rrPreview.rounds.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {rrPreview.rounds.map((round, ri) => (
                  <div key={ri} className="border rounded-lg p-2 bg-slate-50 text-[11px]">
                    <div className={`font-semibold mb-1 ${accentClass}`}>Round {ri + 1}</div>
                    {round.games.map((g, gi) => (
                      <div key={gi} className="text-slate-700 mb-0.5">
                        <span className="text-slate-400 text-[10px] mr-1">Ct {startCourt + g.courtOffset}:</span>
                        <span className="font-medium">{seededPlayers[g.t1[0]]}</span>
                        {' & '}
                        <span className="font-medium">{seededPlayers[g.t1[1]]}</span>
                        <span className="text-slate-400 mx-1">vs</span>
                        <span className="font-medium">{seededPlayers[g.t2[0]]}</span>
                        {' & '}
                        <span className="font-medium">{seededPlayers[g.t2[1]]}</span>
                      </div>
                    ))}
                    {round.sitters.length > 0 && (
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        Sits: {round.sitters.map(i => seededPlayers[i]).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {hasExistingGames && (
        <div className="mt-2 text-[11px] text-slate-400">
          {existingPoolCount} pool{existingPoolCount !== 1 ? 's' : ''} active · {existingGames.length} games
        </div>
      )}
    </section>
  );
}

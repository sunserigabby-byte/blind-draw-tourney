import React, { useEffect, useMemo, useState } from 'react';
import type { KobGameRow, ScoreSettings } from '../types';
import { uniq, parseScore, isValidScore, isScoredGame } from '../utils';

// Pool number constants
const GOLD_KOB  = 1001;
const GOLD_QOB  = 1002;
const SILVER_KOB = 1011;
const SILVER_QOB = 1012;

const FINALS_POOLS = new Set([GOLD_KOB, GOLD_QOB, SILVER_KOB, SILVER_QOB]);

function isFinalPool(pool: number) { return FINALS_POOLS.has(pool); }

function finalsTitle(pool: number) {
  if (pool === GOLD_KOB)   return '🥇 Gold Finals — King of the Beach';
  if (pool === GOLD_QOB)   return '🥇 Gold Finals — Queen of the Beach';
  if (pool === SILVER_KOB) return '🥈 Silver Finals — Consolation KOB';
  if (pool === SILVER_QOB) return '🥈 Silver Finals — Consolation QOB';
  return `Finals Pool ${pool}`;
}

function finalsHeaderColor(pool: number) {
  if (pool === GOLD_KOB || pool === GOLD_QOB)     return 'text-amber-700';
  if (pool === SILVER_KOB || pool === SILVER_QOB)  return 'text-slate-600';
  return 'text-sky-700';
}

function finalsRingColor(pool: number, allDone: boolean) {
  if (!allDone) return '';
  if (pool === GOLD_KOB || pool === GOLD_QOB)     return 'ring-2 ring-amber-400';
  if (pool === SILVER_KOB || pool === SILVER_QOB)  return 'ring-2 ring-slate-400';
  return 'ring-2 ring-emerald-400';
}

// ── Helper: swap a player in a game with another player from the pool ────────
function swapPlayer(
  game: KobGameRow,
  position: 't1-0' | 't1-1' | 't2-0' | 't2-1',
  newPlayer: string,
  allPoolGames: KobGameRow[],
  update: (id: string, patch: Partial<KobGameRow>) => void,
) {
  const oldPlayer =
    position === 't1-0' ? game.t1[0] :
    position === 't1-1' ? game.t1[1] :
    position === 't2-0' ? game.t2[0] : game.t2[1];

  if (oldPlayer === newPlayer) return;

  // Find where newPlayer currently is in this game (could be other team or sitting)
  const inT1 = game.t1.indexOf(newPlayer);
  const inT2 = game.t2.indexOf(newPlayer);
  const sitters = game.sitOut == null ? [] : Array.isArray(game.sitOut) ? [...game.sitOut] : [game.sitOut];
  const inSit = sitters.indexOf(newPlayer);

  const newT1: [string, string] = [...game.t1];
  const newT2: [string, string] = [...game.t2];
  let newSitters = [...sitters];

  // Place newPlayer in the target position
  if (position === 't1-0') newT1[0] = newPlayer;
  else if (position === 't1-1') newT1[1] = newPlayer;
  else if (position === 't2-0') newT2[0] = newPlayer;
  else newT2[1] = newPlayer;

  // Put oldPlayer where newPlayer was (swap)
  if (inT1 >= 0) { if (newT1[inT1] === newPlayer) newT1[inT1] = oldPlayer; }
  else if (inT2 >= 0) { if (newT2[inT2] === newPlayer) newT2[inT2] = oldPlayer; }
  else if (inSit >= 0) { newSitters[inSit] = oldPlayer; }
  else {
    // newPlayer was sitting but stored differently, or from another game — put oldPlayer in sitters
    newSitters = newSitters.map(s => s === newPlayer ? oldPlayer : s);
    if (!newSitters.includes(oldPlayer)) {
      // Not found in sitters — just add oldPlayer to sitters and remove newPlayer
      newSitters.push(oldPlayer);
      newSitters = newSitters.filter(s => s !== newPlayer);
    }
  }

  const sitOut = newSitters.length === 0 ? undefined :
    newSitters.length === 1 ? newSitters[0] : newSitters;

  update(game.id, { t1: newT1, t2: newT2, ...(sitOut !== undefined ? { sitOut } : { sitOut: undefined }) });
}

// ── Shared game table ──────────────────────────────────────────────────────────
function GamesTable({
  poolGames,
  guySlug,
  isAdmin,
  update,
  isFinals,
  scoreSettings,
}: {
  poolGames: KobGameRow[];
  guySlug: (n: string) => boolean;
  isAdmin?: boolean;
  update: (id: string, patch: Partial<KobGameRow>) => void;
  isFinals?: boolean;
  scoreSettings: ScoreSettings;
}) {
  const hasSitOuts = poolGames.some(g => g.sitOut != null && (Array.isArray(g.sitOut) ? g.sitOut.length > 0 : true));
  const hasMixedCourts = new Set(poolGames.map(g => g.court).filter(Boolean)).size > 1;

  // All unique players in this pool (for dropdown options)
  const allPlayers = useMemo(() => {
    const s = new Set<string>();
    for (const g of poolGames) {
      g.t1.forEach(p => s.add(p));
      g.t2.forEach(p => s.add(p));
      if (g.sitOut) (Array.isArray(g.sitOut) ? g.sitOut : [g.sitOut]).forEach(p => s.add(p));
    }
    return Array.from(s).sort();
  }, [poolGames]);

  const renderPlayer = (p: string, bold?: boolean) => (
    <span className="flex items-center gap-0.5 mr-2">
      <span className={guySlug(p) ? 'text-blue-400 text-[9px] font-bold' : 'text-pink-400 text-[9px] font-bold'}>
        {guySlug(p) ? 'M' : 'F'}
      </span>
      <span className={bold ? 'font-semibold' : ''}>{p}</span>
    </span>
  );

  const renderPlayerSlot = (g: KobGameRow, player: string, position: 't1-0' | 't1-1' | 't2-0' | 't2-1', bold?: boolean) => {
    if (!isAdmin) return renderPlayer(player, bold);
    return (
      <select
        className={`text-[12px] border-0 bg-transparent cursor-pointer pr-4 py-0.5 ${bold ? 'font-semibold' : ''} ${guySlug(player) ? 'text-blue-700' : 'text-pink-700'}`}
        value={player}
        onChange={e => swapPlayer(g, position, e.target.value, poolGames, update)}
      >
        {allPlayers.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[13px]">
        <thead className="sticky top-0 bg-white/90 backdrop-blur">
          <tr className="text-left text-slate-600">
            <th className="py-1 px-2">Game</th>
            {hasMixedCourts && <th className="py-1 px-2">Court</th>}
            <th className="py-1 px-2">Team 1</th>
            <th className="py-1 px-2">Team 2</th>
            {hasSitOuts && <th className="py-1 px-2 text-slate-400">Sits</th>}
            <th className="py-1 px-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {poolGames.map((g, idx) => {
            const parsed = parseScore(g.scoreText);
            const scored = parsed && parsed[0] !== parsed[1];
            const matchesRules = parsed ? isValidScore(parsed[0], parsed[1], scoreSettings) : false;
            const valid  = !g.scoreText || matchesRules;
            const warning = scored && !matchesRules;
            const t1Win  = scored ? parsed![0] > parsed![1] : null;
            const winBg  = isFinals ? 'bg-amber-50' : 'bg-emerald-50';

            return (
              <tr key={g.id} className={(idx % 2 ? 'bg-slate-50/60 ' : '') + 'border-t'}>
                <td className="py-1 px-2 tabular-nums text-slate-500 font-medium">G{g.game}</td>
                {hasMixedCourts && (
                  <td className="py-1 px-2 tabular-nums text-slate-500">{g.court ?? '—'}</td>
                )}
                <td className={`py-1 px-2 ${t1Win === true ? winBg : ''}`}>
                  <div className="flex flex-wrap">
                    {renderPlayerSlot(g, g.t1[0], 't1-0', t1Win === true)}
                    {renderPlayerSlot(g, g.t1[1], 't1-1', t1Win === true)}
                  </div>
                </td>
                <td className={`py-1 px-2 ${t1Win === false ? winBg : ''}`}>
                  <div className="flex flex-wrap">
                    {renderPlayerSlot(g, g.t2[0], 't2-0', t1Win === false)}
                    {renderPlayerSlot(g, g.t2[1], 't2-1', t1Win === false)}
                  </div>
                </td>
                {hasSitOuts && (
                  <td className="py-1 px-2 text-slate-400 text-[11px] italic">
                    {g.sitOut == null ? '—' : Array.isArray(g.sitOut) ? g.sitOut.join(', ') : g.sitOut}
                  </td>
                )}
                <td className="py-1 px-2">
                  <input
                    className={'w-28 border rounded px-2 py-1 text-[12px] ' + (warning ? 'border-amber-400 bg-amber-50' : valid ? 'border-slate-300' : 'border-red-500 bg-red-50')}
                    value={g.scoreText || ''}
                    onChange={e => update(g.id, { scoreText: e.target.value })}
                    placeholder={`to ${scoreSettings.playTo}${scoreSettings.cap ? ', cap ' + scoreSettings.cap : ''}`}
                    title={warning ? `Score doesn't match current rules (play to ${scoreSettings.playTo}${scoreSettings.cap ? ', cap ' + scoreSettings.cap : ', no cap'})` : ''}
                    disabled={!isAdmin}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pool card ──────────────────────────────────────────────────────────────────
function PoolCard({
  pool,
  allGames,
  poolStats,
  livePool,
  guySlug,
  isAdmin,
  update,
  confirmPool,
  setConfirmPool,
  doDelete,
  open,
  toggleOpen,
  scoreSettings,
}: {
  pool: number;
  allGames: KobGameRow[];
  poolStats: Map<number, { total: number; scored: number }>;
  livePool: number | null;
  guySlug: (n: string) => boolean;
  isAdmin?: boolean;
  update: (id: string, patch: Partial<KobGameRow>) => void;
  confirmPool: number | null;
  setConfirmPool: (p: number | null) => void;
  doDelete: (p: number) => void;
  open: Set<number>;
  toggleOpen: (p: number) => void;
  scoreSettings: ScoreSettings;
  roster: string[];
  addGame: (game: KobGameRow) => void;
}) {
  const { total, scored } = poolStats.get(pool) ?? { total: 0, scored: 0 };
  const allDone  = total > 0 && scored === total;
  const isLive   = pool === livePool;
  const isFinals = isFinalPool(pool);
  const poolGames = allGames.filter(g => g.pool === pool).sort((a, b) => a.game - b.game);
  const court     = poolGames[0]?.court;
  const isExpanded = open.has(pool);
  const poolPlayers = Array.from(new Set(poolGames.flatMap(g => [...g.t1, ...g.t2])));

  const ringClass = isFinals
    ? finalsRingColor(pool, allDone)
    : isLive ? 'ring-2 ring-sky-400' : allDone ? 'ring-2 ring-emerald-400' : '';

  const headerBg = isFinals ? 'bg-amber-50/60' : 'bg-slate-50/80';

  const pillClass = allDone
    ? isFinals ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
    : scored > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm bg-white ${ringClass}`}>
      {/* Header */}
      <div className={`px-3 py-2 ${headerBg} border-b flex justify-between items-center`}>
        <button
          className="text-left font-medium text-[14px] text-slate-800 flex items-center gap-2"
          onClick={() => toggleOpen(pool)}
        >
          {isFinals ? (
            <span className={finalsHeaderColor(pool)}>{finalsTitle(pool)}</span>
          ) : (
            `Pool ${pool}`
          )}
          {court !== undefined && (
            <span className="text-[11px] text-slate-500 font-normal">· Court {court}</span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums ${pillClass}`}>
            {scored}/{total}{allDone ? ' ✓' : ''}
          </span>
          {isLive && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500 text-white font-semibold animate-pulse">
              LIVE
            </span>
          )}
          <span className="text-[11px] text-slate-400 font-normal">{isExpanded ? '▲' : '▼'}</span>
        </button>

        {isAdmin && !isFinals && (
          <button
            className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={() => setConfirmPool(pool)}
          >
            Delete Pool
          </button>
        )}
      </div>

      {/* Confirm delete */}
      {confirmPool === pool && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
          <span className="text-red-700">Delete all games in Pool {pool}?</span>
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded bg-red-600 text-white text-[11px]" onClick={() => doDelete(pool)}>Confirm</button>
            <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmPool(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Expanded body */}
      {isExpanded && (
        <div>
          {/* Roster strip */}
          <div className="px-3 py-1.5 bg-slate-50/40 border-b flex flex-wrap gap-x-4 gap-y-0.5">
            {poolPlayers.map(player => (
              <span key={player} className="text-[11px] text-slate-600 flex items-center gap-1">
                <span className={guySlug(player) ? 'text-blue-400 font-bold' : 'text-pink-400 font-bold'}>
                  {guySlug(player) ? 'M' : 'F'}
                </span>
                {player}
              </span>
            ))}
          </div>
          <GamesTable
            poolGames={poolGames}
            guySlug={guySlug}
            isAdmin={isAdmin}
            update={update}
            isFinals={isFinals}
            scoreSettings={scoreSettings}
          />
          {isAdmin && (
            <AddGameForm
              poolNum={pool}
              roster={roster}
              existingGameCount={poolGames.length}
              onAdd={addGame}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Add manual game form ──────────────────────────────────────────────────────
function AddGameForm({
  poolNum,
  roster,
  existingGameCount,
  onAdd,
}: {
  poolNum: number;
  roster: string[];
  existingGameCount: number;
  onAdd: (game: KobGameRow) => void;
}) {
  const [t1p1, setT1p1] = useState(roster[0] || '');
  const [t1p2, setT1p2] = useState(roster[1] || '');
  const [t2p1, setT2p1] = useState(roster[2] || '');
  const [t2p2, setT2p2] = useState(roster[3] || '');
  const [courtStr, setCourtStr] = useState('1');
  const [scoreText, setScoreText] = useState('');

  const canAdd = t1p1 && t1p2 && t2p1 && t2p2 &&
    new Set([t1p1, t1p2, t2p1, t2p2]).size === 4;

  function handleAdd() {
    if (!canAdd) return;
    const ts = Date.now();
    onAdd({
      id: `kob-manual-${poolNum}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      pool: poolNum,
      game: existingGameCount + 1,
      t1: [t1p1, t1p2],
      t2: [t2p1, t2p2],
      court: parseInt(courtStr) || 1,
      scoreText,
    });
    setScoreText('');
  }

  const select = (value: string, onChange: (v: string) => void) => (
    <select
      className="border border-slate-300 rounded px-1.5 py-1 text-[12px] bg-white"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">—</option>
      {roster.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );

  return (
    <div className="px-3 py-2 bg-sky-50/50 border-t border-sky-200 flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-slate-600 font-medium">Add game:</span>
      {select(t1p1, setT1p1)}
      <span className="text-slate-400">&</span>
      {select(t1p2, setT1p2)}
      <span className="text-slate-500 font-medium">vs</span>
      {select(t2p1, setT2p1)}
      <span className="text-slate-400">&</span>
      {select(t2p2, setT2p2)}
      <label className="flex items-center gap-1 text-[11px]">
        Ct
        <input type="number" min={1} value={courtStr} onChange={e => setCourtStr(e.target.value)}
          className="w-10 border rounded px-1 py-0.5 text-[11px] text-center" />
      </label>
      <input
        className="w-20 border rounded px-2 py-1 text-[12px] border-slate-300"
        value={scoreText}
        onChange={e => setScoreText(e.target.value)}
        placeholder="Score"
      />
      <button
        className="px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 text-[11px] font-medium disabled:opacity-40"
        onClick={handleAdd}
        disabled={!canAdd}
      >
        Add
      </button>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export function KobMatchesView({
  games,
  setGames,
  isAdmin,
  guys,
  girls,
  scoreSettings = { playTo: 21, cap: 23 },
}: {
  games: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  isAdmin?: boolean;
  guys: string[];
  girls: string[];
  scoreSettings?: ScoreSettings;
}) {
  const allPools = useMemo(
    () => uniq(games.map(g => g.pool)).sort((a, b) => a - b),
    [games],
  );

  // KOB (men) = pools 1–499; QOB (women) = pools 501–999
  const kobRegularPools = useMemo(() => allPools.filter(p => p >= 1   && p <= 499), [allPools]);
  const qobRegularPools = useMemo(() => allPools.filter(p => p >= 501 && p <= 999), [allPools]);
  const regularPools    = useMemo(() => allPools.filter(p => !isFinalPool(p)), [allPools]);
  const goldPools       = useMemo(() => allPools.filter(p => p === GOLD_KOB || p === GOLD_QOB), [allPools]);
  const silverPools     = useMemo(() => allPools.filter(p => p === SILVER_KOB || p === SILVER_QOB), [allPools]);

  const [open, setOpen] = useState<Set<number>>(() => new Set(allPools));
  useEffect(() => {
    setOpen(prev => { const n = new Set(prev); allPools.forEach(p => n.add(p)); return n; });
  }, [allPools]);

  const [confirmPool, setConfirmPool] = useState<number | null>(null);

  const update  = (id: string, patch: Partial<KobGameRow>) =>
    setGames(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  const doDelete = (pool: number) => {
    setGames(prev => prev.filter(g => g.pool !== pool));
    setConfirmPool(null);
  };
  const toggleOpen = (pool: number) =>
    setOpen(prev => { const n = new Set(prev); if (n.has(pool)) n.delete(pool); else n.add(pool); return n; });

  const poolStats = useMemo(() => {
    const map = new Map<number, { total: number; scored: number }>();
    for (const p of allPools) {
      const pm = games.filter(g => g.pool === p);
      const scored = pm.filter(g => isScoredGame(g.scoreText)).length;
      map.set(p, { total: pm.length, scored });
    }
    return map;
  }, [games, allPools]);

  // Live = most recent regular pool (either gender) with unscored games
  const livePool = useMemo(
    () => [...regularPools].reverse().find(p => { const s = poolStats.get(p); return s && s.scored < s.total; }) ?? null,
    [regularPools, poolStats],
  );

  const guySlug = (name: string) =>
    guys.map(g => g.toLowerCase().trim()).includes(name.toLowerCase().trim());

  const allRoster = useMemo(() => [...guys, ...girls], [guys, girls]);

  const addGame = (game: KobGameRow) => setGames(prev => [...prev, game]);

  const commonProps = (pool: number) => ({
    pool, allGames: games, poolStats, livePool, guySlug, isAdmin,
    update, confirmPool, setConfirmPool, doDelete, open, toggleOpen, scoreSettings,
    roster: allRoster, addGame,
  });

  if (allPools.length === 0) {
    return (
      <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
        <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Pool Play — KOB / QOB</h2>
        <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">No pools generated yet. Use the Pool Generators above.</p>
      </section>
    );
  }

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">

      {/* ── Pool Play: KOB and QOB side by side ── */}
      {regularPools.length > 0 && (
        <>
          <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Pool Play</h2>
          <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />
          <div className="grid md:grid-cols-2 gap-6">
            {/* KOB — Men */}
            {kobRegularPools.length > 0 && (
              <div>
                <div className="text-[13px] font-semibold text-blue-700 mb-3">Men (KOB)</div>
                <div className="space-y-4">
                  {kobRegularPools.map(p => <PoolCard key={p} {...commonProps(p)} />)}
                </div>
              </div>
            )}
            {/* QOB — Women */}
            {qobRegularPools.length > 0 && (
              <div>
                <div className="text-[13px] font-semibold text-pink-700 mb-3">Women (QOB)</div>
                <div className="space-y-4">
                  {qobRegularPools.map(p => <PoolCard key={p} {...commonProps(p)} />)}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Gold Finals ── */}
      {goldPools.length > 0 && (
        <div className={regularPools.length > 0 ? 'mt-8 pt-6 border-t border-amber-200' : ''}>
          <h2 className="text-[20px] font-bold text-amber-700 mb-2 tracking-tight">Gold Finals — KOB / QOB</h2>
          <div className="w-24 h-1 bg-amber-400 mx-auto rounded-full mb-4" />
          <div className="space-y-4">
            {goldPools.map(p => <PoolCard key={p} {...commonProps(p)} />)}
          </div>
        </div>
      )}

      {/* ── Silver Finals ── */}
      {silverPools.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-300">
          <h2 className="text-[20px] font-bold text-slate-600 mb-2 tracking-tight">Silver Finals — Consolation</h2>
          <div className="w-24 h-1 bg-slate-400 mx-auto rounded-full mb-4" />
          <div className="space-y-4">
            {silverPools.map(p => <PoolCard key={p} {...commonProps(p)} />)}
          </div>
        </div>
      )}
    </section>
  );
}

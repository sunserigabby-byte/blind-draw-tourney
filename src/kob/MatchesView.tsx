import React, { useEffect, useMemo, useState } from 'react';
import type { KobGameRow } from '../types';
import { uniq, parseScore, isValidKobScore } from '../utils';

export function KobMatchesView({
  games,
  setGames,
  isAdmin,
  guys,
  girls,
}: {
  games: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  isAdmin?: boolean;
  guys: string[];
  girls: string[];
}) {
  const pools = useMemo(
    () => uniq(games.map(g => g.pool)).sort((a, b) => a - b),
    [games],
  );

  const [open, setOpen] = useState<Set<number>>(() => new Set(pools));
  useEffect(() => {
    setOpen(new Set(pools));
  }, [pools.length]);

  const [confirmPool, setConfirmPool] = useState<number | null>(null);

  const update = (id: string, patch: Partial<KobGameRow>) =>
    setGames(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)));

  const doDeletePool = (pool: number) => {
    setGames(prev => prev.filter(g => g.pool !== pool));
    setConfirmPool(null);
  };

  const poolStats = useMemo(() => {
    const map = new Map<number, { total: number; scored: number }>();
    for (const p of pools) {
      const pm = games.filter(g => g.pool === p);
      const scored = pm.filter(g => {
        const parsed = parseScore(g.scoreText);
        return parsed !== null && isValidKobScore(parsed[0], parsed[1]);
      }).length;
      map.set(p, { total: pm.length, scored });
    }
    return map;
  }, [games, pools]);

  const livePool = useMemo(
    () =>
      [...pools].reverse().find(p => {
        const s = poolStats.get(p);
        return s && s.scored < s.total;
      }) ?? null,
    [pools, poolStats],
  );

  const guySlug = (name: string) => guys.map(g => g.toLowerCase().trim()).includes(name.toLowerCase().trim());

  if (pools.length === 0) {
    return (
      <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
        <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">
          Pool Play — KOB / QOB
        </h2>
        <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No pools generated yet. Use the Pool Generator above.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">
        Pool Play — KOB / QOB
      </h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      <div className="mt-2 space-y-4">
        {pools.map(p => {
          const { total, scored } = poolStats.get(p) ?? { total: 0, scored: 0 };
          const allDone = total > 0 && scored === total;
          const isLive = p === livePool;
          const poolGames = games.filter(g => g.pool === p).sort((a, b) => a.game - b.game);
          const court = poolGames[0]?.court;
          const isExpanded = open.has(p);

          // Derive pool players in original order
          const poolPlayers = Array.from(
            new Set([...poolGames.flatMap(g => [...g.t1, ...g.t2])]),
          );

          return (
            <div
              key={p}
              className={`border rounded-xl overflow-hidden shadow-sm bg-white ${
                isLive ? 'ring-2 ring-sky-400' : allDone ? 'ring-2 ring-emerald-400' : ''
              }`}
            >
              <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
                <button
                  className="text-left font-medium text-[14px] text-slate-800 flex items-center gap-2"
                  onClick={() => {
                    const n = new Set(open);
                    if (n.has(p)) n.delete(p);
                    else n.add(p);
                    setOpen(n);
                  }}
                >
                  Pool {p}
                  {court !== undefined && (
                    <span className="text-[11px] text-slate-500 font-normal">· Court {court}</span>
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums ${
                      allDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : scored > 0
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {scored}/{total}
                    {allDone ? ' ✓' : ''}
                  </span>
                  {isLive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500 text-white font-semibold animate-pulse">
                      LIVE
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-normal">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isAdmin && (
                  <button
                    className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                    onClick={() => setConfirmPool(p)}
                  >
                    Delete Pool
                  </button>
                )}
              </div>

              {confirmPool === p && (
                <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
                  <span className="text-red-700">Delete all games in Pool {p}?</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-[11px]"
                      onClick={() => doDeletePool(p)}
                    >
                      Confirm
                    </button>
                    <button
                      className="px-2 py-1 rounded border text-[11px]"
                      onClick={() => setConfirmPool(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isExpanded && (
                <div>
                  {/* Pool roster */}
                  <div className="px-3 py-1.5 bg-slate-50/40 border-b flex flex-wrap gap-x-4 gap-y-0.5">
                    {poolPlayers.map(player => {
                      const isGuy = guySlug(player);
                      return (
                        <span key={player} className="text-[11px] text-slate-600 flex items-center gap-1">
                          <span className={isGuy ? 'text-blue-400 font-bold' : 'text-pink-400 font-bold'}>
                            {isGuy ? 'M' : 'F'}
                          </span>
                          {player}
                        </span>
                      );
                    })}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-[13px]">
                      <thead className="sticky top-0 bg-white/90 backdrop-blur">
                        <tr className="text-left text-slate-600">
                          <th className="py-1 px-2">Game</th>
                          <th className="py-1 px-2">Team 1</th>
                          <th className="py-1 px-2">Team 2</th>
                          <th className="py-1 px-2">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poolGames.map((g, idx) => {
                          const parsed = parseScore(g.scoreText);
                          const valid = parsed
                            ? isValidKobScore(parsed[0], parsed[1])
                            : !g.scoreText;
                          const t1Win = parsed && valid ? parsed[0] > parsed[1] : null;

                          const renderTeam = (team: [string, string], winning: boolean) =>
                            team.map((p, i) => (
                              <span key={i} className="flex items-center gap-0.5 mr-2">
                                <span
                                  className={
                                    guySlug(p)
                                      ? 'text-blue-400 text-[9px] font-bold'
                                      : 'text-pink-400 text-[9px] font-bold'
                                  }
                                >
                                  {guySlug(p) ? 'M' : 'F'}
                                </span>
                                <span className={winning ? 'font-semibold' : ''}>{p}</span>
                              </span>
                            ));

                          return (
                            <tr
                              key={g.id}
                              className={(idx % 2 ? 'bg-slate-50/60 ' : '') + 'border-t'}
                            >
                              <td className="py-1 px-2 tabular-nums text-slate-500 font-medium">
                                G{g.game}
                              </td>
                              <td
                                className={`py-1 px-2 ${
                                  t1Win === true ? 'bg-emerald-50' : ''
                                }`}
                              >
                                <div className="flex flex-wrap">
                                  {renderTeam(g.t1, t1Win === true)}
                                </div>
                              </td>
                              <td
                                className={`py-1 px-2 ${
                                  t1Win === false ? 'bg-emerald-50' : ''
                                }`}
                              >
                                <div className="flex flex-wrap">
                                  {renderTeam(g.t2, t1Win === false)}
                                </div>
                              </td>
                              <td className="py-1 px-2">
                                <input
                                  className={
                                    'w-28 border rounded px-2 py-1 text-[12px] ' +
                                    (valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                                  }
                                  value={g.scoreText || ''}
                                  onChange={e => update(g.id, { scoreText: e.target.value })}
                                  placeholder="21-15"
                                  disabled={!isAdmin}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

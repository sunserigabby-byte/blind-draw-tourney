import React, { useEffect, useMemo, useState } from 'react';
import type { QuadsMatchRow } from '../types';
import { uniq, parseScore, isValidQuadsScore } from '../utils';

export function QuadsMatchesView({
  matches,
  setMatches,
  isAdmin,
  scoreCap = 25,
}: {
  matches: QuadsMatchRow[];
  setMatches: (f: (prev: QuadsMatchRow[]) => QuadsMatchRow[] | QuadsMatchRow[]) => void;
  isAdmin?: boolean;
  scoreCap?: 21 | 25;
}) {
  const rounds = useMemo(() => uniq(matches.map(m => m.round)).sort((a, b) => a - b), [matches]);
  const [open, setOpen] = useState(() => new Set<number>(rounds.length ? [rounds[rounds.length - 1]] : []));
  const [confirmR, setConfirmR] = useState<number | null>(null);
  useEffect(() => { if (rounds.length) setOpen(new Set([rounds[rounds.length - 1]])); }, [matches.length]);

  const roundStats = useMemo(() => {
    const map = new Map<number, { total: number; scored: number }>();
    for (const r of rounds) {
      const rm = matches.filter(m => m.round === r);
      const scored = rm.filter(m => {
        const p = parseScore(m.scoreText);
        return p !== null && isValidQuadsScore(p[0], p[1], scoreCap);
      }).length;
      map.set(r, { total: rm.length, scored });
    }
    return map;
  }, [matches, rounds, scoreCap]);

  const liveRound = useMemo(() =>
    [...rounds].reverse().find(r => {
      const s = roundStats.get(r);
      return s && s.scored < s.total;
    }) ?? null
  , [rounds, roundStats]);

  const update = (id: string, patch: Partial<QuadsMatchRow>) =>
    setMatches(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const doDelete = (round: number) => { setMatches(prev => prev.filter(m => m.round !== round)); setConfirmR(null); };

  const teamLabel = (
    players: string[],
    isTriple?: boolean,
    tag?: string | null,
    girlCount?: number,
    isWinner?: boolean | null
  ) => {
    const teamSize = players.length;
    const showComposition = girlCount !== undefined && teamSize >= 3;
    return (
      <div className={`flex items-start gap-1.5 flex-wrap py-0.5 ${isWinner === true ? 'bg-emerald-50' : ''}`}>
        <div className="flex items-center gap-1 flex-wrap">
          {isTriple && (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200 shrink-0">
              Triples
            </span>
          )}
          {tag === 'ULTIMATE_REVCO' && (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 ring-1 ring-blue-200 shrink-0">
              UR
            </span>
          )}
          {tag === 'POWER_PUFF' && (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-800 ring-1 ring-pink-200 shrink-0">
              PP
            </span>
          )}
          {showComposition && !tag && (
            <span className="text-[10px] text-slate-400 shrink-0">
              {girlCount}G+{teamSize - girlCount!}B
            </span>
          )}
        </div>
        <span className="text-[13px]">{players.join(', ')}</span>
      </div>
    );
  };

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Quads)</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {rounds.length === 0 && (
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No quads matches yet. Use the Quads Round Generator to create pool play.
        </p>
      )}

      <div className="mt-2 space-y-6">
        {rounds.map(r => {
          const roundMatches = matches.filter(m => m.round === r);
          const sitOuts = roundMatches[0]?.sitOuts ?? [];

          const { total, scored } = roundStats.get(r) ?? { total: 0, scored: 0 };
          const allDone = total > 0 && scored === total;
          const isLive = r === liveRound;

          return (
            <div key={r} className={`border rounded-xl overflow-hidden shadow-sm bg-white ${isLive ? 'ring-2 ring-sky-400' : ''}`}>
              <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
                <button
                  className="text-left font-medium text-[14px] text-slate-800 flex items-center gap-2"
                  onClick={() => {
                    const n = new Set(open);
                    if (n.has(r)) n.delete(r); else n.add(r);
                    setOpen(n);
                  }}
                >
                  Round {r}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums ${
                    allDone ? 'bg-emerald-100 text-emerald-700' : scored > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {scored}/{total}{allDone ? ' ✓' : ''}
                  </span>
                  {isLive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500 text-white font-semibold animate-pulse">
                      LIVE
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-normal">{open.has(r) ? '▲' : '▼'}</span>
                </button>
                {isAdmin && (
                  <button
                    className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                    onClick={() => setConfirmR(r)}
                  >
                    Delete Round
                  </button>
                )}
              </div>

              {confirmR === r && (
                <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
                  <span className="text-red-700">Delete Round {r}? This removes all matches and scores.</span>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 rounded bg-red-600 text-white text-[11px]" onClick={() => doDelete(r)}>Confirm</button>
                    <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmR(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {sitOuts.length > 0 && (
                <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">
                  Sitting out: {sitOuts.join(', ')}
                </div>
              )}

              {open.has(r) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[13px]">
                    <thead className="sticky top-0 bg-white/90 backdrop-blur">
                      <tr className="text-left text-slate-600">
                        <th className="py-1 px-2">Court</th>
                        <th className="py-1 px-2">Team 1</th>
                        <th className="py-1 px-2">Team 2</th>
                        <th className="py-1 px-2">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundMatches.sort((a, b) => a.court - b.court).map((m, idx) => {
                        const parsed = parseScore(m.scoreText);
                        const valid = parsed
                          ? isValidQuadsScore(parsed[0], parsed[1], scoreCap)
                          : !m.scoreText;
                        const t1Win = parsed && valid ? parsed[0] > parsed[1] : null;

                        return (
                          <tr key={m.id} className={'border-t ' + (idx % 2 ? 'bg-slate-50/60 ' : '')}>
                            <td className="py-1 px-2 tabular-nums align-top">{m.court}</td>
                            <td className={`py-1 px-2 ${t1Win === true ? 'bg-emerald-50' : ''}`}>
                              {teamLabel(m.t1, m.isTriple1, m.tag1, m.t1GirlCount, t1Win === true ? true : null)}
                            </td>
                            <td className={`py-1 px-2 ${t1Win === false ? 'bg-emerald-50' : ''}`}>
                              {teamLabel(m.t2, m.isTriple2, m.tag2, m.t2GirlCount, t1Win === false ? true : null)}
                            </td>
                            <td className="py-1 px-2">
                              <input
                                className={
                                  'w-40 border rounded px-2 py-1 text-[12px] ' +
                                  (valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                                }
                                value={m.scoreText || ''}
                                onChange={e => update(m.id, { scoreText: e.target.value })}
                                placeholder={scoreCap === 21 ? 'to 21, cap 23' : 'to 21, cap 25'}
                                title={`Pool play (quads): win by 2, cap ${scoreCap === 21 ? '23' : '25'}`}
                                readOnly={!isAdmin}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

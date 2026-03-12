import React, { useEffect, useMemo, useState } from 'react';
import type { QuadsMatchRow } from '../types';
import { uniq, parseScore, isValidQuadsScore } from '../utils';

export function QuadsMatchesView({
  matches,
  setMatches,
}: {
  matches: QuadsMatchRow[];
  setMatches: (f: (prev: QuadsMatchRow[]) => QuadsMatchRow[] | QuadsMatchRow[]) => void;
}) {
  const rounds = useMemo(() => uniq(matches.map(m => m.round)).sort((a, b) => a - b), [matches]);
  const [open, setOpen] = useState(() => new Set<number>(rounds.length ? [rounds[rounds.length - 1]] : []));
  const [confirmR, setConfirmR] = useState<number | null>(null);
  useEffect(() => { if (rounds.length) setOpen(new Set([rounds[rounds.length - 1]])); }, [matches.length]);

  const update = (id: string, patch: Partial<QuadsMatchRow>) => setMatches(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const requestDelete = (round: number) => { setConfirmR(round); };
  const doDelete = (round: number) => { setMatches(prev => prev.filter(m => m.round !== round)); setConfirmR(null); };

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
        {rounds.map(r => (
          <div key={r} className="border rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
              <button
                className="text-left font-medium text-[14px] text-slate-800"
                onClick={() => { const n = new Set(open); if (n.has(r)) n.delete(r); else n.add(r); setOpen(n); }}
              >
                Round {r}
                <span className="ml-2 text-[11px] text-slate-500">
                  {open.has(r) ? 'Click to collapse' : 'Click to expand'}
                </span>
              </button>
              <button
                className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={() => requestDelete(r)}
                title="Delete this entire round"
              >
                Delete Round
              </button>
            </div>

            {confirmR === r && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
                <span className="text-red-700">
                  Delete Round {r}? This will remove all matches and scores in this round.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-[11px]"
                    onClick={() => doDelete(r)}
                  >
                    Confirm
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-[11px]"
                    onClick={() => setConfirmR(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open.has(r) && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead className="sticky top-0 bg-white/90 backdrop-blur">
                    <tr className="text-left text-slate-600">
                      <th className="py-1 px-2">Court</th>
                      <th className="py-1 px-2">Team 1 (Quads/Triples)</th>
                      <th className="py-1 px-2">Team 2 (Quads/Triples)</th>
                      <th className="py-1 px-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.filter(m => m.round === r).sort((a, b) => a.court - b.court).map((m, idx) => {
                      const parsed = parseScore(m.scoreText);
                      const valid = parsed ? isValidQuadsScore(parsed[0], parsed[1]) : (m.scoreText ? false : true);
                      const t1Win = parsed && valid ? parsed[0] > parsed[1] : null;

                      const labelTeam = (players: string[], isTriple?: boolean) => (
                        <div className="flex items-center gap-2">
                          {isTriple && (
                            <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                              Triples
                            </span>
                          )}
                          <span>{players.join(', ')}</span>
                        </div>
                      );

                      return (
                        <tr
                          key={m.id}
                          className={
                            "border-t " +
                            (idx % 2 ? 'bg-slate-50/60 ' : '')
                          }
                        >
                          <td className="py-1 px-2 tabular-nums">{m.court}</td>

                          <td className={`py-1 px-2 ${t1Win === true ? 'bg-emerald-50' : ''}`}>
                            {labelTeam(m.t1, m.isTriple1)}
                          </td>

                          <td className={`py-1 px-2 ${t1Win === false ? 'bg-emerald-50' : ''}`}>
                            {labelTeam(m.t2, m.isTriple2)}
                          </td>

                          <td className="py-1 px-2">
                            <input
                              className={
                                "w-40 border rounded px-2 py-1 text-[12px] " +
                                (valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                              }
                              value={m.scoreText || ''}
                              onChange={(e) => update(m.id, { scoreText: e.target.value })}
                              placeholder="to 21, cap 25 (e.g., 21-19)"
                              title="Pool play (quads): one game to 21, win by 2, cap 25"
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
        ))}
      </div>
    </section>
  );
}

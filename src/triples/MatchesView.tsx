import React, { useEffect, useMemo, useState } from 'react';
import type { TriplesMatchRow, ScoreSettings } from '../types';
import { uniq, parseScore, isValidScore, isScoredGame } from '../utils';

export function TriplesMatchesView({
  matches,
  setMatches,
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
}: {
  matches: TriplesMatchRow[];
  setMatches: (f: (prev: TriplesMatchRow[]) => TriplesMatchRow[] | TriplesMatchRow[]) => void;
  isAdmin?: boolean;
  scoreSettings?: ScoreSettings;
}) {
  const rounds = useMemo(() => uniq(matches.map(m => m.round)).sort((a, b) => a - b), [matches]);
  const [open, setOpen] = useState(() => new Set<number>(rounds.length ? [rounds[rounds.length - 1]] : []));
  const [confirmR, setConfirmR] = useState<number | null>(null);
  useEffect(() => { if (rounds.length) setOpen(new Set([rounds[rounds.length - 1]])); }, [matches.length]);
  const update = (id: string, patch: Partial<TriplesMatchRow>) => setMatches(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const doDelete = (round: number) => { setMatches(prev => prev.filter(m => m.round !== round)); setConfirmR(null); };

  const roundStats = useMemo(() => {
    const map = new Map<number, { total: number; scored: number }>();
    for (const r of rounds) {
      const rm = matches.filter(m => m.round === r);
      const scored = rm.filter(m => isScoredGame(m.scoreText)).length;
      map.set(r, { total: rm.length, scored });
    }
    return map;
  }, [matches, rounds]);

  const liveRound = useMemo(() =>
    [...rounds].reverse().find(r => {
      const s = roundStats.get(r);
      return s && s.scored < s.total;
    }) ?? null
  , [rounds, roundStats]);

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Triples)</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />
      {rounds.length === 0 && <p className="text-[13px] text-gray-600 max-w-lg mx-auto">No triples matches yet.</p>}
      <div className="mt-2 space-y-6">
        {rounds.map(r => {
          const { total, scored } = roundStats.get(r) ?? { total: 0, scored: 0 };
          const allDone = total > 0 && scored === total;
          const isLive = r === liveRound;

          return (
          <div key={r} className={`border rounded-xl overflow-hidden shadow-sm bg-white ${isLive ? 'ring-2 ring-sky-400' : ''}`}>
            <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
              <button className="text-left font-medium text-[14px] text-slate-800 flex items-center gap-2" onClick={() => { const n = new Set(open); if (n.has(r)) n.delete(r); else n.add(r); setOpen(n); }}>
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
                <button className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700" onClick={() => setConfirmR(r)}>Delete Round</button>
              )}
            </div>
            {confirmR === r && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
                <span className="text-red-700">Delete Round {r}?</span>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-[11px]" onClick={() => doDelete(r)}>Confirm</button>
                  <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmR(null)}>Cancel</button>
                </div>
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
                    {matches.filter(m => m.round === r).sort((a, b) => a.court - b.court).map((m, idx) => {
                      const parsed = parseScore(m.scoreText);
                      const scored = parsed && parsed[0] !== parsed[1];
                      const matchesRules = parsed ? isValidScore(parsed[0], parsed[1], scoreSettings) : false;
                      const valid = !m.scoreText || matchesRules;
                      const warning = scored && !matchesRules;
                      const t1Win = scored ? parsed![0] > parsed![1] : null;
                      return (
                        <tr key={m.id} className={(idx % 2 ? 'bg-slate-50/60 ' : '') + ' border-t'}>
                          <td className="py-1 px-2 tabular-nums">{m.court}</td>
                          <td className={`py-1 px-2 ${t1Win === true ? 'bg-emerald-50' : ''}`}>{m.t1.join(', ')}</td>
                          <td className={`py-1 px-2 ${t1Win === false ? 'bg-emerald-50' : ''}`}>{m.t2.join(', ')}</td>
                          <td className="py-1 px-2">
                            <input
                              className={'w-40 border rounded px-2 py-1 text-[12px] ' + (warning ? 'border-amber-400 bg-amber-50' : valid ? 'border-slate-300' : 'border-red-500 bg-red-50')}
                              value={m.scoreText || ''}
                              onChange={(e) => update(m.id, { scoreText: e.target.value })}
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
            )}
          </div>
          );
        })}
      </div>
    </section>
  );
}

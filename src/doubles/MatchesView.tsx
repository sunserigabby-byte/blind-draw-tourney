import React, { useEffect, useMemo, useState } from 'react';
import type { MatchRow, ScoreSettings } from '../types';
import { uniq, slug, parseScore, isValidScore, isScoredGame } from '../utils';

export function MatchesView({
  matches,
  setMatches,
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
  guysText = '',
  girlsText = '',
}: {
  matches: MatchRow[];
  setMatches: (f: (prev: MatchRow[]) => MatchRow[] | MatchRow[]) => void;
  isAdmin: boolean;
  scoreSettings?: ScoreSettings;
  guysText?: string;
  girlsText?: string;
}) {
  // A match's own tag ("a.tag || b.tag || null") can't tell you WHICH team
  // is actually same-gender — a mixed team simply matched against an
  // Ultimate Revco/Power Puff team also carries that tag. Determine each
  // team's real composition from the roster instead, so the badge lands on
  // the team that's actually all-guy/all-girl, not whichever is Team 1.
  const guysSet = useMemo(
    () => new Set(uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)).map(slug)),
    [guysText],
  );
  const girlsSet = useMemo(
    () => new Set(uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)).map(slug)),
    [girlsText],
  );
  const rounds = useMemo(() => uniq(matches.map(m => m.round)).sort((a, b) => a - b), [matches]);
  const [confirmR, setConfirmR] = useState<number | null>(null);

  // Per-round completion stats
  const roundStats = useMemo(() => {
    const map = new Map<number, { total: number; scored: number }>();
    for (const r of rounds) {
      const rm = matches.filter(m => m.round === r);
      const scored = rm.filter(m => isScoredGame(m.scoreText)).length;
      map.set(r, { total: rm.length, scored });
    }
    return map;
  }, [matches, rounds]);

  // The "live" round: EARLIEST round that still has pending scores — the one
  // you should be playing right now. When a full batch of rounds is
  // generated up front with nothing scored yet, this is Round 1 (not the
  // last-generated round), matching how pool play is actually played
  // through in order.
  const liveRound = useMemo(() => {
    return rounds.find(r => {
      const s = roundStats.get(r);
      return s && s.scored < s.total;
    }) ?? null;
  }, [rounds, roundStats]);

  const [open, setOpen] = useState(() => new Set<number>(rounds.length ? [liveRound ?? rounds[0]] : []));

  useEffect(() => {
    if (rounds.length) setOpen(new Set([liveRound ?? rounds[rounds.length - 1]]));
  }, [matches.length]);

  const update = (id: string, patch: Partial<MatchRow>) => setMatches(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const requestDelete = (round: number) => { setConfirmR(round); };
  const doDelete = (round: number) => { setMatches(prev => prev.filter(m => m.round !== round)); setConfirmR(null); };

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Doubles)</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {rounds.length === 0 && (
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No matches yet. Use the Round Generator to create blind-draw pool play.
        </p>
      )}

      <div className="mt-2 space-y-6">
        {rounds.map(r => {
          const roundSitOuts =
            matches.find((m) => m.round === r && (m.sitOuts?.length || 0) > 0)?.sitOuts || [];
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
                    allDone
                      ? 'bg-emerald-100 text-emerald-700'
                      : scored > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {scored}/{total}{allDone ? ' ✓' : ''}
                  </span>
                  {isLive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500 text-white font-semibold animate-pulse">
                      LIVE
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-normal">
                    {open.has(r) ? '▲' : '▼'}
                  </span>
                </button>
                <button
                  className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  onClick={() => requestDelete(r)}
                  disabled={!isAdmin}
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

              {roundSitOuts.length > 0 && (
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-800">
                  Sitting out this round: {roundSitOuts.join(", ")}
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

                        const t1IsUR = guysSet.has(slug(m.t1p1)) && guysSet.has(slug(m.t1p2));
                        const t1IsPP = girlsSet.has(slug(m.t1p1)) && girlsSet.has(slug(m.t1p2));
                        const t2IsUR = guysSet.has(slug(m.t2p1)) && guysSet.has(slug(m.t2p2));
                        const t2IsPP = girlsSet.has(slug(m.t2p1)) && girlsSet.has(slug(m.t2p2));

                        return (
                          <tr
                            key={m.id}
                            className={
                              "border-t " +
                              (idx % 2 ? 'bg-slate-50/60 ' : '') +
                              (m.tag === 'ULTIMATE_REVCO' ? 'bg-blue-50/60' :
                                m.tag === 'POWER_PUFF' ? 'bg-pink-50/60' : '')
                            }
                          >
                            <td className="py-1 px-2 tabular-nums">{m.court}</td>

                            <td className={`py-1 px-2 ${t1Win === true ? 'bg-emerald-50' : ''}`}>
                              <div className="flex items-center gap-2">
                                {t1IsUR && (
                                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200">
                                    Ultimate Revco
                                  </span>
                                )}
                                {t1IsPP && (
                                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 ring-1 ring-pink-200">
                                    Power Puff
                                  </span>
                                )}
                                <span>{m.t1p1} &amp; {m.t1p2}</span>
                              </div>
                            </td>

                            <td className={`py-1 px-2 ${t1Win === false ? 'bg-emerald-50' : ''}`}>
                              <div className="flex items-center gap-2">
                                {t2IsUR && (
                                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200">
                                    Ultimate Revco
                                  </span>
                                )}
                                {t2IsPP && (
                                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 ring-1 ring-pink-200">
                                    Power Puff
                                  </span>
                                )}
                                <span>{m.t2p1} &amp; {m.t2p2}</span>
                              </div>
                            </td>

                            <td className="py-1 px-2">
                              <input
                                className={
                                  "w-40 border rounded px-2 py-1 text-[12px] " +
                                  (warning ? 'border-amber-400 bg-amber-50' : valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                                }
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

import React, { useEffect, useMemo, useState } from 'react';
import type { MatchRow, ScoreSettings } from '../types';
import { uniq, slug, parseScore, isValidScore, isScoredGame } from '../utils';

export function MatchesView({
  matches,
  setMatches,
  isAdmin,
  canScore,
  scoreSettings = { playTo: 21, cap: null },
  guysText = '',
  girlsText = '',
  onScoreCommit,
}: {
  matches: MatchRow[];
  setMatches: (f: (prev: MatchRow[]) => MatchRow[] | MatchRow[]) => void;
  // The real admin only — gates destructive/structural actions (deleting a
  // round, editing who's on a team). Deliberately separate from `canScore`:
  // a public-scoring viewer or PIN-holding player should be able to enter
  // scores without also being able to delete a round or swap players.
  isAdmin: boolean;
  // Who can type into the score field — admin, PIN-holder, or public
  // scoring. Defaults to `isAdmin` so existing callers that don't pass it
  // keep working unchanged.
  canScore?: boolean;
  scoreSettings?: ScoreSettings;
  guysText?: string;
  girlsText?: string;
  // Called with the final scoreText whenever a score changes — used by
  // non-admin scorers to save just that match, since their edits otherwise
  // never leave their own browser (the main autosave only runs for admins).
  onScoreCommit?: (matchId: string, scoreText: string) => void;
}) {
  const canScoreResolved = canScore ?? isAdmin;
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
  const rosterNames = useMemo(
    () => uniq([
      ...(guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      ...(girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    ]),
    [guysText, girlsText],
  );
  const rounds = useMemo(() => uniq(matches.map(m => m.round)).sort((a, b) => a - b), [matches]);
  const [confirmR, setConfirmR] = useState<number | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<{ t1p1: string; t1p2: string; t2p1: string; t2p2: string } | null>(null);
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [addBuffer, setAddBuffer] = useState({ round: '', court: '', t1p1: '', t1p2: '', t2p1: '', t2p2: '', scoreText: '' });

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

  const update = (id: string, patch: Partial<MatchRow>) => {
    setMatches(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    if (patch.scoreText !== undefined) onScoreCommit?.(id, patch.scoreText);
  };
  const requestDelete = (round: number) => { setConfirmR(round); };
  const doDelete = (round: number) => { setMatches(prev => prev.filter(m => m.round !== round)); setConfirmR(null); };

  const startEditingTeams = (m: MatchRow) => {
    setEditingMatchId(m.id);
    setEditBuffer({ t1p1: m.t1p1, t1p2: m.t1p2, t2p1: m.t2p1, t2p2: m.t2p2 });
  };
  const cancelEditingTeams = () => { setEditingMatchId(null); setEditBuffer(null); };
  const saveEditingTeams = () => {
    if (!editingMatchId || !editBuffer) return;
    const names = [editBuffer.t1p1, editBuffer.t1p2, editBuffer.t2p1, editBuffer.t2p2];
    if (names.some(n => !n.trim())) { alert('All four players must be selected.'); return; }
    if (uniq(names).length !== 4) { alert('The same player is selected more than once in this match.'); return; }
    update(editingMatchId, { t1p1: editBuffer.t1p1, t1p2: editBuffer.t1p2, t2p1: editBuffer.t2p1, t2p2: editBuffer.t2p2 });
    setEditingMatchId(null);
    setEditBuffer(null);
  };
  // Warn (non-blocking) if any player in the edit buffer is already playing
  // elsewhere in the same round — most likely an accidental double-booking,
  // but the admin may still have a deliberate reason to override it.
  const editDupWarning = useMemo(() => {
    if (!editingMatchId || !editBuffer) return null;
    const round = matches.find(m => m.id === editingMatchId)?.round;
    if (round == null) return null;
    const elsewhere = new Set(
      matches
        .filter(m => m.round === round && m.id !== editingMatchId)
        .flatMap(m => [m.t1p1, m.t1p2, m.t2p1, m.t2p2]),
    );
    const dups = uniq([editBuffer.t1p1, editBuffer.t1p2, editBuffer.t2p1, editBuffer.t2p2].filter(n => elsewhere.has(n)));
    return dups.length ? `Already playing elsewhere this round: ${dups.join(', ')}` : null;
  }, [editingMatchId, editBuffer, matches]);

  // Lets an admin record a real match for a round that already happened —
  // e.g. crediting a player who arrived late with a make-up result — so it
  // shows up in the round's own match list (and flows into Leaderboard/
  // fairness tracking) instead of being an invisible bonus number.
  const openAddMatch = () => {
    const defaultRound = rounds[0] ?? 1;
    const courtsInRound = matches.filter(m => m.round === defaultRound).map(m => m.court);
    const defaultCourt = courtsInRound.length ? Math.max(...courtsInRound) + 1 : 1;
    setAddBuffer({ round: String(defaultRound), court: String(defaultCourt), t1p1: '', t1p2: '', t2p1: '', t2p2: '', scoreText: '' });
    setShowAddMatch(true);
  };
  const cancelAddMatch = () => setShowAddMatch(false);
  const saveAddMatch = () => {
    const round = parseInt(addBuffer.round);
    const court = parseInt(addBuffer.court);
    if (!round || round < 1) { alert('Enter a valid round number.'); return; }
    if (!court || court < 1) { alert('Enter a valid court number.'); return; }
    const names = [addBuffer.t1p1, addBuffer.t1p2, addBuffer.t2p1, addBuffer.t2p2];
    if (names.some(n => !n.trim())) { alert('All four players must be selected.'); return; }
    if (uniq(names).length !== 4) { alert('The same player is selected more than once in this match.'); return; }
    const id = `${round}-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMatches(prev => [...prev, {
      id, round, court,
      t1p1: addBuffer.t1p1, t1p2: addBuffer.t1p2, t2p1: addBuffer.t2p1, t2p2: addBuffer.t2p2,
      tag: null, scoreText: addBuffer.scoreText,
    }]);
    setOpen(prev => new Set(prev).add(round));
    setShowAddMatch(false);
  };
  const addDupWarning = useMemo(() => {
    const round = parseInt(addBuffer.round);
    if (!round) return null;
    const elsewhere = new Set(matches.filter(m => m.round === round).flatMap(m => [m.t1p1, m.t1p2, m.t2p1, m.t2p2]));
    const dups = uniq([addBuffer.t1p1, addBuffer.t1p2, addBuffer.t2p1, addBuffer.t2p2].filter(n => n && elsewhere.has(n)));
    return dups.length ? `Already playing elsewhere this round: ${dups.join(', ')}` : null;
  }, [addBuffer, matches]);

  // Shared per-match display values, used by both the desktop table and the
  // mobile card list so the two views can't drift out of sync with each other.
  const computeMatchDisplay = (m: MatchRow) => {
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
    return { parsed, scored, matchesRules, valid, warning, t1Win, t1IsUR, t1IsPP, t2IsUR, t2IsPP };
  };

  // Shared team-edit dropdown, used by both the desktop table and mobile
  // cards — doesn't depend on which match, only on the shared edit buffer.
  const playerSelect = (slot: 't1p1' | 't1p2' | 't2p1' | 't2p2') => (
    <select
      className="border border-slate-300 rounded px-1 py-1 text-[12px] bg-white"
      value={editBuffer?.[slot] ?? ''}
      onChange={(e) => setEditBuffer(prev => prev ? { ...prev, [slot]: e.target.value } : prev)}
    >
      <option value="">—</option>
      {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Doubles)</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {isAdmin && (
        <div className="mb-4">
          {!showAddMatch ? (
            <button
              className="px-3 py-1.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50 text-[12px] font-medium"
              onClick={openAddMatch}
            >
              + Add Match
            </button>
          ) : (
            <div className="border border-sky-200 rounded-xl p-3 bg-sky-50/60 space-y-2">
              <p className="text-[12px] font-semibold text-sky-800">
                Record a match for a round that already happened — e.g. a make-up result for a player who arrived late.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <label className="flex items-center gap-1">
                  Round
                  <input
                    type="number" min={1}
                    className="w-16 border rounded px-2 py-1"
                    value={addBuffer.round}
                    onChange={(e) => setAddBuffer(prev => ({ ...prev, round: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-1">
                  Court
                  <input
                    type="number" min={1}
                    className="w-16 border rounded px-2 py-1"
                    value={addBuffer.court}
                    onChange={(e) => setAddBuffer(prev => ({ ...prev, court: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-1">
                  Score
                  <input
                    type="text"
                    placeholder={`to ${scoreSettings.playTo}`}
                    className="w-24 border rounded px-2 py-1"
                    value={addBuffer.scoreText}
                    onChange={(e) => setAddBuffer(prev => ({ ...prev, scoreText: e.target.value }))}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Team 1:</span>
                  <select className="border rounded px-1 py-1" value={addBuffer.t1p1} onChange={(e) => setAddBuffer(prev => ({ ...prev, t1p1: e.target.value }))}>
                    <option value="">—</option>
                    {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select className="border rounded px-1 py-1" value={addBuffer.t1p2} onChange={(e) => setAddBuffer(prev => ({ ...prev, t1p2: e.target.value }))}>
                    <option value="">—</option>
                    {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Team 2:</span>
                  <select className="border rounded px-1 py-1" value={addBuffer.t2p1} onChange={(e) => setAddBuffer(prev => ({ ...prev, t2p1: e.target.value }))}>
                    <option value="">—</option>
                    {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select className="border rounded px-1 py-1" value={addBuffer.t2p2} onChange={(e) => setAddBuffer(prev => ({ ...prev, t2p2: e.target.value }))}>
                    <option value="">—</option>
                    {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              {addDupWarning && <p className="text-[11px] text-amber-700">{addDupWarning}</p>}
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-[12px] hover:bg-emerald-700" onClick={saveAddMatch}>
                  Add Match
                </button>
                <button className="px-3 py-1.5 rounded border text-[12px]" onClick={cancelAddMatch}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
          const roundMatches = matches.filter(m => m.round === r).sort((a, b) => a.court - b.court);

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
                <>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full text-[13px]">
                    <thead className="sticky top-0 bg-white/90 backdrop-blur">
                      <tr className="text-left text-slate-600">
                        <th className="py-1 px-2">Court</th>
                        <th className="py-1 px-2">Team 1</th>
                        <th className="py-1 px-2">Team 2</th>
                        <th className="py-1 px-2">Score</th>
                        {isAdmin && <th className="py-1 px-2">Teams</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {roundMatches.map((m, idx) => {
                        const { parsed, scored, valid, warning, t1Win, t1IsUR, t1IsPP, t2IsUR, t2IsPP } = computeMatchDisplay(m);
                        const isEditingRow = editingMatchId === m.id;

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
                              {isEditingRow ? (
                                <div className="flex items-center gap-1">
                                  {playerSelect('t1p1')}
                                  {playerSelect('t1p2')}
                                </div>
                              ) : (
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
                              )}
                            </td>

                            <td className={`py-1 px-2 ${t1Win === false ? 'bg-emerald-50' : ''}`}>
                              {isEditingRow ? (
                                <div className="flex items-center gap-1">
                                  {playerSelect('t2p1')}
                                  {playerSelect('t2p2')}
                                </div>
                              ) : (
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
                              )}
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
                                disabled={!canScoreResolved}
                              />
                            </td>

                            {isAdmin && (
                              <td className="py-1 px-2">
                                {isEditingRow ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1">
                                      <button
                                        className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] hover:bg-emerald-700"
                                        onClick={saveEditingTeams}
                                      >
                                        Save
                                      </button>
                                      <button
                                        className="px-2 py-1 rounded border text-[11px]"
                                        onClick={cancelEditingTeams}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                    {editDupWarning && (
                                      <span className="text-[10px] text-amber-700">{editDupWarning}</span>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    className="px-2 py-1 rounded border text-slate-700 hover:bg-slate-50 text-[11px]"
                                    onClick={() => startEditingTeams(m)}
                                  >
                                    Edit
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="sm:hidden divide-y divide-slate-100">
                  {roundMatches.map((m) => {
                    const { valid, warning, t1Win, t1IsUR, t1IsPP, t2IsUR, t2IsPP } = computeMatchDisplay(m);
                    const isEditingRow = editingMatchId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={
                          "p-3 space-y-2 " +
                          (m.tag === 'ULTIMATE_REVCO' ? 'bg-blue-50/40' : m.tag === 'POWER_PUFF' ? 'bg-pink-50/40' : '')
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500">Court {m.court}</span>
                          {isAdmin && !isEditingRow && (
                            <button
                              className="text-[11px] px-2 py-0.5 rounded border text-slate-700 hover:bg-slate-50"
                              onClick={() => startEditingTeams(m)}
                            >
                              Edit teams
                            </button>
                          )}
                        </div>

                        {isEditingRow ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1">
                              {playerSelect('t1p1')}
                              {playerSelect('t1p2')}
                            </div>
                            <div className="text-center text-[11px] text-slate-400">vs</div>
                            <div className="flex items-center gap-1">
                              {playerSelect('t2p1')}
                              {playerSelect('t2p2')}
                            </div>
                            {editDupWarning && <p className="text-[11px] text-amber-700">{editDupWarning}</p>}
                            <div className="flex items-center gap-2">
                              <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-[12px] hover:bg-emerald-700" onClick={saveEditingTeams}>
                                Save
                              </button>
                              <button className="px-3 py-1.5 rounded border text-[12px]" onClick={cancelEditingTeams}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className={`flex flex-wrap items-center gap-2 rounded px-2 py-1.5 ${t1Win === true ? 'bg-emerald-50' : ''}`}>
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
                              <span className="text-[14px] font-medium">{m.t1p1} &amp; {m.t1p2}</span>
                            </div>
                            <div className="text-center text-[11px] text-slate-400">vs</div>
                            <div className={`flex flex-wrap items-center gap-2 rounded px-2 py-1.5 ${t1Win === false ? 'bg-emerald-50' : ''}`}>
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
                              <span className="text-[14px] font-medium">{m.t2p1} &amp; {m.t2p2}</span>
                            </div>
                          </>
                        )}

                        <input
                          className={
                            "w-full border rounded px-3 py-2.5 text-[16px] text-center " +
                            (warning ? 'border-amber-400 bg-amber-50' : valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                          }
                          value={m.scoreText || ''}
                          onChange={(e) => update(m.id, { scoreText: e.target.value })}
                          placeholder={`to ${scoreSettings.playTo}${scoreSettings.cap ? ', cap ' + scoreSettings.cap : ''}`}
                          title={warning ? `Score doesn't match current rules (play to ${scoreSettings.playTo}${scoreSettings.cap ? ', cap ' + scoreSettings.cap : ', no cap'})` : ''}
                          disabled={!canScoreResolved}
                          inputMode="numeric"
                        />
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

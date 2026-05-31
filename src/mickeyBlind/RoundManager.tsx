import React, { useMemo, useState } from 'react';
import type { MickeyTeam, MickeyMatchRow } from '../types';
import {
  parseMickeyPairsGendered, parseMickeyFreeGendered, mickeyMemberList,
  shuffle, slug, uniq,
} from '../utils';
import { drawTeams, toUnit, type Unit } from '../mickey/TeamBuilder';

const rid = () => Math.random().toString(36).slice(2, 10);
const SMART_CANDIDATES = 30;

export type MickeyBDRound = {
  id: string;
  number: number;
  teams: MickeyTeam[];
  matches: MickeyMatchRow[];
};

// ── History tracking across previous rounds ──────────────────────────────────
// Used to penalize repeat teammates, repeat opponents, and repeat courts.

type RoundHistory = {
  teammateCount: Map<string, number>;
  opponentCount: Map<string, number>;
  // For each player slug, the set of court indices (0-based) they've been on.
  courtUsage: Map<string, Set<number>>;
};

function pairKey(a: string, b: string): string {
  const [x, y] = [slug(a), slug(b)].sort();
  return `${x}|${y}`;
}

function buildHistory(rounds: MickeyBDRound[]): RoundHistory {
  const teammateCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const courtUsage = new Map<string, Set<number>>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const round of rounds) {
    // Teammates inside a team
    for (const team of round.teams) {
      for (let i = 0; i < team.players.length; i++) {
        for (let j = i + 1; j < team.players.length; j++) {
          bump(teammateCount, pairKey(team.players[i], team.players[j]));
        }
      }
    }
    // Opponents per match + court usage
    for (let courtIdx = 0; courtIdx < round.matches.length; courtIdx++) {
      const match = round.matches[courtIdx];
      const teamA = round.teams.find(t => t.id === match.teamAId);
      const teamB = round.teams.find(t => t.id === match.teamBId);
      const aPlayers = teamA?.players ?? [];
      const bPlayers = teamB?.players ?? [];
      for (const a of aPlayers) {
        for (const b of bPlayers) bump(opponentCount, pairKey(a, b));
      }
      for (const p of [...aPlayers, ...bPlayers]) {
        const k = slug(p);
        if (!courtUsage.has(k)) courtUsage.set(k, new Set());
        courtUsage.get(k)!.add(courtIdx);
      }
    }
  }
  return { teammateCount, opponentCount, courtUsage };
}

function scoreCandidate(
  teams: MickeyTeam[],
  matches: MickeyMatchRow[],
  history: RoundHistory,
): number {
  let penalty = 0;
  // Repeat teammates count heavily — they're the most visible to players.
  for (const team of teams) {
    for (let i = 0; i < team.players.length; i++) {
      for (let j = i + 1; j < team.players.length; j++) {
        penalty += (history.teammateCount.get(pairKey(team.players[i], team.players[j])) ?? 0) * 3;
      }
    }
  }
  // Repeat opponents count too, just a bit lighter.
  for (let courtIdx = 0; courtIdx < matches.length; courtIdx++) {
    const match = matches[courtIdx];
    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);
    const aPlayers = teamA?.players ?? [];
    const bPlayers = teamB?.players ?? [];
    for (const a of aPlayers) {
      for (const b of bPlayers) {
        penalty += (history.opponentCount.get(pairKey(a, b)) ?? 0) * 2;
      }
    }
    // Repeat court use — least heavy, mostly so the algorithm rotates courts.
    for (const p of [...aPlayers, ...bPlayers]) {
      const courts = history.courtUsage.get(slug(p));
      if (courts && courts.has(courtIdx)) penalty += 1;
    }
  }
  return penalty;
}

// Build matches for a round. The team order coming in determines court
// assignment (court 1 = first pair, court 2 = second, etc.). We shuffle
// the team list each candidate so different shuffles produce different
// pairings AND different court orderings.
function buildMatchesForRound(teams: MickeyTeam[], roundNumber: number): MickeyMatchRow[] {
  const shuffled = shuffle(teams);
  const out: MickeyMatchRow[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    out.push({
      id: rid(),
      pool: roundNumber,
      teamAId: shuffled[i].id,
      teamBId: shuffled[i + 1].id,
    });
  }
  return out;
}

// Try multiple candidate draws and return the one with the lowest repeat
// penalty against history. When useSmart is false, only one candidate is
// generated (pure random).
function pickBestCandidate(
  pairUnits: Unit[],
  freeUnits: Unit[],
  targetPoolSize: number,
  roundNumber: number,
  history: RoundHistory,
  useSmart: boolean,
): { teams: MickeyTeam[]; matches: MickeyMatchRow[] } | null {
  const tries = useSmart ? SMART_CANDIDATES : 1;
  let best: { teams: MickeyTeam[]; matches: MickeyMatchRow[]; score: number } | null = null;
  for (let i = 0; i < tries; i++) {
    const teams = drawTeams(pairUnits, freeUnits, targetPoolSize);
    if (teams.length < 2) continue;
    const matches = buildMatchesForRound(teams, roundNumber);
    const score = useSmart ? scoreCandidate(teams, matches, history) : 0;
    if (!best || score < best.score) best = { teams, matches, score };
  }
  return best ? { teams: best.teams, matches: best.matches } : null;
}

// ── Manual edit state per round ──────────────────────────────────────────────

type EditState = {
  teams: { id: string; name: string; players: string[] }[]; // players padded to 4 slots
  matches: { id: string; teamAId: string; teamBId: string }[];
};

function roundToEditState(round: MickeyBDRound): EditState {
  return {
    teams: round.teams.map(t => ({
      id: t.id,
      name: t.name,
      players: [...t.players, '', '', '', ''].slice(0, 4),
    })),
    matches: round.matches.map(m => ({ id: m.id, teamAId: m.teamAId, teamBId: m.teamBId })),
  };
}

export function MickeyBDRoundManager({
  pairsText,
  freeAgentsText,
  rounds,
  setRounds,
  courtCount,
  setCourtCount,
}: {
  pairsText: string;
  freeAgentsText: string;
  rounds: MickeyBDRound[];
  setRounds: (f: ((prev: MickeyBDRound[]) => MickeyBDRound[]) | MickeyBDRound[]) => void;
  courtCount: number;
  setCourtCount: (n: number) => void;
}) {
  const [targetPoolSize, setTargetPoolSize] = useState(5);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmRedrawId, setConfirmRedrawId] = useState<string | null>(null);
  const [useSmart, setUseSmart] = useState(true);
  const [batchCount, setBatchCount] = useState(5);

  // Editing state: which round is being edited + a buffer of changes.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<EditState | null>(null);

  const pairUnits = useMemo<Unit[]>(
    () => parseMickeyPairsGendered(pairsText).map(u => toUnit(u)),
    [pairsText],
  );
  const freeUnits = useMemo<Unit[]>(
    () => parseMickeyFreeGendered(freeAgentsText).map(m => toUnit([m])),
    [freeAgentsText],
  );
  const totalPlayers = pairUnits.reduce((n, u) => n + u.size, 0) + freeUnits.length;

  // Full roster (clean names) for editing dropdowns.
  const allPlayerNames = useMemo(
    () => uniq([
      ...parseMickeyPairsGendered(pairsText).flat().map(m => m.name),
      ...parseMickeyFreeGendered(freeAgentsText).map(m => m.name),
    ]).filter(Boolean),
    [pairsText, freeAgentsText],
  );

  const generateRound = () => {
    const history = buildHistory(rounds);
    const result = pickBestCandidate(pairUnits, freeUnits, targetPoolSize, rounds.length + 1, history, useSmart);
    if (!result) {
      alert('Need at least 2 teams to make a round. Add more pairs or free agents.');
      return;
    }
    setRounds(prev => [...prev, {
      id: rid(),
      number: prev.length + 1,
      teams: result.teams,
      matches: result.matches,
    }]);
  };

  // Generate N rounds at once, with history accumulating after each generated
  // round so later rounds avoid the matchups already scheduled.
  const generateBatch = (count: number) => {
    if (totalPlayers < 4) {
      alert('Need at least 4 players to start.');
      return;
    }
    setRounds(prev => {
      const working = [...prev];
      for (let i = 0; i < count; i++) {
        const history = buildHistory(working);
        const result = pickBestCandidate(pairUnits, freeUnits, targetPoolSize, working.length + 1, history, useSmart);
        if (!result) break;
        working.push({
          id: rid(),
          number: working.length + 1,
          teams: result.teams,
          matches: result.matches,
        });
      }
      return working;
    });
  };

  const redrawRound = (roundId: string) => {
    setRounds(prev => prev.map(r => {
      if (r.id !== roundId) return r;
      // History from rounds OTHER than the one being re-rolled
      const otherRounds = prev.filter(p => p.id !== roundId);
      const history = buildHistory(otherRounds);
      const result = pickBestCandidate(pairUnits, freeUnits, targetPoolSize, r.number, history, useSmart);
      if (!result) return r;
      return { ...r, teams: result.teams, matches: result.matches };
    }));
    setConfirmRedrawId(null);
  };

  const removeRound = (roundId: string) => {
    setRounds(prev => {
      const filtered = prev.filter(r => r.id !== roundId);
      return filtered.map((r, i) => ({ ...r, number: i + 1 }));
    });
    setConfirmRemoveId(null);
    if (editingId === roundId) {
      setEditingId(null);
      setEditBuffer(null);
    }
  };

  const startEditing = (round: MickeyBDRound) => {
    setEditingId(round.id);
    setEditBuffer(roundToEditState(round));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditBuffer(null);
  };
  const saveEdit = () => {
    if (!editingId || !editBuffer) return;
    setRounds(prev => prev.map(r => {
      if (r.id !== editingId) return r;
      const newTeams: MickeyTeam[] = editBuffer.teams.map((et, i) => ({
        ...r.teams[i],
        id: et.id,
        name: et.name.trim() || `Team ${i + 1}`,
        players: et.players.map(p => p.trim()).filter(Boolean),
      }));
      const newMatches: MickeyMatchRow[] = editBuffer.matches.map(em => {
        const existing = r.matches.find(m => m.id === em.id);
        return {
          ...(existing ?? { id: em.id, pool: r.number }),
          teamAId: em.teamAId,
          teamBId: em.teamBId,
        };
      });
      return { ...r, teams: newTeams, matches: newMatches };
    }));
    setEditingId(null);
    setEditBuffer(null);
  };

  // Duplicate-player warning for the edit buffer
  const dupNames = useMemo(() => {
    if (!editBuffer) return [];
    const all = editBuffer.teams.flatMap(t => t.players.filter(Boolean));
    return uniq(all.filter((n, i) => all.indexOf(n) !== i));
  }, [editBuffer]);

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold text-sky-800">Rounds</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Each round re-randomizes teams using the same pair-preserving algorithm. Each round plays one match per team
          with Mickey + Minnie sets back-to-back. Click <span className="font-medium">Generate Next Round</span> as many
          times as you want.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[12px] text-slate-600">
        <span>
          Roster:{' '}
          <span className="font-semibold">
            {pairUnits.length} pair{pairUnits.length === 1 ? '' : 's'}, {freeUnits.length} free agent
            {freeUnits.length === 1 ? '' : 's'}, {totalPlayers} player{totalPlayers === 1 ? '' : 's'}
          </span>
        </span>
        <label className="flex items-center gap-1.5">
          Target pool size:
          <input
            type="number"
            min={2}
            max={20}
            value={targetPoolSize}
            onChange={e => setTargetPoolSize(Math.max(2, parseInt(e.target.value) || 5))}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
          />
          <span className="text-slate-400">teams/round</span>
        </label>
        <label className="flex items-center gap-1.5">
          Courts available:
          <input
            type="number"
            min={1}
            max={50}
            value={courtCount}
            onChange={e => setCourtCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
          />
          <span className="text-slate-400">
            {courtCount === 1
              ? 'matches in a round play sequentially.'
              : `up to ${courtCount} matches per time slot.`}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={useSmart} onChange={e => setUseSmart(e.target.checked)} />
          Avoid repeats (smart re-shuffle)
        </label>
        <span className="text-[11px] text-slate-400">
          Tries {SMART_CANDIDATES} candidate draws and picks the one with the fewest repeat teammates, repeat opponents, and same-court assignments.
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[13px] disabled:opacity-40"
          disabled={totalPlayers < 4}
          onClick={generateRound}
        >
          Generate {rounds.length === 0 ? 'First' : 'Next'} Round
        </button>
        <span className="text-slate-300">|</span>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
          Generate
          <input
            type="number"
            min={1}
            max={50}
            value={batchCount}
            onChange={e => setBatchCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-12 border border-slate-300 rounded px-1 py-1 text-[12px] text-center font-semibold"
          />
          rounds at once
        </label>
        <button
          className="px-3 py-1.5 rounded border border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-[13px] disabled:opacity-40"
          disabled={totalPlayers < 4}
          onClick={() => generateBatch(batchCount)}
        >
          Generate {batchCount} Rounds
        </button>
        {totalPlayers < 4 && (
          <span className="text-[11px] text-slate-500">Need at least 4 players to start.</span>
        )}
      </div>

      {rounds.length > 0 && (
        <div className="border-t pt-3 space-y-3">
          <h3 className="text-[13px] font-semibold text-slate-600 uppercase tracking-wide">Rounds drawn so far</h3>
          {rounds.map(round => {
            const isEditing = editingId === round.id;
            return (
              <div key={round.id} className="border border-slate-200 rounded-lg bg-slate-50/50 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="text-[13px] font-semibold text-sky-800">
                    Round {round.number}
                    <span className="ml-2 text-[11px] font-normal text-slate-500">
                      {round.teams.length} team{round.teams.length === 1 ? '' : 's'} · {round.matches.length} match
                      {round.matches.length === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isEditing ? (
                      <>
                        <button
                          className="px-2 py-1 rounded border text-slate-700 hover:bg-slate-50 text-[11px]"
                          onClick={() => startEditing(round)}
                        >
                          Edit
                        </button>
                        <button
                          className="px-2 py-1 rounded border text-slate-700 hover:bg-slate-50 text-[11px]"
                          onClick={() => setConfirmRedrawId(round.id)}
                        >
                          Re-roll
                        </button>
                        <button
                          className="px-2 py-1 rounded text-red-600 hover:bg-red-50 text-[11px]"
                          onClick={() => setConfirmRemoveId(round.id)}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px]"
                          onClick={saveEdit}
                        >
                          Save
                        </button>
                        <button
                          className="px-2 py-1 rounded border text-slate-700 text-[11px]"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!isEditing && (
                  <div className="grid md:grid-cols-2 gap-1.5 text-[12px] text-slate-600">
                    {round.teams.map(t => (
                      <div key={t.id} className="bg-white rounded px-2 py-1 border border-slate-200">
                        <span className="font-medium text-slate-800">{t.name}</span>
                        <span className="text-slate-500"> — {mickeyMemberList(t.players, pairsText) || t.players.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isEditing && editBuffer && (
                  <div className="space-y-3 mt-2">
                    {dupNames.length > 0 && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        Duplicate players: {dupNames.join(', ')}
                      </div>
                    )}

                    {/* Team editor */}
                    <div className="grid md:grid-cols-2 gap-2">
                      {editBuffer.teams.map((team, tIdx) => (
                        <div key={team.id} className="bg-white border border-slate-200 rounded p-2 space-y-1.5">
                          <input
                            className="w-full border border-slate-300 rounded px-2 py-1 text-[12px] font-medium"
                            value={team.name}
                            onChange={e => {
                              const v = e.target.value;
                              setEditBuffer(buf => buf && ({
                                ...buf,
                                teams: buf.teams.map((t, i) => i === tIdx ? { ...t, name: v } : t),
                              }));
                            }}
                          />
                          <div className="grid grid-cols-2 gap-1">
                            {team.players.map((player, pIdx) => (
                              <select
                                key={pIdx}
                                className={'border rounded px-1.5 py-1 text-[12px] bg-white ' + (player && dupNames.includes(player) ? 'border-amber-400 bg-amber-50' : 'border-slate-300')}
                                value={player}
                                onChange={e => {
                                  const v = e.target.value;
                                  setEditBuffer(buf => buf && ({
                                    ...buf,
                                    teams: buf.teams.map((t, i) =>
                                      i === tIdx
                                        ? { ...t, players: t.players.map((p, j) => j === pIdx ? v : p) }
                                        : t),
                                  }));
                                }}
                              >
                                <option value="">— player {pIdx + 1} —</option>
                                {allPlayerNames.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Match pairing editor */}
                    <div className="bg-white border border-slate-200 rounded p-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Match pairings</div>
                      {editBuffer.matches.map((m, mIdx) => (
                        <div key={m.id} className="flex items-center gap-2 text-[12px] flex-wrap">
                          <span className="text-slate-500">Match {mIdx + 1}:</span>
                          <select
                            className="border border-slate-300 rounded px-1.5 py-1 text-[12px] flex-1 min-w-[120px]"
                            value={m.teamAId}
                            onChange={e => {
                              const v = e.target.value;
                              setEditBuffer(buf => buf && ({
                                ...buf,
                                matches: buf.matches.map((mm, i) => i === mIdx ? { ...mm, teamAId: v } : mm),
                              }));
                            }}
                          >
                            {editBuffer.teams.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          <span className="text-slate-400">vs</span>
                          <select
                            className="border border-slate-300 rounded px-1.5 py-1 text-[12px] flex-1 min-w-[120px]"
                            value={m.teamBId}
                            onChange={e => {
                              const v = e.target.value;
                              setEditBuffer(buf => buf && ({
                                ...buf,
                                matches: buf.matches.map((mm, i) => i === mIdx ? { ...mm, teamBId: v } : mm),
                              }));
                            }}
                          >
                            {editBuffer.teams.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {confirmRedrawId === round.id && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-amber-800">Re-roll round {round.number}? Any scores entered for this round are cleared.</span>
                    <div className="flex items-center gap-1.5">
                      <button className="px-2 py-1 rounded bg-amber-600 text-white" onClick={() => redrawRound(round.id)}>Re-roll</button>
                      <button className="px-2 py-1 rounded border" onClick={() => setConfirmRedrawId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {confirmRemoveId === round.id && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-red-800">Remove round {round.number}? Remaining rounds will be renumbered.</span>
                    <div className="flex items-center gap-1.5">
                      <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={() => removeRound(round.id)}>Remove</button>
                      <button className="px-2 py-1 rounded border" onClick={() => setConfirmRemoveId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

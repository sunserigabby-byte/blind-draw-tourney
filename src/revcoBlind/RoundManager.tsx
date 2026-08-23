import React, { useMemo, useState } from 'react';
import type { MickeyTeam, RevcoMatchRow } from '../types';
import {
  parseMickeyPairsGendered, parseMickeyFreeGendered, mickeyMemberList,
  shuffle, slug, uniq,
} from '../utils';
import { drawTeams, toUnit, type Unit } from '../mickey/TeamBuilder';

const rid = () => Math.random().toString(36).slice(2, 10);
const SMART_CANDIDATES = 150;

export type RevcoBDRound = {
  id: string;
  number: number;
  teams: MickeyTeam[];
  matches: RevcoMatchRow[];
};

// ── Pair-level identity ───────────────────────────────────────────────────────
// Each registered pair gets a stable ID = sorted player slugs joined by "|".
// Free agents each get their own slug as ID.
// This way the unit of memory is the PAIR (not individual players), which is
// more accurate for a format where pairs always stay together.

type PairId = string;

function buildPairMap(pairsText: string, freeAgentsText: string): Map<string, PairId> {
  const map = new Map<string, PairId>();
  for (const members of parseMickeyPairsGendered(pairsText)) {
    const slugs = members.map(m => slug(m.name)).sort();
    const pairId = slugs.join('|');
    for (const m of members) map.set(slug(m.name), pairId);
  }
  for (const m of parseMickeyFreeGendered(freeAgentsText)) {
    const s = slug(m.name);
    map.set(s, s);
  }
  return map;
}

// Get the unique pair IDs present on a team (typically 2 for a full team of 4).
function getPairIds(players: string[], pairMap: Map<string, PairId>): PairId[] {
  const seen = new Set<PairId>();
  const result: PairId[] = [];
  for (const p of players) {
    const id = pairMap.get(slug(p)) ?? slug(p);
    if (!seen.has(id)) { seen.add(id); result.push(id); }
  }
  return result;
}

// Stable unordered key for a pair-of-pairs relationship.
// Uses "::" as separator to avoid collisions with "|" inside pairIds.
function pairKey(a: PairId, b: PairId): string {
  return [a, b].sort().join('::');
}

// ── History ───────────────────────────────────────────────────────────────────

type PairHistory = {
  teammateCount: Map<string, number>;          // pairKey(pairId1, pairId2) → times they shared a team
  opponentCount: Map<string, number>;          // pairKey(pairId1, pairId2) → times they faced each other
  courtCount: Map<PairId, Map<number, number>>; // pairId → courtIdx → times on that court
  sitOutCount: Map<PairId, number>;            // pairId → times they sat out without a match
};

function buildPairHistory(rounds: RevcoBDRound[], pairMap: Map<string, PairId>): PairHistory {
  const teammateCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const courtCount = new Map<PairId, Map<number, number>>();
  const sitOutCount = new Map<PairId, number>();
  const bump = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1);

  for (const round of rounds) {
    const playingTeamIds = new Set(round.matches.flatMap(m => [m.teamAId, m.teamBId]));

    // Teammate tracking for ALL formed teams (including sit-outs — being grouped
    // with a pair counts even if you don't play a match that round).
    for (const team of round.teams) {
      const pairIds = getPairIds(team.players, pairMap);
      for (let i = 0; i < pairIds.length; i++) {
        for (let j = i + 1; j < pairIds.length; j++) {
          bump(teammateCount, pairKey(pairIds[i], pairIds[j]));
        }
      }
      // Track sit-outs so the draw can prioritise getting them into the next match.
      if (!playingTeamIds.has(team.id)) {
        for (const pId of pairIds) bump(sitOutCount, pId);
      }
    }

    // Opponent + court tracking for played matches only.
    for (let courtIdx = 0; courtIdx < round.matches.length; courtIdx++) {
      const match = round.matches[courtIdx];
      const teamA = round.teams.find(t => t.id === match.teamAId);
      const teamB = round.teams.find(t => t.id === match.teamBId);
      const aPairIds = getPairIds(teamA?.players ?? [], pairMap);
      const bPairIds = getPairIds(teamB?.players ?? [], pairMap);

      for (const pA of aPairIds) {
        for (const pB of bPairIds) {
          bump(opponentCount, pairKey(pA, pB));
        }
      }

      for (const pId of [...aPairIds, ...bPairIds]) {
        if (!courtCount.has(pId)) courtCount.set(pId, new Map());
        const m = courtCount.get(pId)!;
        m.set(courtIdx, (m.get(courtIdx) ?? 0) + 1);
      }
    }
  }

  return { teammateCount, opponentCount, courtCount, sitOutCount };
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Weights are equal for teammates and opponents — we want maximum variety in
// BOTH directions. Sit-outs are weighted highest so no pair is left out twice
// when others haven't sat out yet.

const TEAMMATE_WEIGHT = 3;
const OPPONENT_WEIGHT = 3;
const COURT_WEIGHT    = 1;
const SITOUT_WEIGHT   = 5; // Strongest: being skipped a second time is unfair

function scorePairCandidate(
  teams: MickeyTeam[],
  matches: RevcoMatchRow[],
  history: PairHistory,
  pairMap: Map<string, PairId>,
): number {
  let penalty = 0;
  const playingTeamIds = new Set(matches.flatMap(m => [m.teamAId, m.teamBId]));

  for (const team of teams) {
    const pairIds = getPairIds(team.players, pairMap);

    // Teammate repeat penalty
    for (let i = 0; i < pairIds.length; i++) {
      for (let j = i + 1; j < pairIds.length; j++) {
        const count = history.teammateCount.get(pairKey(pairIds[i], pairIds[j])) ?? 0;
        penalty += count * TEAMMATE_WEIGHT;
      }
    }

    // Sit-out repeat penalty — penalise putting a pair on the bench again
    // when they've already sat out and others haven't.
    if (!playingTeamIds.has(team.id)) {
      for (const pId of pairIds) {
        penalty += (history.sitOutCount.get(pId) ?? 0) * SITOUT_WEIGHT;
      }
    }
  }

  for (let courtIdx = 0; courtIdx < matches.length; courtIdx++) {
    const match = matches[courtIdx];
    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);
    const aPairIds = getPairIds(teamA?.players ?? [], pairMap);
    const bPairIds = getPairIds(teamB?.players ?? [], pairMap);

    // Opponent repeat penalty
    for (const pA of aPairIds) {
      for (const pB of bPairIds) {
        const count = history.opponentCount.get(pairKey(pA, pB)) ?? 0;
        penalty += count * OPPONENT_WEIGHT;
      }
    }

    // Court repeat penalty — tracks how many times each pair has played
    // each specific court and penalises overuse.
    for (const pId of [...aPairIds, ...bPairIds]) {
      const timesOnCourt = history.courtCount.get(pId)?.get(courtIdx) ?? 0;
      penalty += timesOnCourt * COURT_WEIGHT;
    }
  }

  return penalty;
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function buildMatchesForRound(teams: MickeyTeam[], roundNumber: number): RevcoMatchRow[] {
  const shuffled = shuffle(teams);
  const out: RevcoMatchRow[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    out.push({ id: rid(), pool: roundNumber, teamAId: shuffled[i].id, teamBId: shuffled[i + 1].id });
  }
  return out;
}

function pickBestCandidate(
  pairUnits: Unit[],
  freeUnits: Unit[],
  targetPoolSize: number,
  roundNumber: number,
  history: PairHistory,
  pairMap: Map<string, PairId>,
  useSmart: boolean,
): { teams: MickeyTeam[]; matches: RevcoMatchRow[] } | null {
  const tries = useSmart ? SMART_CANDIDATES : 1;
  let best: { teams: MickeyTeam[]; matches: RevcoMatchRow[]; score: number } | null = null;
  for (let i = 0; i < tries; i++) {
    const teams = drawTeams(pairUnits, freeUnits, targetPoolSize);
    if (teams.length < 2) continue;
    const matches = buildMatchesForRound(teams, roundNumber);
    const score = useSmart ? scorePairCandidate(teams, matches, history, pairMap) : 0;
    if (!best || score < best.score) best = { teams, matches, score };
  }
  return best ? { teams: best.teams, matches: best.matches } : null;
}

// ── Manual edit state ─────────────────────────────────────────────────────────

type EditState = {
  teams: { id: string; name: string; players: string[] }[];
  matches: { id: string; teamAId: string; teamBId: string }[];
};

function roundToEditState(round: RevcoBDRound): EditState {
  return {
    teams: round.teams.map(t => ({
      id: t.id,
      name: t.name,
      players: [...t.players, '', '', '', ''].slice(0, 4),
    })),
    matches: round.matches.map(m => ({ id: m.id, teamAId: m.teamAId, teamBId: m.teamBId })),
  };
}

export function RevcoBDRoundManager({
  pairsText,
  freeAgentsText,
  rounds,
  setRounds,
  courtCount,
  setCourtCount,
}: {
  pairsText: string;
  freeAgentsText: string;
  rounds: RevcoBDRound[];
  setRounds: (f: ((prev: RevcoBDRound[]) => RevcoBDRound[]) | RevcoBDRound[]) => void;
  courtCount: number;
  setCourtCount: (n: number) => void;
}) {
  const [targetPoolSize, setTargetPoolSize] = useState(5);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmRedrawId, setConfirmRedrawId] = useState<string | null>(null);
  const [useSmart, setUseSmart] = useState(true);
  const [batchCount, setBatchCount] = useState(5);
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

  const allPlayerNames = useMemo(
    () => uniq([
      ...parseMickeyPairsGendered(pairsText).flat().map(m => m.name),
      ...parseMickeyFreeGendered(freeAgentsText).map(m => m.name),
    ]).filter(Boolean),
    [pairsText, freeAgentsText],
  );

  const generateRound = () => {
    const pairMap = buildPairMap(pairsText, freeAgentsText);
    const history = buildPairHistory(rounds, pairMap);
    const result = pickBestCandidate(pairUnits, freeUnits, targetPoolSize, rounds.length + 1, history, pairMap, useSmart);
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

  const generateBatch = (count: number) => {
    if (totalPlayers < 4) {
      alert('Need at least 4 players to start.');
      return;
    }
    const pairMap = buildPairMap(pairsText, freeAgentsText);
    setRounds(prev => {
      const working = [...prev];
      for (let i = 0; i < count; i++) {
        const history = buildPairHistory(working, pairMap);
        const result = pickBestCandidate(pairUnits, freeUnits, targetPoolSize, working.length + 1, history, pairMap, useSmart);
        if (!result) break;
        working.push({ id: rid(), number: working.length + 1, teams: result.teams, matches: result.matches });
      }
      return working;
    });
  };

  const redrawRound = (roundId: string) => {
    const pairMap = buildPairMap(pairsText, freeAgentsText);
    setRounds(prev => prev.map(r => {
      if (r.id !== roundId) return r;
      const otherRounds = prev.filter(p => p.id !== roundId);
      const history = buildPairHistory(otherRounds, pairMap);
      const result = pickBestCandidate(pairUnits, freeUnits, targetPoolSize, r.number, history, pairMap, useSmart);
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
    if (editingId === roundId) { setEditingId(null); setEditBuffer(null); }
  };

  const startEditing = (round: RevcoBDRound) => { setEditingId(round.id); setEditBuffer(roundToEditState(round)); };
  const cancelEdit = () => { setEditingId(null); setEditBuffer(null); };
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
      const newMatches: RevcoMatchRow[] = editBuffer.matches.map(em => {
        const existing = r.matches.find(m => m.id === em.id);
        return { ...(existing ?? { id: em.id, pool: r.number }), teamAId: em.teamAId, teamBId: em.teamBId };
      });
      return { ...r, teams: newTeams, matches: newMatches };
    }));
    setEditingId(null);
    setEditBuffer(null);
  };

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
          Each round uses a smart draw that checks {SMART_CANDIDATES} candidate arrangements and picks the one where
          pairs have the fewest repeat teammates, repeat opponents, repeated courts, and repeated sit-outs.
          Click <span className="font-medium">Generate Next Round</span> when ready.
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
          Courts available:
          <input
            type="number" min={1} max={50} value={courtCount}
            onChange={e => setCourtCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
          />
          <span className="text-slate-400">
            {courtCount === 1 ? 'matches play sequentially.' : `up to ${courtCount} matches per time slot.`}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={useSmart} onChange={e => setUseSmart(e.target.checked)} />
          Smart draw (avoid repeats)
        </label>
        <span className="text-[11px] text-slate-400">
          Tries {SMART_CANDIDATES} draws. Tracks teammate repeats, opponent repeats, court rotation, and sit-outs equally.
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
            type="number" min={1} max={50} value={batchCount}
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
                      {round.teams.length} team{round.teams.length === 1 ? '' : 's'} · {round.matches.length} match{round.matches.length === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isEditing ? (
                      <>
                        <button className="px-2 py-1 rounded border text-slate-700 hover:bg-slate-50 text-[11px]" onClick={() => startEditing(round)}>Edit</button>
                        <button className="px-2 py-1 rounded border text-slate-700 hover:bg-slate-50 text-[11px]" onClick={() => setConfirmRedrawId(round.id)}>Re-roll</button>
                        <button className="px-2 py-1 rounded text-red-600 hover:bg-red-50 text-[11px]" onClick={() => setConfirmRemoveId(round.id)}>Remove</button>
                      </>
                    ) : (
                      <>
                        <button className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px]" onClick={saveEdit}>Save</button>
                        <button className="px-2 py-1 rounded border text-slate-700 text-[11px]" onClick={cancelEdit}>Cancel</button>
                      </>
                    )}
                  </div>
                </div>

                {!isEditing && (
                  <div className="grid md:grid-cols-2 gap-1.5 text-[12px] text-slate-600">
                    {round.teams.map(t => {
                      const isPlaying = round.matches.some(m => m.teamAId === t.id || m.teamBId === t.id);
                      return (
                        <div key={t.id} className={`rounded px-2 py-1 border ${isPlaying ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                          <span className="font-medium text-slate-800">{t.name}</span>
                          {!isPlaying && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">sitting out</span>}
                          <span className="text-slate-500"> — {mickeyMemberList(t.players, pairsText) || t.players.join(', ')}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isEditing && editBuffer && (
                  <div className="space-y-3 mt-2">
                    {dupNames.length > 0 && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        Duplicate players: {dupNames.join(', ')}
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-2">
                      {editBuffer.teams.map((team, tIdx) => (
                        <div key={team.id} className="bg-white border border-slate-200 rounded p-2 space-y-1.5">
                          <input
                            className="w-full border border-slate-300 rounded px-2 py-1 text-[12px] font-medium"
                            value={team.name}
                            onChange={e => { const v = e.target.value; setEditBuffer(buf => buf && ({ ...buf, teams: buf.teams.map((t, i) => i === tIdx ? { ...t, name: v } : t) })); }}
                          />
                          <div className="grid grid-cols-2 gap-1">
                            {team.players.map((player, pIdx) => (
                              <select
                                key={pIdx}
                                className={'border rounded px-1.5 py-1 text-[12px] bg-white ' + (player && dupNames.includes(player) ? 'border-amber-400 bg-amber-50' : 'border-slate-300')}
                                value={player}
                                onChange={e => { const v = e.target.value; setEditBuffer(buf => buf && ({ ...buf, teams: buf.teams.map((t, i) => i === tIdx ? { ...t, players: t.players.map((p, j) => j === pIdx ? v : p) } : t) })); }}
                              >
                                <option value="">— player {pIdx + 1} —</option>
                                {allPlayerNames.map(name => <option key={name} value={name}>{name}</option>)}
                              </select>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white border border-slate-200 rounded p-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Match pairings</div>
                      {editBuffer.matches.map((m, mIdx) => (
                        <div key={m.id} className="flex items-center gap-2 text-[12px] flex-wrap">
                          <span className="text-slate-500">Match {mIdx + 1}:</span>
                          <select className="border border-slate-300 rounded px-1.5 py-1 text-[12px] flex-1 min-w-[120px]" value={m.teamAId}
                            onChange={e => { const v = e.target.value; setEditBuffer(buf => buf && ({ ...buf, matches: buf.matches.map((mm, i) => i === mIdx ? { ...mm, teamAId: v } : mm) })); }}>
                            {editBuffer.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <span className="text-slate-400">vs</span>
                          <select className="border border-slate-300 rounded px-1.5 py-1 text-[12px] flex-1 min-w-[120px]" value={m.teamBId}
                            onChange={e => { const v = e.target.value; setEditBuffer(buf => buf && ({ ...buf, matches: buf.matches.map((mm, i) => i === mIdx ? { ...mm, teamBId: v } : mm) })); }}>
                            {editBuffer.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {confirmRedrawId === round.id && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-amber-800">Re-roll round {round.number}? Scores for this round will be cleared.</span>
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

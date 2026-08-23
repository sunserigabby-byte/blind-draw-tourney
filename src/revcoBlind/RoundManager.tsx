import React, { useMemo, useState } from 'react';
import type { MickeyTeam, RevcoMatchRow, RevcoBDRound } from '../types';
import {
  parseMickeyPairsGendered, parseMickeyFreeGendered, mickeyMemberList,
  pickFunTeamNames, slug, uniq,
} from '../utils';
import { toUnit, type Unit } from '../mickey/TeamBuilder';
import {
  buildPairMap, buildPairHistory, getPairIds, pairKey,
  type PairId, type PairHistory,
} from './pairUtils';

const rid = () => Math.random().toString(36).slice(2, 10);
const SMART_CANDIDATES = 150;

export type { RevcoBDRound };

// ── Scoring ───────────────────────────────────────────────────────────────────
// Weights: teammate and opponent repeats are equally bad. Sit-outs weighted
// highest so no pair is skipped twice while others haven't sat out yet.

const TEAMMATE_WEIGHT = 3;
const OPPONENT_WEIGHT = 3;
const COURT_WEIGHT    = 1;
const SITOUT_WEIGHT   = 5;

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

    for (let i = 0; i < pairIds.length; i++) {
      for (let j = i + 1; j < pairIds.length; j++) {
        const count = history.teammateCount.get(pairKey(pairIds[i], pairIds[j])) ?? 0;
        penalty += count * TEAMMATE_WEIGHT;
      }
    }

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

    for (const pA of aPairIds) {
      for (const pB of bPairIds) {
        const count = history.opponentCount.get(pairKey(pA, pB)) ?? 0;
        penalty += count * OPPONENT_WEIGHT;
      }
    }

    for (const pId of [...aPairIds, ...bPairIds]) {
      const timesOnCourt = history.courtCount.get(pId)?.get(courtIdx) ?? 0;
      penalty += timesOnCourt * COURT_WEIGHT;
    }
  }

  return penalty;
}

// ── History-aware draw ────────────────────────────────────────────────────────

function getAllPairIds(pairsText: string, freeAgentsText: string): PairId[] {
  const ids: PairId[] = [];
  for (const members of parseMickeyPairsGendered(pairsText)) {
    ids.push(members.map(m => slug(m.name)).sort().join('|'));
  }
  for (const m of parseMickeyFreeGendered(freeAgentsText)) {
    ids.push(slug(m.name));
  }
  return ids;
}

function buildPairIdToPlayers(pairsText: string, freeAgentsText: string): Map<PairId, string[]> {
  const map = new Map<PairId, string[]>();
  for (const members of parseMickeyPairsGendered(pairsText)) {
    const slugs = members.map(m => slug(m.name)).sort();
    map.set(slugs.join('|'), members.map(m => m.name));
  }
  for (const m of parseMickeyFreeGendered(freeAgentsText)) {
    map.set(slug(m.name), [m.name]);
  }
  return map;
}

// Phase 1 — Greedy history-aware team formation.
// Pairs that have been teammates least often get grouped first.
// noise > 0 adds random jitter so repeated calls explore different groupings.
function greedyTeamFormation(
  allPairIds: PairId[],
  history: PairHistory,
  noise: number,
): PairId[][] {
  const candidates: { a: PairId; b: PairId; cost: number }[] = [];
  for (let i = 0; i < allPairIds.length; i++) {
    for (let j = i + 1; j < allPairIds.length; j++) {
      const baseCost =
        (history.teammateCount.get(pairKey(allPairIds[i], allPairIds[j])) ?? 0) * TEAMMATE_WEIGHT;
      const jitter = noise > 0 ? Math.random() * noise : 0;
      candidates.push({ a: allPairIds[i], b: allPairIds[j], cost: baseCost + jitter });
    }
  }
  candidates.sort((x, y) => x.cost - y.cost);

  const assigned = new Set<PairId>();
  const groups: PairId[][] = [];

  for (const { a, b } of candidates) {
    if (assigned.has(a) || assigned.has(b)) continue;
    groups.push([a, b]);
    assigned.add(a);
    assigned.add(b);
  }
  // Odd pair out → singleton team that will sit out this round
  for (const pId of allPairIds) {
    if (!assigned.has(pId)) groups.push([pId]);
  }
  return groups;
}

// Phase 2 — Greedy history-aware opponent matching.
// Teams whose pairs have played each other least often get matched first.
function greedyOpponentMatching(
  groups: PairId[][],
  history: PairHistory,
  noise: number,
): [number, number][] {
  const candidates: { a: number; b: number; cost: number }[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      let cost = 0;
      for (const pA of groups[i]) {
        for (const pB of groups[j]) {
          cost += (history.opponentCount.get(pairKey(pA, pB)) ?? 0) * OPPONENT_WEIGHT;
        }
      }
      const jitter = noise > 0 ? Math.random() * noise : 0;
      candidates.push({ a: i, b: j, cost: cost + jitter });
    }
  }
  candidates.sort((x, y) => x.cost - y.cost);

  const matched = new Set<number>();
  const pairs: [number, number][] = [];
  for (const { a, b } of candidates) {
    if (matched.has(a) || matched.has(b)) continue;
    pairs.push([a, b]);
    matched.add(a);
    matched.add(b);
  }
  return pairs;
}

// Phase 3 — Convert pair groups + match pairings into proper domain objects.
function buildRoundFromGroups(
  groups: PairId[][],
  matchPairs: [number, number][],
  pairIdToPlayers: Map<PairId, string[]>,
  roundNumber: number,
): { teams: MickeyTeam[]; matches: RevcoMatchRow[] } {
  const names = pickFunTeamNames(groups.length);
  const teams: MickeyTeam[] = groups.map((group, i) => ({
    id: rid(),
    name: names[i],
    players: group.flatMap(pId => pairIdToPlayers.get(pId) ?? []),
    pool: 1,
  }));
  const matches: RevcoMatchRow[] = matchPairs.map(([ai, bi]) => ({
    id: rid(),
    pool: roundNumber,
    teamAId: teams[ai].id,
    teamBId: teams[bi].id,
  }));
  return { teams, matches };
}

// Main draw: candidate 0 is pure greedy (optimal for known history).
// Candidates 1–N add jitter to explore near-optimal alternatives.
// Returns the lowest-penalty result across all tries.
function pickBestCandidate(
  pairsText: string,
  freeAgentsText: string,
  roundNumber: number,
  history: PairHistory,
  pairMap: Map<string, PairId>,
  useSmart: boolean,
): { teams: MickeyTeam[]; matches: RevcoMatchRow[] } | null {
  const allPairIds = getAllPairIds(pairsText, freeAgentsText);
  if (allPairIds.length < 2) return null;

  const pairIdToPlayers = buildPairIdToPlayers(pairsText, freeAgentsText);
  const tries = useSmart ? SMART_CANDIDATES : 1;
  let best: { teams: MickeyTeam[]; matches: RevcoMatchRow[]; score: number } | null = null;

  for (let i = 0; i < tries; i++) {
    const noise = i === 0 ? 0 : 2.0;
    const groups = greedyTeamFormation(allPairIds, history, noise);
    if (groups.length < 2) continue;
    const matchPairs = greedyOpponentMatching(groups, history, noise);
    if (matchPairs.length === 0) continue;
    const { teams, matches } = buildRoundFromGroups(groups, matchPairs, pairIdToPlayers, roundNumber);
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

function to24h(h12: number, ampm: 'AM' | 'PM'): number {
  if (ampm === 'AM') return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

export function RevcoBDRoundManager({
  pairsText,
  freeAgentsText,
  rounds,
  setRounds,
  courtCount,
  setCourtCount,
  startHour,
  setStartHour,
  slotMinutes,
  setSlotMinutes,
}: {
  pairsText: string;
  freeAgentsText: string;
  rounds: RevcoBDRound[];
  setRounds: (f: ((prev: RevcoBDRound[]) => RevcoBDRound[]) | RevcoBDRound[]) => void;
  courtCount: number;
  setCourtCount: (n: number) => void;
  startHour: number;
  setStartHour: (h: number) => void;
  slotMinutes: number;
  setSlotMinutes: (m: number) => void;
}) {
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
    const result = pickBestCandidate(pairsText, freeAgentsText, rounds.length + 1, history, pairMap, useSmart);
    if (!result) {
      alert('Need at least 2 pairs to make a round.');
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
        const result = pickBestCandidate(pairsText, freeAgentsText, working.length + 1, history, pairMap, useSmart);
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
      const result = pickBestCandidate(pairsText, freeAgentsText, r.number, history, pairMap, useSmart);
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
          Smart draw checks {SMART_CANDIDATES} arrangements using a history-aware greedy algorithm:
          pairs that have been teammates or opponents least often get prioritised first,
          then jitter is added to explore alternatives. Picks the lowest-penalty result.
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

      <div className="flex items-center gap-3 flex-wrap text-[12px] text-slate-600">
        <label className="flex items-center gap-1.5">
          Start time:
          <input
            type="number" min={1} max={12}
            value={startHour % 12 === 0 ? 12 : startHour % 12}
            onChange={e => {
              const h12 = Math.max(1, Math.min(12, parseInt(e.target.value) || 1));
              const ampm: 'AM' | 'PM' = startHour < 12 ? 'AM' : 'PM';
              setStartHour(to24h(h12, ampm));
            }}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
          />
          <select
            value={startHour < 12 ? 'AM' : 'PM'}
            onChange={e => {
              const ampm = e.target.value as 'AM' | 'PM';
              const h12 = startHour % 12 === 0 ? 12 : startHour % 12;
              setStartHour(to24h(h12, ampm));
            }}
            className="border border-slate-300 rounded px-2 py-1 text-[12px] bg-white"
          >
            <option>AM</option>
            <option>PM</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Round length:
          <select
            value={slotMinutes}
            onChange={e => setSlotMinutes(parseInt(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1 text-[12px] bg-white"
          >
            {[30, 45, 60, 75, 90].map(m => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={useSmart} onChange={e => setUseSmart(e.target.checked)} />
          Smart draw (avoid repeats)
        </label>
        <span className="text-[11px] text-slate-400">
          Greedy history-aware algorithm: teammate repeats, opponent repeats, court rotation, and sit-out fairness.
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

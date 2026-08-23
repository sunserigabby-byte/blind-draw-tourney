// Shared pair-level tracking utilities for Revco Quads Blind Draw.
// The unit of memory in this format is the REGISTERED PAIR, not the individual
// player — because pairs always stay together, tracking at pair level is both
// more accurate and more efficient.

import { parseMickeyPairsGendered, parseMickeyFreeGendered, slug } from '../utils';
import type { RevcoBDRound } from '../types';

// ── Pair identity ─────────────────────────────────────────────────────────────

export type PairId = string;
// Registered pairs:  sorted slug(p1)|slug(p2), e.g. "alice|bob"
// Free agents:       single slug,              e.g. "charlie"

// Stable unordered key for a PAIR-OF-PAIRS relationship.
// Uses "::" as separator to avoid collision with "|" inside pairIds.
export function pairKey(a: PairId, b: PairId): string {
  return [a, b].sort().join('::');
}

// Build a map from each individual player's slug → their registered pair ID.
export function buildPairMap(pairsText: string, freeAgentsText: string): Map<string, PairId> {
  const map = new Map<string, PairId>();
  for (const members of parseMickeyPairsGendered(pairsText)) {
    const pairId = members.map(m => slug(m.name)).sort().join('|');
    for (const m of members) map.set(slug(m.name), pairId);
  }
  for (const m of parseMickeyFreeGendered(freeAgentsText)) {
    const s = slug(m.name);
    map.set(s, s);
  }
  return map;
}

// Get the unique pair IDs present on a team (typically 2 for a full team of 4).
export function getPairIds(players: string[], pairMap: Map<string, PairId>): PairId[] {
  const seen = new Set<PairId>();
  const result: PairId[] = [];
  for (const p of players) {
    const id = pairMap.get(slug(p)) ?? slug(p);
    if (!seen.has(id)) { seen.add(id); result.push(id); }
  }
  return result;
}

// ── History ───────────────────────────────────────────────────────────────────

export type PairHistory = {
  // pairKey(pairId1, pairId2) → times they shared a team
  teammateCount: Map<string, number>;
  // pairKey(pairId1, pairId2) → times they faced each other
  opponentCount: Map<string, number>;
  // pairId → courtIdx → times played on that court
  courtCount: Map<PairId, Map<number, number>>;
  // pairId → times they sat out without a match
  sitOutCount: Map<PairId, number>;
};

export function buildPairHistory(rounds: RevcoBDRound[], pairMap: Map<string, PairId>): PairHistory {
  const teammateCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const courtCount = new Map<PairId, Map<number, number>>();
  const sitOutCount = new Map<PairId, number>();
  const bump = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1);

  for (const round of rounds) {
    const playingTeamIds = new Set(round.matches.flatMap(m => [m.teamAId, m.teamBId]));

    // Teammate tracking for ALL formed teams — being grouped with a pair
    // counts even if you don't play a match that round (sit-out together).
    for (const team of round.teams) {
      const pairIds = getPairIds(team.players, pairMap);
      for (let i = 0; i < pairIds.length; i++) {
        for (let j = i + 1; j < pairIds.length; j++) {
          bump(teammateCount, pairKey(pairIds[i], pairIds[j]));
        }
      }
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
        for (const pB of bPairIds) bump(opponentCount, pairKey(pA, pB));
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

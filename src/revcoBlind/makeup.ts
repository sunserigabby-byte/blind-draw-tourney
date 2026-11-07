// "Make-up" rounds for Revco Quads — e.g. a final round 6 that only counts
// for players who sat out earlier and are one game short.
//
// Everyone in a make-up round still plays, but the result only goes into
// the standings for players whose match count (across all regular rounds)
// is below the most anyone has played. That evens everyone out to the same
// number of counted games.

import type { RevcoBDRound } from '../types';
import { slug } from '../utils';

function playersInMatches(round: RevcoBDRound): string[] {
  const playing = new Set(round.matches.flatMap(m => [m.teamAId, m.teamBId]));
  return round.teams.filter(t => playing.has(t.id)).flatMap(t => t.players);
}

// For each make-up round id → the slugs of the players it counts for.
export function makeupEligibility(rounds: RevcoBDRound[]): Map<string, Set<string>> {
  const played = new Map<string, number>();
  for (const r of rounds) {
    if (r.makeup) continue;
    for (const p of playersInMatches(r)) played.set(slug(p), (played.get(slug(p)) ?? 0) + 1);
  }
  const target = Math.max(0, ...played.values());

  const out = new Map<string, Set<string>>();
  for (const r of rounds) {
    if (!r.makeup) continue;
    out.set(r.id, new Set(
      playersInMatches(r).map(slug).filter(s => (played.get(s) ?? 0) < target),
    ));
  }
  return out;
}

// Display names of who a make-up round counts for.
export function makeupCountsForNames(rounds: RevcoBDRound[], round: RevcoBDRound): string[] {
  const eligible = makeupEligibility(rounds).get(round.id) ?? new Set<string>();
  return playersInMatches(round).filter(p => eligible.has(slug(p)));
}

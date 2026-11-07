// Double-elimination bracket builder for Revco Quads playoffs.
//
// Layout:
//   Winners bracket ('W') — the normal single-elim bracket from buildBracket.
//   Losers bracket  ('L') — every team that loses once drops in here; a second
//                           loss knocks you out.
//   Finals          ('F') — Grand Final: winners-bracket champ vs losers-bracket
//                           champ. If the losers-bracket team wins, both teams
//                           have one loss, so a reset game ("if necessary") is played.
//
// Byes: when the team count isn't a power of 2, some Round 1 winners-bracket
// matches are byes and never produce a loser. Losers-bracket matches that
// would be missing a team are skipped, and their one live team is routed
// straight through to the next match.

import type { BracketMatch, PlayDiv, Team } from '../types';
import { buildBracket } from '../components/BracketView';

type Side = 'team1' | 'team2';

export const grandFinalId = (division: PlayDiv) => `${division}-F1-1`;
export const resetFinalId = (division: PlayDiv) => `${division}-F2-1`;

export function buildDoubleElimBracket(division: PlayDiv, teams: Team[]): BracketMatch[] {
  const winners = buildBracket(division, teams).map(m => ({ ...m, bracketSide: 'W' as const }));
  if (teams.length < 3) return winners;

  const wRounds = Math.max(...winners.map(m => m.round));
  const wRound = (r: number) => winners.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);

  const mk = (round: number, slot: number): BracketMatch => ({
    id: `${division}-L${round}-${slot}`, division, round, slot, bracketSide: 'L',
  });
  const feedWinner = (src: BracketMatch, dst: BracketMatch, side: Side) => {
    src.nextId = dst.id; src.nextSide = side;
    if (side === 'team1') dst.team1SourceId = src.id; else dst.team2SourceId = src.id;
  };
  const feedLoser = (src: BracketMatch, dst: BracketMatch, side: Side) => {
    src.loserNextId = dst.id; src.loserNextSide = side;
    if (side === 'team1') dst.team1SourceId = src.id; else dst.team2SourceId = src.id;
  };

  const losers: BracketMatch[] = [];

  // Losers Round 1: Round 1 losers play each other.
  const w1 = wRound(1);
  let prev: BracketMatch[] = [];
  for (let i = 0; i < w1.length / 2; i++) {
    const m = mk(1, i + 1);
    feedLoser(w1[2 * i], m, 'team1');
    feedLoser(w1[2 * i + 1], m, 'team2');
    prev.push(m);
  }
  losers.push(...prev);

  // Then alternate: a "drop-in" round (losers-bracket survivors vs teams that
  // just lost in the winners bracket), then a round where survivors play each other.
  let lr = 1;
  for (let wr = 2; wr <= wRounds; wr++) {
    lr++;
    // Reversed order so a team that just dropped doesn't immediately rematch
    // the team it already played.
    const drops = wRound(wr).reverse();
    const dropRound = prev.map((p, i) => {
      const m = mk(lr, i + 1);
      feedWinner(p, m, 'team1');
      feedLoser(drops[i], m, 'team2');
      return m;
    });
    losers.push(...dropRound);
    prev = dropRound;

    if (prev.length > 1) {
      lr++;
      const next: BracketMatch[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        const m = mk(lr, i / 2 + 1);
        feedWinner(prev[i], m, 'team1');
        feedWinner(prev[i + 1], m, 'team2');
        next.push(m);
      }
      losers.push(...next);
      prev = next;
    }
  }

  // Grand Final + reset. The reset has no feeders — the bracket view fills it
  // only if the losers-bracket team wins the Grand Final.
  const gf: BracketMatch = { id: grandFinalId(division), division, round: 1, slot: 1, bracketSide: 'F' };
  const reset: BracketMatch = { id: resetFinalId(division), division, round: 2, slot: 1, bracketSide: 'F' };
  feedWinner(wRound(wRounds)[0], gf, 'team1');
  feedWinner(prev[0], gf, 'team2');

  const all = [...winners, ...losers, gf, reset];
  skipByeLosersMatches(all, losers);
  return all;
}

// Remove losers-bracket matches that would be missing a team because of a
// Round 1 bye, routing the one live team directly to the following match.
function skipByeLosersMatches(all: BracketMatch[], losers: BracketMatch[]) {
  const byId = new Map(all.map(m => [m.id, m] as const));
  const deadOutput = new Set<string>(); // matches that will never send a team on
  const removed = new Set<string>();

  const isDead = (srcId: string | undefined, dstId: string) => {
    if (!srcId) return true;
    if (deadOutput.has(srcId)) return true;
    const src = byId.get(srcId);
    // A winners-bracket bye has no loser to drop down.
    return !!src && src.bracketSide === 'W' && src.loserNextId === dstId && src.score === 'BYE';
  };

  for (const m of [...losers].sort((a, b) => a.round - b.round || a.slot - b.slot)) {
    const dead1 = isDead(m.team1SourceId, m.id);
    const dead2 = isDead(m.team2SourceId, m.id);
    if (!dead1 && !dead2) continue;
    removed.add(m.id);
    if (dead1 && dead2) { deadOutput.add(m.id); continue; }

    // Point the live feeder straight at wherever this match would have sent its winner.
    const live = byId.get((dead1 ? m.team2SourceId : m.team1SourceId)!);
    const target = m.nextId ? byId.get(m.nextId) : undefined;
    if (!live || !target || !m.nextSide) continue;
    if (live.nextId === m.id) { live.nextId = target.id; live.nextSide = m.nextSide; }
    if (live.loserNextId === m.id) { live.loserNextId = target.id; live.loserNextSide = m.nextSide; }
    if (m.nextSide === 'team1') target.team1SourceId = live.id; else target.team2SourceId = live.id;
  }

  // Drop skipped matches, then renumber losers rounds/slots so labels have no gaps.
  for (let i = all.length - 1; i >= 0; i--) if (removed.has(all[i].id)) all.splice(i, 1);
  const kept = all.filter(m => m.bracketSide === 'L');
  const roundNums = [...new Set(kept.map(m => m.round))].sort((a, b) => a - b);
  for (const m of kept) m.round = roundNums.indexOf(m.round) + 1;
  for (const r of new Set(kept.map(m => m.round))) {
    kept.filter(m => m.round === r).sort((a, b) => a.slot - b.slot).forEach((m, i) => { m.slot = i + 1; });
  }
}

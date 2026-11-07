// Rules for the Revco Quads "rotating teams" playoff.
//
// Double elimination by PLAYER, with new teams every round:
//   • Each player has their own loss count; a 2nd loss means they're out.
//   • Each round, undefeated players are grouped together and one-loss
//     players are grouped together. Within a group, guys and girls are
//     ranked separately (pool-play + playoff record) and teams are made in
//     blocks: top 2 guys + top 2 girls = team 1, next 2 + 2 = team 2, etc.
//     To make sure teams really switch up, a player you've already been
//     teamed with in the playoffs is skipped for the next-best one.
//     Team 1 plays the last team, team 2 the second-to-last, and so on.
//   • Players who don't fit (uneven numbers) sit that round with no loss.
//     Whoever has sat the fewest times sits first, so it rotates.
//   • If neither group can field a match on its own, they're combined.
//   • Once 8 or fewer players are left, they play one final. The winning
//     team are the champions.

import type { RevcoRotPlayer, RevcoRotMatch, RevcoRotRound, RevcoRotPlayoff } from '../types';
import { parseScore } from '../utils';

const rid = () => Math.random().toString(36).slice(2, 10);

export type RotRecord = { W: number; L: number; PD: number; sat: number };

export function matchWinner(m: RevcoRotMatch): 'A' | 'B' | null {
  const p = parseScore(m.score);
  if (!p || p[0] === p[1]) return null;
  return p[0] > p[1] ? 'A' : 'B';
}

export const roundComplete = (r: RevcoRotRound) => r.matches.every(m => matchWinner(m) !== null);

export function playerRecords(po: RevcoRotPlayoff): Map<string, RotRecord> {
  const rec = new Map<string, RotRecord>(po.players.map(p => [p.name, { W: 0, L: 0, PD: 0, sat: 0 }]));
  for (const r of po.rounds) {
    for (const name of r.sitting) { const x = rec.get(name); if (x) x.sat++; }
    for (const m of r.matches) {
      const w = matchWinner(m);
      const p = parseScore(m.score);
      if (!w || !p) continue;
      const diff = Math.abs(p[0] - p[1]);
      const [winners, losers] = w === 'A' ? [m.teamA, m.teamB] : [m.teamB, m.teamA];
      for (const n of winners) { const x = rec.get(n); if (x) { x.W++; x.PD += diff; } }
      for (const n of losers) { const x = rec.get(n); if (x) { x.L++; x.PD -= diff; } }
    }
  }
  return rec;
}

// Winning team of the final, once it's been scored.
export function champions(po: RevcoRotPlayoff): string[] | null {
  const last = po.rounds[po.rounds.length - 1];
  const final = last?.matches.find(m => m.group === 'F');
  if (!final) return null;
  const w = matchWinner(final);
  return w ? (w === 'A' ? final.teamA : final.teamB) : null;
}

export const isFinished = (po: RevcoRotPlayoff) => champions(po) !== null;

// Best first: combined pool + playoff wins, then point differential.
function ranker(po: RevcoRotPlayoff, rec: Map<string, RotRecord>) {
  const byName = new Map(po.players.map(p => [p.name, p]));
  const key = (n: string) => {
    const p = byName.get(n)!; const r = rec.get(n)!;
    return { w: p.poolW + r.W, pd: p.poolPD + r.PD };
  };
  return (list: string[]) => [...list].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return kb.w - ka.w || kb.pd - ka.pd || a.localeCompare(b);
  });
}

// From a ranked list, choose `count` players to sit: fewest sit-outs so
// far first, then the lowest-ranked. Returns [playing (still ranked), sitting].
function chooseSitters(ranked: string[], count: number, rec: Map<string, RotRecord>): [string[], string[]] {
  if (count <= 0) return [ranked, []];
  const order = ranked
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rec.get(a.n)!.sat - rec.get(b.n)!.sat || b.i - a.i);
  const sit = new Set(order.slice(0, count).map(x => x.n));
  return [ranked.filter(n => !sit.has(n)), ranked.filter(n => sit.has(n))];
}

// How many playoff rounds each two players have been teammates.
function teammateCounts(po: RevcoRotPlayoff): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of po.rounds) for (const m of r.matches) for (const team of [m.teamA, m.teamB]) {
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) {
      const k = [team[i], team[j]].sort().join('|');
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}

// Fill team slots in rank order. The top remaining player starts each team;
// each next spot goes to the best-ranked player who has been teammates with
// the people already on the team the fewest times.
function buildTeams(
  guys: string[],
  girls: string[],
  slots: { guys: number; girls: number }[],
  po: RevcoRotPlayoff,
): string[][] {
  const together = teammateCounts(po);
  const repeats = (n: string, team: string[]) =>
    team.reduce((c, m) => c + (together.get([n, m].sort().join('|')) ?? 0), 0);
  const g = [...guys], f = [...girls];
  const take = (pool: string[], team: string[]) => {
    let best = 0, bestCost = Infinity;
    pool.forEach((n, i) => { const c = repeats(n, team) * 1000 + i; if (c < bestCost) { bestCost = c; best = i; } });
    return pool.splice(best, 1)[0];
  };
  return slots.map(slot => {
    const team: string[] = [];
    for (let i = 0; i < slot.guys && g.length; i++) team.push(take(g, team));
    for (let i = 0; i < slot.girls && f.length; i++) team.push(take(f, team));
    return team;
  });
}

function pairTeams(teams: string[][], group: RevcoRotMatch['group']): RevcoRotMatch[] {
  const out: RevcoRotMatch[] = [];
  for (let i = 0; i < teams.length / 2; i++) {
    out.push({ id: rid(), group, teamA: teams[i], teamB: teams[teams.length - 1 - i] });
  }
  return out;
}

// Make as many 2 guys + 2 girls teams as possible (an even number, so every
// team has an opponent). `gendered: false` is a last resort that ignores gender.
function formGroup(
  players: string[],
  group: RevcoRotMatch['group'],
  po: RevcoRotPlayoff,
  rec: Map<string, RotRecord>,
  gendered = true,
): { matches: RevcoRotMatch[]; sitting: string[] } {
  const rank = ranker(po, rec);
  const genderOf = new Map(po.players.map(p => [p.name, p.gender]));

  if (!gendered) {
    const all = rank(players);
    let t = Math.floor(all.length / 4); t -= t % 2;
    if (t < 2) return { matches: [], sitting: players };
    const [play, sit] = chooseSitters(all, all.length - t * 4, rec);
    const teams = buildTeams(play, [], Array.from({ length: t }, () => ({ guys: 4, girls: 0 })), po);
    return { matches: pairTeams(teams, group), sitting: sit };
  }

  // Players without an (M)/(F) marker fill in on whichever side is shorter.
  const guys: string[] = [], girls: string[] = [];
  for (const n of rank(players)) {
    const g = genderOf.get(n);
    if (g === 'M') guys.push(n);
    else if (g === 'F') girls.push(n);
  }
  for (const n of rank(players).filter(n => !genderOf.get(n))) (guys.length <= girls.length ? guys : girls).push(n);

  let t = Math.min(Math.floor(guys.length / 2), Math.floor(girls.length / 2));
  t -= t % 2;
  if (t < 2) return { matches: [], sitting: players };
  const [guysIn, guysOut] = chooseSitters(rank(guys), guys.length - t * 2, rec);
  const [girlsIn, girlsOut] = chooseSitters(rank(girls), girls.length - t * 2, rec);
  const teams = buildTeams(guysIn, girlsIn, Array.from({ length: t }, () => ({ guys: 2, girls: 2 })), po);
  return { matches: pairTeams(teams, group), sitting: [...guysOut, ...girlsOut] };
}

function formFinal(alive: string[], po: RevcoRotPlayoff, rec: Map<string, RotRecord>): RevcoRotMatch {
  const rank = ranker(po, rec);
  const genderOf = new Map(po.players.map(p => [p.name, p.gender]));
  const guys = rank(alive.filter(n => genderOf.get(n) !== 'F'));
  const girls = rank(alive.filter(n => genderOf.get(n) === 'F'));
  // Same blocks idea: top half of the guys + top half of the girls vs the rest.
  const gA = Math.ceil(guys.length / 2);
  const fA = guys.length % 2 === 1 ? Math.floor(girls.length / 2) : Math.ceil(girls.length / 2);
  const [teamA, teamB] = buildTeams(guys, girls, [
    { guys: gA, girls: fA },
    { guys: guys.length - gA, girls: girls.length - fA },
  ], po);
  return { id: rid(), group: 'F', teamA, teamB };
}

// The next round to play, or null if the playoff is over / can't continue.
// Only call once the previous round is fully scored.
export function nextRound(po: RevcoRotPlayoff): RevcoRotRound | null {
  if (isFinished(po)) return null;
  const rec = playerRecords(po);
  const alive = po.players.map(p => p.name).filter(n => rec.get(n)!.L < 2);
  const number = po.rounds.length + 1;
  if (alive.length < 2) return null;

  if (alive.length <= 8) {
    return { id: rid(), number, matches: [formFinal(alive, po, rec)], sitting: [] };
  }

  const zero = alive.filter(n => rec.get(n)!.L === 0);
  const one = alive.filter(n => rec.get(n)!.L === 1);
  const a = formGroup(zero, 'W', po, rec);
  const b = formGroup(one, 'L', po, rec);
  if (a.matches.length + b.matches.length > 0) {
    return { id: rid(), number, matches: [...a.matches, ...b.matches], sitting: [...a.sitting, ...b.sitting] };
  }
  // Neither group could make a match alone — play everyone together.
  let mixed = formGroup(alive, 'MIX', po, rec);
  if (mixed.matches.length === 0) mixed = formGroup(alive, 'MIX', po, rec, false);
  return { id: rid(), number, matches: mixed.matches, sitting: mixed.sitting };
}

export function startPlayoff(players: RevcoRotPlayer[]): RevcoRotPlayoff {
  const po: RevcoRotPlayoff = { players, rounds: [] };
  const first = nextRound(po);
  return first ? { ...po, rounds: [first] } : po;
}

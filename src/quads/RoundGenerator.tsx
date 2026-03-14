import React, { useMemo, useState } from 'react';
import type { QuadsMatchRow } from '../types';
import { slug, uniq, clampN, shuffle } from '../utils';

// ─── History helpers ─────────────────────────────────────────────────────────

type SgEntry = { count: number; lastRound: number };

/** Per-player UR / PP round counts (one entry per round they were on a UR/PP team) */
function buildQSgMap(matches: QuadsMatchRow[]): Map<string, SgEntry> {
  const map = new Map<string, SgEntry>();
  for (const m of matches) {
    const proc = (team: string[], tag?: string | null) => {
      if (tag !== 'ULTIMATE_REVCO' && tag !== 'POWER_PUFF') return;
      for (const p of team) {
        const k = slug(p);
        const cur = map.get(k) ?? { count: 0, lastRound: 0 };
        map.set(k, { count: cur.count + 1, lastRound: Math.max(cur.lastRound, m.round) });
      }
    };
    proc(m.t1, m.tag1);
    proc(m.t2, m.tag2);
  }
  return map;
}

function buildQRoleStats(matches: QuadsMatchRow[]) {
  const sgCount = new Map<string, number>();
  const lastSgRound = new Map<string, number>();
  const sgStreak = new Map<string, number>();
  const rounds = uniq(matches.map(m => m.round)).sort((a, b) => a - b);

  for (const round of rounds) {
    const sgThisRound = new Set<string>();
    for (const m of matches.filter(m => m.round === round)) {
      const proc = (team: string[], tag?: string | null) => {
        if (tag !== 'ULTIMATE_REVCO' && tag !== 'POWER_PUFF') return;
        for (const p of team) sgThisRound.add(slug(p));
      };
      proc(m.t1, m.tag1);
      proc(m.t2, m.tag2);
    }
    for (const key of sgThisRound) {
      sgCount.set(key, (sgCount.get(key) || 0) + 1);
      const prev = lastSgRound.get(key);
      sgStreak.set(key, prev === round - 1 ? (sgStreak.get(key) || 1) + 1 : 1);
      lastSgRound.set(key, round);
    }
  }

  return { sgCount, lastSgRound, sgStreak };
}

function qSgPenalty(
  player: string,
  roleStats: ReturnType<typeof buildQRoleStats>,
  roundIdx: number
): number {
  const k = slug(player);
  const count = roleStats.sgCount.get(k) || 0;
  const lastRound = roleStats.lastSgRound.get(k);
  const streak = roleStats.sgStreak.get(k) || 0;
  let penalty = count * 1_000;
  if (lastRound === roundIdx - 1) penalty += 1_000_000;
  penalty += streak * 15_000;
  return penalty;
}

function buildQUsageStats(matches: QuadsMatchRow[]) {
  const playCounts = new Map<string, number>();
  const sitCounts = new Map<string, number>();
  const lastSitRound = new Map<string, number>();

  for (const m of matches) {
    for (const p of [...m.t1, ...m.t2]) {
      const k = slug(p);
      playCounts.set(k, (playCounts.get(k) || 0) + 1);
    }
  }

  const processedRounds = new Set<number>();
  for (const m of matches) {
    if (processedRounds.has(m.round)) continue;
    processedRounds.add(m.round);
    for (const p of m.sitOuts || []) {
      const k = slug(p);
      sitCounts.set(k, (sitCounts.get(k) || 0) + 1);
      lastSitRound.set(k, m.round);
    }
  }

  return { playCounts, sitCounts, lastSitRound };
}

function qSitScore(
  player: string,
  stats: ReturnType<typeof buildQUsageStats>,
  roundIdx: number
): number {
  const k = slug(player);
  const plays = stats.playCounts.get(k) || 0;
  const sits = stats.sitCounts.get(k) || 0;
  const lastSit = stats.lastSitRound.get(k);
  let score = plays * 100 - sits * 250;
  if (lastSit === roundIdx - 1) score -= 100_000;
  else if (lastSit === roundIdx - 2) score -= 5_000;
  return score;
}

function buildQOpponentMap(matches: QuadsMatchRow[]): Map<string, Set<string>> {
  const mp = new Map<string, Set<string>>();
  for (const m of matches) {
    for (const a of m.t1) {
      for (const b of m.t2) {
        const A = slug(a), B = slug(b);
        if (!mp.has(A)) mp.set(A, new Set());
        if (!mp.has(B)) mp.set(B, new Set());
        mp.get(A)!.add(B);
        mp.get(B)!.add(A);
      }
    }
  }
  return mp;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QuadsRoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}: {
  guysText: string;
  girlsText: string;
  matches: QuadsMatchRow[];
  setMatches: (f: (prev: QuadsMatchRow[]) => QuadsMatchRow[]) => void;
}) {
  const [strict, setStrict] = useState(true);
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);
  const [seedStr, setSeedStr] = useState('');

  const guys = useMemo(
    () => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [guysText],
  );
  const girls = useMemo(
    () => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [girlsText],
  );

  // Per-player UR/PP history for display
  const sgStats = useMemo(() => {
    const sgMap = buildQSgMap(matches);
    const currentRound = matches.reduce((mx, m) => Math.max(mx, m.round), 0);
    const toRow = (name: string) => {
      const e = sgMap.get(slug(name)) ?? { count: 0, lastRound: 0 };
      return { name, count: e.count, lastRound: e.lastRound, isLast: e.lastRound === currentRound };
    };
    const guysRows = guys.map(toRow).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const girlsRows = girls.map(toRow).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { guysRows, girlsRows, hasAny: [...sgMap.values()].some(e => e.count > 0) };
  }, [matches, guys, girls]);

  type TeamBuild = {
    members: string[];
    tag: QuadsMatchRow['tag1'];
    isTriple: boolean;
    girlCount: number;
  };

  function buildRound(roundIdx: number, history: QuadsMatchRow[]): QuadsMatchRow[] {
    const seedNum = seedStr ? Number(seedStr) : undefined;
    const usageStats = buildQUsageStats(history);
    const roleStats = buildQRoleStats(history);
    const opponentMap = buildQOpponentMap(history);
    const sitOuts: string[] = [];

    // Shuffle first, then sort by urgency (shuffle breaks ties randomly)
    let activeGuys = shuffle(guys, seedNum);
    let activeGirls = shuffle(girls, seedNum ? seedNum + 17 : undefined);

    const girlsSet = new Set(girls.map(slug));

    // Determine sit-outs: find fewest sit-outs so remaining players fit into 4s and 3s
    const total = activeGuys.length + activeGirls.length;
    let numToSit = 0;
    for (let s = 0; s <= 3; s++) {
      const rem = (total - s) % 4;
      if (rem === 0 || rem === 3) { numToSit = s; break; }
    }

    if (numToSit > 0) {
      const allPlayers = [
        ...activeGuys.map(p => ({ p, isGuy: true })),
        ...activeGirls.map(p => ({ p, isGuy: false })),
      ];
      // Sort: highest sit-score = most deserving to sit out
      allPlayers.sort((a, b) => qSitScore(b.p, usageStats, roundIdx) - qSitScore(a.p, usageStats, roundIdx));
      for (let i = 0; i < numToSit; i++) {
        const { p, isGuy } = allPlayers[i];
        sitOuts.push(p);
        if (isGuy) activeGuys = activeGuys.filter(g => g !== p);
        else activeGirls = activeGirls.filter(g => g !== p);
      }
    }

    // Sort by urgency: highest SG penalty first → gets placed into balanced teams first
    const sortByUrgency = (players: string[]) =>
      [...players].sort((a, b) => qSgPenalty(b, roleStats, roundIdx) - qSgPenalty(a, roleStats, roundIdx));

    const G = sortByUrgency(activeGuys);
    const H = sortByUrgency(activeGirls);
    const totalActive = G.length + H.length;

    // Find how many 4-player quads to form (remainder 0, 3, or 6 forms triples)
    let quadsToMake = 0;
    for (let q = Math.floor(totalActive / 4); q >= 0; q--) {
      const leftover = totalActive - 4 * q;
      if (leftover === 0 || leftover === 3 || leftover === 6) {
        quadsToMake = q;
        break;
      }
    }

    // Of those quads, how many can be balanced 2G+2G?
    const numBalanced = Math.min(Math.floor(G.length / 2), Math.floor(H.length / 2), quadsToMake);
    const remainingQuads = quadsToMake - numBalanced;

    const teams: TeamBuild[] = [];
    let gUsed = 0, hUsed = 0;

    // Form balanced 2G+2G teams (most-urgent players first)
    for (let i = 0; i < numBalanced; i++) {
      teams.push({
        members: [G[gUsed], G[gUsed + 1], H[hUsed], H[hUsed + 1]],
        tag: null,
        isTriple: false,
        girlCount: 2,
      });
      gUsed += 2;
      hUsed += 2;
    }

    // Form remaining quads from leftover players (best effort: girls distributed first)
    const leftoverG = G.slice(gUsed);
    const leftoverH = H.slice(hUsed);
    // Sort girls first so they distribute across unbalanced teams (at-least-1-girl)
    const remaining = [...leftoverH, ...leftoverG];
    let ri = 0;

    for (let i = 0; i < remainingQuads && ri + 3 < remaining.length; i++) {
      const teamMembers = remaining.slice(ri, ri + 4);
      ri += 4;
      const gc = teamMembers.filter(p => girlsSet.has(slug(p))).length;
      let tag: TeamBuild['tag'] = null;
      if (gc === 0) tag = 'ULTIMATE_REVCO';
      else if (gc === 4) tag = 'POWER_PUFF';
      teams.push({ members: teamMembers, tag, isTriple: false, girlCount: gc });
    }

    // Form triple teams from remainder (0, 3, or 6 players left)
    while (ri + 2 < remaining.length) {
      const teamMembers = remaining.slice(ri, ri + 3);
      ri += 3;
      const gc = teamMembers.filter(p => girlsSet.has(slug(p))).length;
      let tag: TeamBuild['tag'] = null;
      if (gc === 0) tag = 'ULTIMATE_REVCO';
      else if (gc === 3) tag = 'POWER_PUFF';
      teams.push({ members: teamMembers, tag, isTriple: true, girlCount: gc });
    }

    // Any leftover 1-2 players sit out
    for (let j = ri; j < remaining.length; j++) sitOuts.push(remaining[j]);

    // ── Back-to-back rescue ───────────────────────────────────────────────────
    // If a player on a UR/PP team had UR/PP last round, swap them with someone
    // from a balanced team who can absorb the swap without creating a new back-to-back.
    const hadSgLastRound = (p: string) =>
      roleStats.lastSgRound.get(slug(p)) === roundIdx - 1;

    for (let ti = 0; ti < teams.length; ti++) {
      const t = teams[ti];
      if (!t.tag) continue; // balanced or mixed, skip

      const urgentPlayers = t.members.filter(hadSgLastRound);
      if (urgentPlayers.length === 0) continue;

      // Find a balanced team to swap with
      for (let bi = 0; bi < teams.length; bi++) {
        if (bi === ti || teams[bi].tag) continue;
        const balTeam = teams[bi];

        for (const urgent of urgentPlayers) {
          const urgentIsGirl = girlsSet.has(slug(urgent));
          // Prefer same-gender swap to maintain team composition
          const swapCandidates = balTeam.members
            .filter(p => {
              if (hadSgLastRound(p)) return false;
              const pIsGirl = girlsSet.has(slug(p));
              if (pIsGirl !== urgentIsGirl) return false;
              // Ensure swap doesn't leave balanced team with 0 girls
              const newBalGirls = balTeam.members.filter(m => m !== p && girlsSet.has(slug(m))).length
                + (urgentIsGirl ? 1 : 0);
              return newBalGirls >= 1;
            })
            .sort((a, b) => (roleStats.sgCount.get(slug(a)) || 0) - (roleStats.sgCount.get(slug(b)) || 0));

          if (swapCandidates.length > 0) {
            const fresh = swapCandidates[0];
            // Perform swap
            const newTMembers = t.members.map(m => m === urgent ? fresh : m);
            const newBMembers = balTeam.members.map(m => m === fresh ? urgent : m);
            const newTGirls = newTMembers.filter(p => girlsSet.has(slug(p))).length;
            const newBGirls = newBMembers.filter(p => girlsSet.has(slug(p))).length;

            // Re-compute tag for the UR/PP team after swap
            let newTag: TeamBuild['tag'] = null;
            if (newTGirls === 0) newTag = 'ULTIMATE_REVCO';
            else if (newTGirls === newTMembers.length) newTag = 'POWER_PUFF';

            teams[ti] = { ...t, members: newTMembers, tag: newTag, girlCount: newTGirls };
            teams[bi] = { ...balTeam, members: newBMembers, tag: null, girlCount: newBGirls };
            break;
          }
        }
        if (!teams[ti].tag) break; // rescued
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Handle odd team count: team with highest sit-priority sits out
    if (teams.length % 2 === 1) {
      let maxScore = Number.NEGATIVE_INFINITY;
      let sitIdx = 0;
      for (let i = 0; i < teams.length; i++) {
        const score = teams[i].members.reduce((s, p) => s + qSitScore(p, usageStats, roundIdx), 0);
        if (score > maxScore) { maxScore = score; sitIdx = i; }
      }
      const byeTeam = teams.splice(sitIdx, 1)[0];
      sitOuts.push(...byeTeam.members);
    }

    // Pair teams as opponents (minimize repeat opponents)
    const teamList = shuffle(teams, seedNum ? seedNum + roundIdx * 101 : undefined);
    const made: QuadsMatchRow[] = [];

    while (teamList.length >= 2) {
      const a = teamList.shift()!;
      let bestIdx = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < teamList.length; i++) {
        const b = teamList[i];
        let penalty = 0;
        if (strict) {
          for (const pa of a.members) {
            for (const pb of b.members) {
              if (opponentMap.get(slug(pa))?.has(slug(pb))) penalty += 100;
            }
          }
        }
        if (penalty < bestScore) {
          bestScore = penalty;
          bestIdx = i;
          if (penalty === 0) break;
        }
      }

      const b = teamList.splice(bestIdx, 1)[0];

      // Update opponent map
      for (const pa of a.members) {
        for (const pb of b.members) {
          const A = slug(pa), B = slug(pb);
          if (!opponentMap.has(A)) opponentMap.set(A, new Set());
          if (!opponentMap.has(B)) opponentMap.set(B, new Set());
          opponentMap.get(A)!.add(B);
          opponentMap.get(B)!.add(A);
        }
      }

      made.push({
        id: `${roundIdx}-pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        round: roundIdx,
        court: 0,
        t1: a.members,
        t2: b.members,
        isTriple1: a.isTriple,
        isTriple2: b.isTriple,
        t1GirlCount: a.girlCount,
        t2GirlCount: b.girlCount,
        tag1: a.tag,
        tag2: b.tag,
        scoreText: '',
      });
    }

    // Assign courts sequentially
    made.forEach((m, i) => {
      m.id = `${roundIdx}-${startCourt + i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      m.court = startCourt + i;
    });
    made.sort((a, b) => a.court - b.court);

    if (made.length > 0 && sitOuts.length > 0) {
      made[0] = { ...made[0], sitOuts: uniq(sitOuts) };
    }

    return made;
  }

  function onGenerate() {
    const n = clampN(roundsToGen, 1);
    const out: QuadsMatchRow[] = [];
    let history = matches.slice();
    const currentMax = history.reduce((mx, m) => Math.max(mx, m.round), 0);
    for (let i = 1; i <= n; i++) {
      const roundIdx = currentMax + i;
      const one = buildRound(roundIdx, history);
      out.push(...one);
      history = history.concat(one);
    }
    setMatches(prev => (Array.isArray(prev) ? prev : []).concat(out));
  }

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Quads)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={strict}
              onChange={e => setStrict(e.target.checked)}
            />
            Minimize repeat opponents
          </label>
          <label className="flex items-center gap-1">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={e => setRoundsToGen(clampN(+e.target.value || 1, 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={e => setStartCourt(clampN(+e.target.value || 1, 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            Seed
            <input
              type="text"
              value={seedStr}
              onChange={e => setSeedStr(e.target.value)}
              placeholder="optional"
              className="w-24 border rounded px-2 py-1"
            />
          </label>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]"
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-2">
        Ideal teams are 2 guys + 2 girls. Players with more UR/PP history are prioritized for balanced teams.
        Back-to-back same-gender rounds are strongly avoided. Sit-outs rotate fairly. When gender ratios
        force unbalanced teams, the generator ensures at least 1 girl per team where possible.
      </p>

      {sgStats.hasAny && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="text-[12px] font-semibold text-slate-700 mb-2">
            Same-Gender History (Ultimate Revco / Power Puff)
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="font-medium text-blue-700 mb-1">Guys – Ultimate Revco</div>
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-0.5 pr-3">Player</th>
                    <th className="py-0.5 pr-3 text-right">UR Rounds</th>
                    <th className="py-0.5">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {sgStats.guysRows.map(r => (
                    <tr key={r.name} className={`border-t border-slate-100 ${r.isLast ? 'bg-blue-50' : ''}`}>
                      <td className="py-0.5 pr-3">{r.name}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums font-medium">
                        {r.count > 0
                          ? <span className={r.count >= 3 ? 'text-red-600' : r.count >= 2 ? 'text-amber-600' : 'text-slate-700'}>{r.count}</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="py-0.5 text-slate-500">
                        {r.count > 0 ? `R${r.lastRound}${r.isLast ? ' ★' : ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="font-medium text-pink-700 mb-1">Girls – Power Puff</div>
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-0.5 pr-3">Player</th>
                    <th className="py-0.5 pr-3 text-right">PP Rounds</th>
                    <th className="py-0.5">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {sgStats.girlsRows.map(r => (
                    <tr key={r.name} className={`border-t border-slate-100 ${r.isLast ? 'bg-pink-50' : ''}`}>
                      <td className="py-0.5 pr-3">{r.name}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums font-medium">
                        {r.count > 0
                          ? <span className={r.count >= 3 ? 'text-red-600' : r.count >= 2 ? 'text-amber-600' : 'text-slate-700'}>{r.count}</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="py-0.5 text-slate-500">
                        {r.count > 0 ? `R${r.lastRound}${r.isLast ? ' ★' : ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            ★ = played same-gender most recent round. Red = 3+ rounds; amber = 2 rounds.
            Players with higher counts are prioritized for balanced 2G+2G teams in future rounds.
          </p>
        </div>
      )}
    </section>
  );
}

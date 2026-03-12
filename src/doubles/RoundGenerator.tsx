import React, { useMemo, useState } from 'react';
import type { MatchRow } from '../types';
import { slug, uniq, clampN, shuffle } from '../utils';

// ─── Same-gender history helpers (used for display + scheduling) ──────────────

type SgEntry = { count: number; lastRound: number };

function buildSgMap(matches: MatchRow[]): Map<string, SgEntry> {
  const map = new Map<string, SgEntry>();
  for (const m of matches) {
    if (!m.tag) continue;
    for (const p of [m.t1p1, m.t1p2, m.t2p1, m.t2p2]) {
      if (!p) continue;
      const key = slug(p);
      const cur = map.get(key) ?? { count: 0, lastRound: 0 };
      map.set(key, { count: cur.count + 1, lastRound: Math.max(cur.lastRound, m.round) });
    }
  }
  return map;
}

export function RoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}: {
  guysText: string;
  girlsText: string;
  matches: MatchRow[];
  setMatches: (f: (prev: MatchRow[]) => MatchRow[] | MatchRow[]) => void;
}) {
  const [strict, setStrict] = useState(true);
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);
  const [seedStr, setSeedStr] = useState("");

  const guys = useMemo(
    () => uniq((guysText || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [guysText]
  );
  const girls = useMemo(
    () => uniq((girlsText || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [girlsText]
  );

  // Per-player same-gender counts for display (Ultimate Revco / Power Puff)
  const sgStats = useMemo(() => {
    const sgMap = buildSgMap(matches);
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
    team: [string, string];
    tag: MatchRow["tag"];
  };

  const addPairToMap = (mp: Map<string, Set<string>>, a?: string, b?: string) => {
    if (!a || !b) return;
    const A = slug(a);
    const B = slug(b);
    if (!mp.has(A)) mp.set(A, new Set());
    if (!mp.has(B)) mp.set(B, new Set());
    mp.get(A)!.add(B);
    mp.get(B)!.add(A);
  };

  const buildPartnerMap = (history: MatchRow[]) => {
    const mp = new Map<string, Set<string>>();
    for (const m of history) {
      addPairToMap(mp, m.t1p1, m.t1p2);
      addPairToMap(mp, m.t2p1, m.t2p2);
    }
    return mp;
  };

  const buildOpponentMap = (history: MatchRow[]) => {
    const mp = new Map<string, Set<string>>();

    const addOpp = (a?: string, b?: string) => {
      if (!a || !b) return;
      const A = slug(a);
      const B = slug(b);
      if (!mp.has(A)) mp.set(A, new Set());
      mp.get(A)!.add(B);
    };

    for (const m of history) {
      const t1 = [m.t1p1, m.t1p2];
      const t2 = [m.t2p1, m.t2p2];

      for (const a of t1) for (const b of t2) addOpp(a, b);
      for (const a of t2) for (const b of t1) addOpp(a, b);
    }

    return mp;
  };

  const buildCourtMap = (history: MatchRow[]) => {
    const mp = new Map<string, Map<number, number>>();

    const addCourt = (player?: string, court?: number) => {
      if (!player || !court) return;
      const key = slug(player);
      if (!mp.has(key)) mp.set(key, new Map());
      const inner = mp.get(key)!;
      inner.set(court, (inner.get(court) || 0) + 1);
    };

    for (const m of history) {
      addCourt(m.t1p1, m.court);
      addCourt(m.t1p2, m.court);
      addCourt(m.t2p1, m.court);
      addCourt(m.t2p2, m.court);
    }

    return mp;
  };

  const hasPartneredBefore = (partnerMap: Map<string, Set<string>>, a: string, b: string) =>
    !!partnerMap.get(slug(a))?.has(slug(b));

  const hasOpposedBefore = (opponentMap: Map<string, Set<string>>, a: string, b: string) =>
    !!opponentMap.get(slug(a))?.has(slug(b));

  function scoreCandidateTeam(
    partnerMap: Map<string, Set<string>>,
    a: string,
    b: string
  ) {
    let penalty = 0;
    if (strict && hasPartneredBefore(partnerMap, a, b)) penalty += 1000;
    return penalty;
  }

  function scoreMatchup(
    opponentMap: Map<string, Set<string>>,
    teamA: [string, string],
    teamB: [string, string],
    tagA: MatchRow["tag"],
    tagB: MatchRow["tag"]
  ) {
    const pairs: [string, string][] = [
      [teamA[0], teamB[0]],
      [teamA[0], teamB[1]],
      [teamA[1], teamB[0]],
      [teamA[1], teamB[1]],
    ];

    let penalty = 0;

    const typeA = tagA ?? "REVCO";
    const typeB = tagB ?? "REVCO";

    if (typeA === "REVCO" && typeB === "REVCO") {
      penalty += 0;
    } else if (typeA === typeB) {
      penalty += 100;
    } else {
      penalty += 500;
    }

    for (const [a, b] of pairs) {
      if (strict && hasOpposedBefore(opponentMap, a, b)) penalty += 100;
    }

    return penalty;
  }

  function scoreCourtForPlayers(
    courtMap: Map<string, Map<number, number>>,
    players: string[],
    court: number
  ) {
    let penalty = 0;
    for (const p of players) {
      const perCourt = courtMap.get(slug(p));
      const count = perCourt?.get(court) || 0;
      penalty += count * 25;
    }
    return penalty;
  }

  function noteCourtForPlayers(
    courtMap: Map<string, Map<number, number>>,
    players: string[],
    court: number
  ) {
    for (const p of players) {
      const key = slug(p);
      if (!courtMap.has(key)) courtMap.set(key, new Map());
      const inner = courtMap.get(key)!;
      inner.set(court, (inner.get(court) || 0) + 1);
    }
  }

  function makeMixedTeams(
    guysPool: string[],
    girlsPool: string[],
    partnerMap: Map<string, Set<string>>
  ) {
    const mixed: TeamBuild[] = [];
    const remainingGirls = [...girlsPool];

    for (const guy of guysPool) {
      if (!remainingGirls.length) break;

      let bestIdx = -1;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < remainingGirls.length; i++) {
        const girl = remainingGirls[i];
        const score = scoreCandidateTeam(partnerMap, guy, girl);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
          if (score === 0) break;
        }
      }

      if (bestIdx >= 0) {
        const girl = remainingGirls.splice(bestIdx, 1)[0];
        mixed.push({
          team: [guy, girl],
          tag: null,
        });
        addPairToMap(partnerMap, guy, girl);
      }
    }

    return {
      mixed,
      leftoverGirls: remainingGirls,
    };
  }

  function buildRoleStats(history: MatchRow[]) {
    const sameGenderCount = new Map<string, number>();
    const lastSameGenderRound = new Map<string, number>();
    const sameGenderStreak = new Map<string, number>();

    const rounds = uniq(history.map(m => m.round)).sort((a, b) => a - b);

    for (const round of rounds) {
      const roundMatches = history.filter(m => m.round === round);

      const sameGenderPlayersThisRound = new Set<string>();

      for (const m of roundMatches) {
        const isSameGenderTag =
          m.tag === "ULTIMATE_REVCO" || m.tag === "POWER_PUFF";

        if (!isSameGenderTag) continue;

        [m.t1p1, m.t1p2, m.t2p1, m.t2p2].forEach((p) => {
          if (!p) return;
          sameGenderPlayersThisRound.add(slug(p));
        });
      }

      for (const key of sameGenderPlayersThisRound) {
        sameGenderCount.set(key, (sameGenderCount.get(key) || 0) + 1);

        const prevRound = lastSameGenderRound.get(key);
        if (prevRound === round - 1) {
          sameGenderStreak.set(key, (sameGenderStreak.get(key) || 1) + 1);
        } else {
          sameGenderStreak.set(key, 1);
        }

        lastSameGenderRound.set(key, round);
      }
    }

    return {
      sameGenderCount,
      lastSameGenderRound,
      sameGenderStreak,
    };
  }

  function sameGenderPenalty(
    player: string,
    roleStats: ReturnType<typeof buildRoleStats>,
    roundIdx: number
  ) {
    const key = slug(player);
    const count = roleStats.sameGenderCount.get(key) || 0;
    const lastRound = roleStats.lastSameGenderRound.get(key);
    const streak = roleStats.sameGenderStreak.get(key) || 0;

    let penalty = 0;

    // Fairness: spread same-gender assignments evenly across players
    penalty += count * 1_000;

    // Back-to-back: essentially forbidden unless mathematically unavoidable
    if (lastRound === roundIdx - 1) penalty += 1_000_000;

    // Streak: escalating cost for multi-round streaks
    penalty += streak * 15_000;

    return penalty;
  }

  function preferMixedAssignment(
    players: string[],
    roleStats: ReturnType<typeof buildRoleStats>,
    roundIdx: number
  ) {
    return [...players].sort((a, b) => {
      const penaltyA = sameGenderPenalty(a, roleStats, roundIdx);
      const penaltyB = sameGenderPenalty(b, roleStats, roundIdx);

      if (penaltyB !== penaltyA) return penaltyB - penaltyA;

      return a.localeCompare(b);
    });
  }

  function makeSameGenderTeams(
    players: string[],
    tag: MatchRow["tag"],
    partnerMap: Map<string, Set<string>>,
    roleStats: ReturnType<typeof buildRoleStats>,
    roundIdx: number
  ) {
    const out: TeamBuild[] = [];
    const pool = [...players];

    while (pool.length >= 2) {
      let bestPair: [number, number] | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const a = pool[i];
          const b = pool[j];

          const partnerPenalty = scoreCandidateTeam(partnerMap, a, b);
          const rolePenalty =
            sameGenderPenalty(a, roleStats, roundIdx) +
            sameGenderPenalty(b, roleStats, roundIdx);

          const totalScore = partnerPenalty + rolePenalty;

          if (totalScore < bestScore) {
            bestScore = totalScore;
            bestPair = [i, j];
          }
        }
      }

      if (!bestPair) break;

      const [i, j] = bestPair;
      const a = pool[i];
      const b = pool[j];

      const nextPool = pool.filter((_, idx) => idx !== i && idx !== j);
      pool.length = 0;
      pool.push(...nextPool);

      out.push({
        team: [a, b],
        tag,
      });

      addPairToMap(partnerMap, a, b);
    }

    return {
      teams: out,
      leftovers: pool,
    };
  }

  function buildPlayerUsageStats(history: MatchRow[]) {
    const playCounts = new Map<string, number>();
    const sitCounts = new Map<string, number>();
    const lastSitRound = new Map<string, number>();

    for (const m of history) {
      [m.t1p1, m.t1p2, m.t2p1, m.t2p2].forEach((p) => {
        if (!p) return;
        const key = slug(p);
        playCounts.set(key, (playCounts.get(key) || 0) + 1);
      });
    }

    const processedRounds = new Set<number>();
    for (const m of history) {
      if (processedRounds.has(m.round)) continue;
      processedRounds.add(m.round);

      for (const p of m.sitOuts || []) {
        const key = slug(p);
        sitCounts.set(key, (sitCounts.get(key) || 0) + 1);
        lastSitRound.set(key, m.round);
      }
    }

    return { playCounts, sitCounts, lastSitRound };
  }

  function sitPriorityScore(
    player: string,
    stats: ReturnType<typeof buildPlayerUsageStats>,
    roundIdx: number
  ) {
    const key = slug(player);
    const plays = stats.playCounts.get(key) || 0;
    const sits = stats.sitCounts.get(key) || 0;
    const lastSit = stats.lastSitRound.get(key);

    let score = plays * 100 - sits * 250;

    if (lastSit === roundIdx - 1) score -= 100000;
    else if (lastSit === roundIdx - 2) score -= 5000;

    return score;
  }

  function chooseSingleSitOut(
    candidates: string[],
    stats: ReturnType<typeof buildPlayerUsageStats>,
    roundIdx: number
  ) {
    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const p of candidates) {
      const score = sitPriorityScore(p, stats, roundIdx);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    return best;
  }

  function chooseByeTeamIndex(
    teams: TeamBuild[],
    stats: ReturnType<typeof buildPlayerUsageStats>,
    roundIdx: number
  ) {
    let bestIdx = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < teams.length; i++) {
      const [a, b] = teams[i].team;
      const score =
        sitPriorityScore(a, stats, roundIdx) +
        sitPriorityScore(b, stats, roundIdx);

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  function buildRound(roundIdx: number, history: MatchRow[]) {
    const seedNum = seedStr ? Number(seedStr) : undefined;
    const stats = buildPlayerUsageStats(history);
    const sitOuts: string[] = [];

    let availableGuys = [...guys];
    let availableGirls = [...girls];

    if ((availableGuys.length + availableGirls.length) % 2 === 1) {
      const singleSit = chooseSingleSitOut(
        [...availableGuys, ...availableGirls],
        stats,
        roundIdx
      );
      sitOuts.push(singleSit);

      if (availableGuys.includes(singleSit)) {
        availableGuys = availableGuys.filter((p) => p !== singleSit);
      } else {
        availableGirls = availableGirls.filter((p) => p !== singleSit);
      }
    }

    const shuffledGuys = shuffle(availableGuys, seedNum);
    const shuffledGirls = shuffle(availableGirls, seedNum ? seedNum + 17 : undefined);

    const partnerMap = buildPartnerMap(history);
    const opponentMap = buildOpponentMap(history);
    const courtMap = buildCourtMap(history);
    const roleStats = buildRoleStats(history);

    const prioritizedGuys = preferMixedAssignment(shuffledGuys, roleStats, roundIdx);
    const prioritizedGirls = preferMixedAssignment(shuffledGirls, roleStats, roundIdx);

    const mixedCount = Math.min(prioritizedGuys.length, prioritizedGirls.length);
    const guysForMixed = prioritizedGuys.slice(0, mixedCount);
    const girlsForMixed = prioritizedGirls.slice(0, mixedCount);

    const mixedBuilt = makeMixedTeams(guysForMixed, girlsForMixed, partnerMap);

    let leftoverGuys = prioritizedGuys.slice(mixedCount);
    let leftoverGirls = mixedBuilt.leftoverGirls.concat(prioritizedGirls.slice(mixedCount));

    // ── Explicit back-to-back rescue ──────────────────────────────────────────
    // If any leftover guy/girl had a same-gender match last round AND there is a
    // mixed-pool player with no back-to-back history, swap them so the at-risk
    // player gets the mixed slot and the fresh player takes the leftover spot.
    const hadSgLastRound = (p: string) =>
      roleStats.lastSameGenderRound.get(slug(p)) === roundIdx - 1;

    // Rescue leftover guys
    const urgentGuys = leftoverGuys.filter(hadSgLastRound);
    if (urgentGuys.length > 0) {
      // Candidates from the mixed pool who did NOT play same-gender last round,
      // sorted ascending by same-gender count (sacrifice the "freshest" player)
      const swappable = guysForMixed
        .filter(g => !hadSgLastRound(g))
        .sort((a, b) => {
          const ca = roleStats.sameGenderCount.get(slug(a)) || 0;
          const cb = roleStats.sameGenderCount.get(slug(b)) || 0;
          return ca - cb;
        });
      const swapCount = Math.min(urgentGuys.length, swappable.length);
      for (let i = 0; i < swapCount; i++) {
        const urgent = urgentGuys[i];
        const fresh = swappable[i];
        leftoverGuys = leftoverGuys.map(g => g === urgent ? fresh : g);
        // guysForMixed is already used by makeMixedTeams; rebuild mixedBuilt
        // by replacing 'fresh' with 'urgent' so urgent gets paired with a girl.
        // We do a simple partner swap: remove fresh's pair, pair urgent instead.
        const pairIdx = mixedBuilt.mixed.findIndex(tb => tb.team.includes(fresh));
        if (pairIdx >= 0) {
          const oldPair = mixedBuilt.mixed[pairIdx];
          const partnerGirl = oldPair.team[0] === fresh ? oldPair.team[1] : oldPair.team[0];
          mixedBuilt.mixed[pairIdx] = { team: [urgent, partnerGirl], tag: null };
          addPairToMap(partnerMap, urgent, partnerGirl);
        }
      }
    }

    // Rescue leftover girls
    const urgentGirls = leftoverGirls.filter(hadSgLastRound);
    if (urgentGirls.length > 0) {
      const swappable = girlsForMixed
        .filter(g => !hadSgLastRound(g))
        .sort((a, b) => {
          const ca = roleStats.sameGenderCount.get(slug(a)) || 0;
          const cb = roleStats.sameGenderCount.get(slug(b)) || 0;
          return ca - cb;
        });
      const swapCount = Math.min(urgentGirls.length, swappable.length);
      for (let i = 0; i < swapCount; i++) {
        const urgent = urgentGirls[i];
        const fresh = swappable[i];
        leftoverGirls = leftoverGirls.map(g => g === urgent ? fresh : g);
        const pairIdx = mixedBuilt.mixed.findIndex(tb => tb.team.includes(fresh));
        if (pairIdx >= 0) {
          const oldPair = mixedBuilt.mixed[pairIdx];
          const partnerGuy = oldPair.team[0] === fresh ? oldPair.team[1] : oldPair.team[0];
          mixedBuilt.mixed[pairIdx] = { team: [partnerGuy, urgent], tag: null };
          addPairToMap(partnerMap, partnerGuy, urgent);
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const guyTeamsBuilt = makeSameGenderTeams(
      leftoverGuys,
      "ULTIMATE_REVCO",
      partnerMap,
      roleStats,
      roundIdx
    );

    const girlTeamsBuilt = makeSameGenderTeams(
      leftoverGirls,
      "POWER_PUFF",
      partnerMap,
      roleStats,
      roundIdx
    );

    const allTeams: TeamBuild[] = [
      ...mixedBuilt.mixed,
      ...guyTeamsBuilt.teams,
      ...girlTeamsBuilt.teams,
    ];

    if (allTeams.length % 2 === 1) {
      const byeIdx = chooseByeTeamIndex(allTeams, stats, roundIdx);
      const byeTeam = allTeams.splice(byeIdx, 1)[0];
      sitOuts.push(...byeTeam.team);
    }

    const teamList = shuffle(allTeams, seedNum ? seedNum + roundIdx * 101 : undefined);
    const made: MatchRow[] = [];

    while (teamList.length >= 2) {
      const a = teamList.shift()!;

      let bestIdx = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < teamList.length; i++) {
        const b = teamList[i];
        const score = scoreMatchup(opponentMap, a.team, b.team, a.tag, b.tag);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
          if (score === 0) break;
        }
      }

      const b = teamList.splice(bestIdx, 1)[0];

      for (const A of a.team) {
        for (const B of b.team) {
          const SA = slug(A);
          const SB = slug(B);

          if (!opponentMap.has(SA)) opponentMap.set(SA, new Set());
          if (!opponentMap.has(SB)) opponentMap.set(SB, new Set());

          opponentMap.get(SA)!.add(SB);
          opponentMap.get(SB)!.add(SA);
        }
      }

      made.push({
        id: `${roundIdx}-pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        round: roundIdx,
        court: 0,
        t1p1: a.team[0],
        t1p2: a.team[1],
        t2p1: b.team[0],
        t2p2: b.team[1],
        tag: a.tag || b.tag || null,
        scoreText: "",
      });
    }

    const courts = Array.from({ length: made.length }, (_, i) => startCourt + i);
    const unassigned = [...made];
    const assigned: MatchRow[] = [];

    while (unassigned.length) {
      let bestMatchIdx = 0;
      let bestCourtIdx = 0;
      let bestPenalty = Number.POSITIVE_INFINITY;

      for (let mi = 0; mi < unassigned.length; mi++) {
        const m = unassigned[mi];
        const players = [m.t1p1, m.t1p2, m.t2p1, m.t2p2];

        for (let ci = 0; ci < courts.length; ci++) {
          const court = courts[ci];
          const penalty = scoreCourtForPlayers(courtMap, players, court);

          if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestMatchIdx = mi;
            bestCourtIdx = ci;
            if (penalty === 0) break;
          }
        }
        if (bestPenalty === 0) break;
      }

      const match = unassigned.splice(bestMatchIdx, 1)[0];
      const court = courts.splice(bestCourtIdx, 1)[0];

      match.id = `${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      match.court = court;

      noteCourtForPlayers(
        courtMap,
        [match.t1p1, match.t1p2, match.t2p1, match.t2p2],
        court
      );

      assigned.push(match);
    }

    assigned.sort((a, b) => a.court - b.court);

    if (assigned.length && sitOuts.length) {
      assigned[0] = {
        ...assigned[0],
        sitOuts,
      };
    }

    return assigned;
  }

  function onGenerate() {
    const n = clampN(roundsToGen, 1);
    const out: MatchRow[] = [];

    let history = matches.slice();
    const currentMax = history.reduce((mx, m) => Math.max(mx, m.round), 0) || 0;

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
        <h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Doubles)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
            />
            Minimize repeats when possible
          </label>

          <label className="flex items-center gap-1">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={(e) => setRoundsToGen(clampN(+e.target.value || 1, 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>

          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={(e) => setStartCourt(clampN(+e.target.value || 1, 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>

          <label className="flex items-center gap-1">
            Seed
            <input
              type="text"
              value={seedStr}
              onChange={(e) => setSeedStr(e.target.value)}
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
        Mixed teams are built first, then all leftover same-gender players are used to form
        Ultimate Revco or Power Puff teams. The generator minimizes repeat partners, repeat
        opponents, and repeated court assignments when possible.
        Back-to-back same-gender rounds are strongly avoided and counts are balanced across all players.
      </p>

      {sgStats.hasAny && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="text-[12px] font-semibold text-slate-700 mb-2">
            Same-Gender History (Ultimate Revco / Power Puff)
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-[11px]">
            {/* Guys – Ultimate Revco */}
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

            {/* Girls – Power Puff */}
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
            Players with higher counts are prioritized for mixed teams in future rounds.
          </p>
        </div>
      )}
    </section>
  );
}

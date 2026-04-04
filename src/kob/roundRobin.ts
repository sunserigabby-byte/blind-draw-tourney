// Round-robin rotating-partner scheduler for KOB/QOB.
// Instead of splitting players into small pools, all players stay in one group
// and partners rotate each round.

export type RoundGame = {
  t1: [number, number];
  t2: [number, number];
  courtOffset: number;
};

export type Round = {
  games: RoundGame[];
  sitters: number[];
};

function partnershipKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Count total unique partnerships possible for N players: C(N,2)
 */
export function totalPartnerships(n: number): number {
  return (n * (n - 1)) / 2;
}

/**
 * Generate a round-robin schedule.
 * @param numPlayers    Total players
 * @param targetRounds  Number of rounds, or 'all' to cover every partnership
 * @param seeded        If true, player index = seed rank (0 = strongest).
 *                      Pairs strong+weak as partners for balanced games.
 * @returns  Array of rounds + stats
 */
export function generateRoundRobinSchedule(
  numPlayers: number,
  targetRounds: number | 'all',
  seeded: boolean = false,
  courtOverride?: number,
): { rounds: Round[]; coveredCount: number; totalCount: number } {
  const maxCourts = Math.floor(numPlayers / 4);
  const courts = Math.min(courtOverride ?? maxCourts, maxCourts);
  const playersPerRound = courts * 4;
  const totalCount = totalPartnerships(numPlayers);

  const covered = new Set<string>();
  const gamesPlayed = new Array(numPlayers).fill(0);
  const timesSat = new Array(numPlayers).fill(0);
  // Track how many times each player has been on each court
  const courtCount: number[][] = Array.from({ length: numPlayers }, () => new Array(courts).fill(0));
  // Track how many times each pair has been opponents
  const opponentCount: number[][] = Array.from({ length: numPlayers }, () => new Array(numPlayers).fill(0));

  const rounds: Round[] = [];
  const maxRounds = targetRounds === 'all' ? 200 : targetRounds;
  const sitSlots = numPlayers - playersPerRound;

  for (let r = 0; r < maxRounds; r++) {
    if (targetRounds === 'all' && covered.size >= totalCount) break;

    // Pick who sits: prioritize equal games for everyone.
    // Players who've played the most sit first, then those who've sat least.
    const playerOrder = Array.from({ length: numPlayers }, (_, i) => i).sort(
      (a, b) =>
        gamesPlayed[b] - gamesPlayed[a] ||   // played most sits first (keeps games equal)
        timesSat[a] - timesSat[b],            // sat least sits first (balance rest)
    );
    const sitters = playerOrder.slice(0, sitSlots).sort((a, b) => a - b);
    const sitterSet = new Set(sitters);
    const active = playerOrder.slice(sitSlots).sort((a, b) => a - b);

    // Find best pairing of active players into games
    const bestGames = findBestPairing(active, courts, covered, seeded ? 'seeded' : 'none', opponentCount);

    // Assign courts to games by minimising total court imbalance for all players.
    // Try all permutations of court assignments (courts is small, max ~4).
    const gameCount = bestGames.length;
    let bestPerm: number[] = Array.from({ length: gameCount }, (_, i) => i);
    if (courts > 1) {
      let bestImbalance = Infinity;
      const perm = bestPerm.slice();
      const tryPerms = (start: number) => {
        if (start === gameCount) {
          let imb = 0;
          for (let c = 0; c < gameCount; c++) {
            const [a, b, c2, d] = bestGames[c];
            for (const p of [a, b, c2, d]) imb += courtCount[p][perm[c]];
          }
          if (imb < bestImbalance) { bestImbalance = imb; bestPerm = perm.slice(); }
          return;
        }
        for (let i = start; i < gameCount; i++) {
          [perm[start], perm[i]] = [perm[i], perm[start]];
          tryPerms(start + 1);
          [perm[start], perm[i]] = [perm[i], perm[start]];
        }
      };
      tryPerms(0);
    }

    const roundGames: RoundGame[] = [];
    for (let c = 0; c < bestGames.length; c++) {
      const [a, b, c2, d] = bestGames[c];
      covered.add(partnershipKey(a, b));
      covered.add(partnershipKey(c2, d));
      gamesPlayed[a]++;
      gamesPlayed[b]++;
      gamesPlayed[c2]++;
      gamesPlayed[d]++;
      const assignedCourt = bestPerm[c];
      courtCount[a][assignedCourt]++;
      courtCount[b][assignedCourt]++;
      courtCount[c2][assignedCourt]++;
      courtCount[d][assignedCourt]++;
      // Track opponents
      for (const p of [a, b]) for (const o of [c2, d]) { opponentCount[p][o]++; opponentCount[o][p]++; }
      roundGames.push({ t1: [a, b], t2: [c2, d], courtOffset: assignedCourt });
    }

    for (const s of sitters) timesSat[s]++;

    rounds.push({ games: roundGames, sitters });
  }

  return { rounds, coveredCount: covered.size, totalCount };
}

/**
 * Cost function for game configurations (lower = better).
 *
 * 1. Opponent variety (HIGH weight): avoid repeat opponents — every game
 *    should ideally feature opponents who haven't faced each other yet.
 * 2. Team balance (seeded only): teams should be balanced in total strength.
 */
function configCost(games: number[][], oppCount: number[][], seeded: boolean): number {
  let cost = 0;
  for (const g of games) {
    // Opponent variety: heavily penalise repeat opponents
    for (const p of [g[0], g[1]]) {
      for (const o of [g[2], g[3]]) {
        cost += oppCount[p][o] * 5;
      }
    }
    // Team balance (only when seeded)
    if (seeded) {
      const t1Sum = g[0] + g[1];
      const t2Sum = g[2] + g[3];
      cost += Math.abs(t1Sum - t2Sum);
    }
  }
  return cost;
}

/**
 * Greedy search: partition `active` players into `numCourts` games of 4,
 * maximising the number of NEW partnerships (teammate pairs).
 * Uses opponent history to avoid repeat matchups.
 */
function findBestPairing(
  active: number[],
  numCourts: number,
  covered: Set<string>,
  costMode: 'seeded' | 'variety' | 'none',
  oppCount: number[][],
): number[][] {
  const best = { games: [] as number[][], score: -1, cost: Infinity };
  const useSeeding = costMode === 'seeded';

  function search(remaining: number[], games: number[][], score: number) {
    if (games.length === numCourts) {
      const cost = configCost(games, oppCount, useSeeding);
      if (score > best.score || (score === best.score && cost < best.cost)) {
        best.games = games.map(g => [...g]);
        best.score = score;
        best.cost = cost;
      }
      return;
    }
    if (remaining.length < 4) return;

    // First remaining player is always in the next game (avoids duplicate orderings)
    const first = remaining[0];
    const rest = remaining.slice(1);

    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        for (let k = j + 1; k < rest.length; k++) {
          const four = [first, rest[i], rest[j], rest[k]];
          const others = rest.filter((_, idx) => idx !== i && idx !== j && idx !== k);

          // 3 possible team splits for 4 players
          const splits: [number[], number[]][] = [
            [[four[0], four[1]], [four[2], four[3]]],
            [[four[0], four[2]], [four[1], four[3]]],
            [[four[0], four[3]], [four[1], four[2]]],
          ];

          for (const [t1, t2] of splits) {
            let newP = 0;
            if (!covered.has(partnershipKey(t1[0], t1[1]))) newP++;
            if (!covered.has(partnershipKey(t2[0], t2[1]))) newP++;

            search(others, [...games, [t1[0], t1[1], t2[0], t2[1]]], score + newP);
          }
        }
      }
    }
  }

  search(active, [], 0);
  return best.games;
}

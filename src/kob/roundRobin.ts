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
): { rounds: Round[]; coveredCount: number; totalCount: number } {
  const courts = Math.floor(numPlayers / 4);
  const playersPerRound = courts * 4;
  const totalCount = totalPartnerships(numPlayers);

  const covered = new Set<string>();
  const gamesPlayed = new Array(numPlayers).fill(0);
  const timesSat = new Array(numPlayers).fill(0);

  const rounds: Round[] = [];
  const maxRounds = targetRounds === 'all' ? 200 : targetRounds;

  for (let r = 0; r < maxRounds; r++) {
    if (targetRounds === 'all' && covered.size >= totalCount) break;

    // Pick active players: prioritise those who've sat the most, then played least
    const playerOrder = Array.from({ length: numPlayers }, (_, i) => i).sort(
      (a, b) => timesSat[b] - timesSat[a] || gamesPlayed[a] - gamesPlayed[b],
    );
    const active = playerOrder.slice(0, playersPerRound).sort((a, b) => a - b);
    const sitters = playerOrder.slice(playersPerRound).sort((a, b) => a - b);

    for (const s of sitters) timesSat[s]++;

    // Find best pairing of active players into games
    const bestGames = findBestPairing(active, courts, covered, seeded);

    const roundGames: RoundGame[] = [];
    for (let c = 0; c < bestGames.length; c++) {
      const [a, b, c2, d] = bestGames[c];
      covered.add(partnershipKey(a, b));
      covered.add(partnershipKey(c2, d));
      gamesPlayed[a]++;
      gamesPlayed[b]++;
      gamesPlayed[c2]++;
      gamesPlayed[d]++;
      roundGames.push({ t1: [a, b], t2: [c2, d], courtOffset: c });
    }

    rounds.push({ games: roundGames, sitters });
  }

  return { rounds, coveredCount: covered.size, totalCount };
}

/**
 * Seeding quality score (lower = better).
 *
 * Two goals:
 * 1. Close-skill partners — minimize the seed gap within each team.
 *    e.g. seed 1+3 is better than seed 1+10.
 * 2. Tier-matched opponents — teams at similar skill tiers play each other.
 *    e.g. (1+3 vs 2+4) is better than (1+3 vs 8+10).
 *
 * This produces games like: 1+3 vs 2+4 (top tier), 5+7 vs 6+8 (mid tier).
 * Extreme pairings (1+10) only happen when forced by "play with everyone".
 */
function seedingCost(games: number[][]): number {
  let cost = 0;
  for (const g of games) {
    // Partner closeness: smaller gap = better partners
    const gap1 = Math.abs(g[0] - g[1]);
    const gap2 = Math.abs(g[2] - g[3]);
    cost += (gap1 + gap2) * 3;

    // Tier matching: similar-level teams should face each other
    const t1Avg = (g[0] + g[1]) / 2;
    const t2Avg = (g[2] + g[3]) / 2;
    cost += Math.abs(t1Avg - t2Avg);
  }
  return cost;
}

/**
 * Greedy search: partition `active` players into `numCourts` games of 4,
 * maximising the number of NEW partnerships (teammate pairs).
 * When seeded, uses team balance as a tiebreaker.
 */
function findBestPairing(
  active: number[],
  numCourts: number,
  covered: Set<string>,
  seeded: boolean,
): number[][] {
  const best = { games: [] as number[][], score: -1, cost: Infinity };

  function search(remaining: number[], games: number[][], score: number) {
    if (games.length === numCourts) {
      const cost = seeded ? seedingCost(games) : 0;
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

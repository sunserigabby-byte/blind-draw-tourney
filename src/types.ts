export type MatchRow = {
  id: string;
  round: number;
  court: number;
  t1p1: string;
  t1p2: string;
  t2p1: string;
  t2p2: string;
  tag?: 'ULTIMATE_REVCO' | 'POWER_PUFF' | null;
  scoreText?: string;
  sitOuts?: string[];
};

export type PlayDiv = 'UPPER' | 'LOWER' | 'RR';

export interface Team {
  id: string;
  name: string;
  members: string[];
  seed: number;
  division: PlayDiv;
}

export interface BracketMatch {
  id: string;
  division: PlayDiv;
  round: number;
  slot: number;
  team1?: Team;
  team2?: Team;
  score?: string;
  nextId?: string;
  nextSide?: 'team1' | 'team2';
  team1SourceId?: string;
  team2SourceId?: string;
  court?: number;
  loserNextId?: string;
  loserNextSide?: 'team1' | 'team2';
  redemption?: boolean;
  // Mickey & Minnie playoffs: per-game scores (match play to 21/21/15) and the
  // higher seed's chosen format for the match.
  games?: string[];
  format?: 'MICKEY' | 'MINNIE';
}

export type QuadsMatchRow = {
  id: string;
  round: number;
  court: number;
  t1: string[];
  t2: string[];
  isTriple1?: boolean;
  isTriple2?: boolean;
  t1GirlCount?: number;
  t2GirlCount?: number;
  tag1?: 'ULTIMATE_REVCO' | 'POWER_PUFF' | null;
  tag2?: 'ULTIMATE_REVCO' | 'POWER_PUFF' | null;
  sitOuts?: string[];
  scoreText?: string;
};

export type TriplesMatchRow = {
  id: string;
  round: number;
  court: number;
  t1: string[];
  t2: string[];
  girlsNeeded: number;
  sitOuts?: string[];
  scoreText?: string;
};

export type PlayerStats = { name: string; W: number; L: number; PF: number; PA: number; GP: number };

// Mickey & Minnie — fixed teams of 4 built from pairs + free agents.
// Each matchup is two sets: Mickey (coed quads) + Minnie (revco quads).
export type MickeyTeam = {
  id: string;
  name: string;
  players: string[];
  pool: number;
};

export type MickeyMatchRow = {
  id: string;
  pool: number;
  teamAId: string;
  teamBId: string;
  // When `format` is set, the match plays a single set in that format.
  // Round 1 of the pool's double round-robin uses one format (admin's pick)
  // and round 2 uses the other, so a pair of teams gets one Mickey and one
  // Minnie across their two meetings. Score lives in mickeyScore or
  // minnieScore depending on `format`. Legacy matches without `format`
  // still play both sets in one card.
  format?: 'MICKEY' | 'MINNIE';
  mickeyScore?: string; // coed set, e.g. "21-18"
  minnieScore?: string; // revco set
};

// Configurable score rules — changeable per format anytime during the tournament
export type ScoreSettings = { playTo: number; cap: number | null };

// King/Queen of the Beach — individual tournament with rotating partners
// Each pool of 4 plays 3 games; every player partners with every other once.
export type KobGameRow = {
  id: string;
  // Regular pools: 1, 2, 3, …
  // Gold finals:   1001 = KOB, 1002 = QOB
  // Silver finals: 1011 = KOB, 1012 = QOB
  pool: number;
  game: number;
  t1: [string, string];
  t2: [string, string];
  court?: number;
  scoreText?: string;
  isFinals?: boolean;
  finalsLabel?: 'Gold KOB' | 'Gold QOB' | 'Silver KOB' | 'Silver QOB';
  sitOut?: string | string[];  // player(s) sitting this game (string for 1, string[] for 2+)
};

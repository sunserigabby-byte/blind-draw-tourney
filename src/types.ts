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

// King/Queen of the Beach — individual tournament with rotating partners
// Each pool of 4 plays 3 games; every player partners with every other once.
export type KobGameRow = {
  id: string;
  pool: number;    // pool number (1, 2, 3, …); 1001 = KOB Finals, 1002 = QOB Finals
  game: number;    // game within pool (1, 2, 3)
  t1: [string, string];
  t2: [string, string];
  court?: number;
  scoreText?: string;
  isFinals?: boolean;
  finalsLabel?: 'KOB Finals' | 'QOB Finals';
};

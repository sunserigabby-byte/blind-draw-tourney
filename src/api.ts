import type { MatchRow, BracketMatch, QuadsMatchRow, TriplesMatchRow } from './types';

export type PersistedState = {
  guysText: string;
  girlsText: string;
  matches: MatchRow[];
  brackets: BracketMatch[];
  qGuysText: string;
  qGirlsText: string;
  qMatches: QuadsMatchRow[];
  qBrackets: BracketMatch[];
  tGuysText: string;
  tGirlsText: string;
  tMatches: TriplesMatchRow[];
  tBrackets: BracketMatch[];
  activeTab: "DOUBLES" | "QUADS" | "TRIPLES";
};

export async function apiGetState(): Promise<PersistedState | null> {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data ?? null;
}

export async function apiSaveState(state: PersistedState, adminKey: string): Promise<void> {
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`POST /api/state failed (${res.status})`);
}

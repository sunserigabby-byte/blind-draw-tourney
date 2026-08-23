import React, { useMemo } from 'react';
import type { ScoreSettings, RevcoBDRound } from '../types';
import { parseScore, isValidScore, slug, parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';

export type UnitRow = {
  key: string;
  label: string;
  kind: 'pair' | 'free';
  players: string[];
  W: number;
  L: number;
  PD: number;
  rounds: number;
};

// Per-pair (or free agent) standings across every round played — shared by
// the leaderboard display and the playoff builder's seeding.
export function computeRevcoStandings(
  rounds: RevcoBDRound[],
  pairsText: string,
  freeAgentsText: string,
  scoreSettings: ScoreSettings,
): UnitRow[] {
  const pairUnits = parseMickeyPairsGendered(pairsText).map((u, i) => ({
    kind: 'pair' as const,
    key: `pair-${i}-${u.map(m => slug(m.name)).join('|')}`,
    label: u.map(m => m.name).join(' & '),
    players: u.map(m => m.name),
    slugs: u.map(m => slug(m.name)),
  }));
  const freeUnitsRaw = parseMickeyFreeGendered(freeAgentsText).map((m, i) => ({
    kind: 'free' as const,
    key: `free-${i}-${slug(m.name)}`,
    label: m.name,
    players: [m.name],
    slugs: [slug(m.name)],
  }));

  type Acc = UnitRow & { slugs: string[] };
  const accs = new Map<string, Acc>();
  for (const u of [...pairUnits, ...freeUnitsRaw]) {
    accs.set(u.key, { key: u.key, label: u.label, kind: u.kind, players: u.players, slugs: u.slugs, W: 0, L: 0, PD: 0, rounds: 0 });
  }

  const allUnits = [...pairUnits, ...freeUnitsRaw];

  for (const round of rounds) {
    const teamFor = (slugs: string[]) => {
      const team = round.teams.find(t => {
        const set = new Set(t.players.map(slug));
        return slugs.every(s => set.has(s));
      });
      if (team) return team;
      return round.teams.find(t => t.players.some(p => slug(p) === slugs[0])) ?? null;
    };

    for (const u of allUnits) {
      const team = teamFor(u.slugs);
      if (!team) continue;
      const acc = accs.get(u.key)!;
      acc.rounds += 1;

      const match = round.matches.find(m => m.teamAId === team.id || m.teamBId === team.id);
      if (!match) continue;
      const isTeamA = match.teamAId === team.id;

      const p = parseScore(match.scoreText);
      if (!p || p[0] === p[1]) continue;
      if (!isValidScore(p[0], p[1], scoreSettings)) continue;
      const diff = Math.abs(p[0] - p[1]);
      const teamAWon = p[0] > p[1];
      const won = (isTeamA && teamAWon) || (!isTeamA && !teamAWon);
      if (won) {
        acc.W += 1;
        acc.PD += diff;
      } else {
        acc.L += 1;
        acc.PD -= diff;
      }
    }
  }

  const rows: UnitRow[] = Array.from(accs.values()).map(({ slugs, ...rest }) => rest);
  rows.sort((a, b) => {
    if (b.W !== a.W) return b.W - a.W;
    if (b.PD !== a.PD) return b.PD - a.PD;
    return a.label.localeCompare(b.label);
  });
  return rows;
}

export function RevcoBDLeaderboard({
  rounds,
  pairsText,
  freeAgentsText,
  scoreSettings = { playTo: 21, cap: null },
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings?: ScoreSettings;
}) {
  const unitRows = useMemo<UnitRow[]>(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings),
    [rounds, pairsText, freeAgentsText, scoreSettings],
  );

  if (unitRows.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[18px] font-bold text-sky-900 mb-1">Standings — by Pair / Free Agent</h2>
        <p className="text-[11px] text-slate-500">
          Wins tallied per match across every round played. Play to {scoreSettings.playTo}
          {scoreSettings.cap ? `, cap ${scoreSettings.cap}` : ', no cap'}, win by 2.
        </p>
      </div>

      <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-1 px-2">#</th>
                <th className="py-1 px-2">Pair / Free Agent</th>
                <th className="py-1 px-2 text-center">Rounds</th>
                <th className="py-1 px-2">W</th>
                <th className="py-1 px-2">L</th>
                <th className="py-1 px-2">PD</th>
              </tr>
            </thead>
            <tbody>
              {unitRows.map((r, i) => (
                <tr key={r.key} className="border-t">
                  <td className="py-1 px-2 tabular-nums font-semibold text-sky-800">{i + 1}</td>
                  <td className="py-1 px-2">
                    <span className="mr-1.5">{r.label}</span>
                    <span className={
                      'text-[10px] px-1.5 py-0.5 rounded-full ' +
                      (r.kind === 'pair' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')
                    }>
                      {r.kind === 'pair' ? 'Pair' : 'Free agent'}
                    </span>
                  </td>
                  <td className="py-1 px-2 tabular-nums text-center text-slate-500">{r.rounds}</td>
                  <td className="py-1 px-2 tabular-nums">{r.W}</td>
                  <td className="py-1 px-2 tabular-nums">{r.L}</td>
                  <td className="py-1 px-2 tabular-nums">{r.PD > 0 ? `+${r.PD}` : r.PD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

// Condensed, two-column standings for reference on the Playoffs tab — same
// ranking as the full table, just one line per pair/free agent.
export function RevcoBDStandingsCompact({
  rounds,
  pairsText,
  freeAgentsText,
  scoreSettings = { playTo: 21, cap: null },
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings?: ScoreSettings;
}) {
  const unitRows = useMemo<UnitRow[]>(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings),
    [rounds, pairsText, freeAgentsText, scoreSettings],
  );

  if (unitRows.length === 0) return null;

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[14px] font-semibold text-sky-800 mb-2">Standings (reference)</h3>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
        {unitRows.map((r, i) => (
          <div key={r.key} className="flex items-baseline gap-1.5 text-[12px] py-0.5 border-b border-slate-100 last:border-0">
            <span className="tabular-nums font-semibold text-sky-800 w-4 shrink-0">{i + 1}.</span>
            <span className="truncate">{r.label}</span>
            <span className="ml-auto tabular-nums text-slate-500 shrink-0">
              {r.W}-{r.L} ({r.PD > 0 ? `+${r.PD}` : r.PD})
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

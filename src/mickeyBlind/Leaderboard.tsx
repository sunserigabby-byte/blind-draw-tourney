import React, { useMemo } from 'react';
import type { ScoreSettings } from '../types';
import { parseScore, slug, parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';
import type { MickeyBDRound } from './RoundManager';

type UnitRow = {
  key: string;
  label: string;
  kind: 'pair' | 'free';
  W: number;
  L: number;
  PD: number;
  sets: number;
  mickeyW: number;
  mickeyL: number;
  minnieW: number;
  minnieL: number;
  rounds: number; // how many rounds this unit appeared in
};

export function MickeyBDLeaderboard({
  rounds,
  pairsText,
  freeAgentsText,
  scoreSettings = { playTo: 21, cap: null },
}: {
  rounds: MickeyBDRound[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings?: ScoreSettings;
}) {
  const unitRows = useMemo<UnitRow[]>(() => {
    // Each unit is a pair or single free agent. Members are identified by
    // their (slug'd) names so we can match them to teams across rounds.
    const pairUnits = parseMickeyPairsGendered(pairsText).map((u, i) => ({
      kind: 'pair' as const,
      key: `pair-${i}-${u.map(m => slug(m.name)).join('|')}`,
      label: u.map(m => m.name).join(' & '),
      slugs: u.map(m => slug(m.name)),
    }));
    const freeUnitsRaw = parseMickeyFreeGendered(freeAgentsText).map((m, i) => ({
      kind: 'free' as const,
      key: `free-${i}-${slug(m.name)}`,
      label: m.name,
      slugs: [slug(m.name)],
    }));

    type Acc = {
      key: string; label: string; kind: 'pair' | 'free';
      W: number; L: number; PD: number; sets: number;
      mickeyW: number; mickeyL: number; minnieW: number; minnieL: number;
      rounds: number;
    };
    const accs = new Map<string, Acc>();
    for (const u of [...pairUnits, ...freeUnitsRaw]) {
      accs.set(u.key, {
        key: u.key, label: u.label, kind: u.kind,
        W: 0, L: 0, PD: 0, sets: 0,
        mickeyW: 0, mickeyL: 0, minnieW: 0, minnieL: 0,
        rounds: 0,
      });
    }

    const allUnits = [...pairUnits, ...freeUnitsRaw];

    for (const round of rounds) {
      // For this round, find which team each unit landed on.
      const teamFor = (slugs: string[]) => {
        const team = round.teams.find(t => {
          const set = new Set(t.players.map(slug));
          return slugs.every(s => set.has(s));
        });
        if (team) return team;
        // Fallback: find any team containing the first member
        return round.teams.find(t => t.players.some(p => slug(p) === slugs[0])) ?? null;
      };

      for (const u of allUnits) {
        const team = teamFor(u.slugs);
        if (!team) continue;
        const acc = accs.get(u.key)!;
        acc.rounds += 1;

        // Find the match this team played in (each team plays one per round
        // in BD format — could be zero if they sat out).
        const match = round.matches.find(m => m.teamAId === team.id || m.teamBId === team.id);
        if (!match) continue;
        const isTeamA = match.teamAId === team.id;

        for (const fmt of ['mickey', 'minnie'] as const) {
          const scoreText = fmt === 'mickey' ? match.mickeyScore : match.minnieScore;
          const p = parseScore(scoreText);
          if (!p || p[0] === p[1]) continue;
          const diff = Math.abs(p[0] - p[1]);
          const teamAWon = p[0] > p[1];
          const won = (isTeamA && teamAWon) || (!isTeamA && !teamAWon);
          acc.sets += 1;
          if (won) {
            acc.W += 1; acc.PD += diff;
            if (fmt === 'mickey') acc.mickeyW += 1; else acc.minnieW += 1;
          } else {
            acc.L += 1; acc.PD -= diff;
            if (fmt === 'mickey') acc.mickeyL += 1; else acc.minnieL += 1;
          }
        }
      }
    }

    const rows: UnitRow[] = Array.from(accs.values()).map(a => ({
      key: a.key, label: a.label, kind: a.kind,
      W: a.W, L: a.L, PD: a.PD, sets: a.sets,
      mickeyW: a.mickeyW, mickeyL: a.mickeyL,
      minnieW: a.minnieW, minnieL: a.minnieL,
      rounds: a.rounds,
    }));

    rows.sort((a, b) => {
      if (b.W !== a.W) return b.W - a.W;
      if (b.PD !== a.PD) return b.PD - a.PD;
      return a.label.localeCompare(b.label);
    });
    return rows;
  }, [rounds, pairsText, freeAgentsText]);

  if (unitRows.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[18px] font-bold text-sky-900 mb-1">Standings — Aggregate by Pair / Free Agent</h2>
        <p className="text-[11px] text-slate-500">
          Wins are counted per set (Mickey and Minnie) across every round played. Play to {scoreSettings.playTo}
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
                <th className="py-1 px-2 text-center">Mickey</th>
                <th className="py-1 px-2 text-center">Minnie</th>
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
                  <td className="py-1 px-2 tabular-nums text-center">{r.mickeyW}-{r.mickeyL}</td>
                  <td className="py-1 px-2 tabular-nums text-center">{r.minnieW}-{r.minnieL}</td>
                  <td className="py-1 px-2 tabular-nums">{r.W}</td>
                  <td className="py-1 px-2 tabular-nums">{r.L}</td>
                  <td className="py-1 px-2 tabular-nums">{r.PD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

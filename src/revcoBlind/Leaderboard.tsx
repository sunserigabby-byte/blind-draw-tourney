import React, { useMemo, useState } from 'react';
import type { ScoreSettings, RevcoBDRound } from '../types';
import { parseScore, isValidScore, slug, parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';

export type StandingsOverride = { W: number; L: number; PD: number };
export type RevcoOverrides = Record<string, StandingsOverride>;

// Stable id for a pair / free agent, used to remember manual overrides.
// Built from player names (not list position) so reordering the roster
// doesn't move an override onto the wrong people.
export const unitOverrideKey = (players: string[]) => players.map(slug).sort().join('|');

export type UnitRow = {
  key: string;
  overrideKey: string;
  overridden: boolean;
  label: string;
  kind: 'pair' | 'free';
  players: string[];
  W: number;
  L: number;
  PD: number;
  rounds: number;
};

// Per-pair (or free agent) standings across every round played — shared by
// the leaderboard display and the playoff builder's seeding. `overrides`
// replaces a row's W/L/PD outright with admin-typed numbers.
export function computeRevcoStandings(
  rounds: RevcoBDRound[],
  pairsText: string,
  freeAgentsText: string,
  scoreSettings: ScoreSettings,
  overrides: RevcoOverrides = {},
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
    accs.set(u.key, {
      key: u.key, overrideKey: unitOverrideKey(u.players), overridden: false,
      label: u.label, kind: u.kind, players: u.players, slugs: u.slugs, W: 0, L: 0, PD: 0, rounds: 0,
    });
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

  for (const acc of accs.values()) {
    const o = overrides[acc.overrideKey];
    if (o) { acc.W = o.W; acc.L = o.L; acc.PD = o.PD; acc.overridden = true; }
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
  overrides = {},
  setOverrides,
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings?: ScoreSettings;
  overrides?: RevcoOverrides;
  // Only passed for admins — viewers see the table without Edit buttons.
  setOverrides?: (f: (prev: RevcoOverrides) => RevcoOverrides) => void;
}) {
  const unitRows = useMemo<UnitRow[]>(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings, overrides),
    [rounds, pairsText, freeAgentsText, scoreSettings, overrides],
  );

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<StandingsOverride>({ W: 0, L: 0, PD: 0 });
  const startEdit = (r: UnitRow) => { setEditingKey(r.overrideKey); setEditBuffer({ W: r.W, L: r.L, PD: r.PD }); };
  const saveEdit = () => {
    if (!editingKey) return;
    setOverrides?.(prev => ({ ...prev, [editingKey]: editBuffer }));
    setEditingKey(null);
  };
  const clearOverride = (key: string) => {
    setOverrides?.(prev => { const { [key]: _drop, ...rest } = prev; return rest; });
    if (editingKey === key) setEditingKey(null);
  };
  const canEdit = !!setOverrides;
  const numInput = (field: keyof StandingsOverride) => (
    <input
      type="number"
      className="w-14 border border-slate-300 rounded px-1 py-0.5 text-[12px] tabular-nums"
      value={editBuffer[field]}
      onChange={e => { const v = parseInt(e.target.value) || 0; setEditBuffer(b => ({ ...b, [field]: v })); }}
    />
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
        {canEdit && (
          <p className="text-[11px] text-slate-500 mt-1">
            Admin: click <span className="font-medium">Edit</span> on a row to set its W / L / PD by hand. Manual
            numbers replace the calculated ones (including for playoff seeding) until you click Reset.
          </p>
        )}
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
                {canEdit && <th className="py-1 px-2" />}
              </tr>
            </thead>
            <tbody>
              {unitRows.map((r, i) => {
                const isEditing = editingKey === r.overrideKey;
                return (
                <tr key={r.key} className={'border-t ' + (r.overridden ? 'bg-amber-50/60' : '')}>
                  <td className="py-1 px-2 tabular-nums font-semibold text-sky-800">{i + 1}</td>
                  <td className="py-1 px-2">
                    <span className="mr-1.5">{r.label}</span>
                    <span className={
                      'text-[10px] px-1.5 py-0.5 rounded-full ' +
                      (r.kind === 'pair' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')
                    }>
                      {r.kind === 'pair' ? 'Pair' : 'Free agent'}
                    </span>
                    {r.overridden && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">edited</span>
                    )}
                  </td>
                  <td className="py-1 px-2 tabular-nums text-center text-slate-500">{r.rounds}</td>
                  {isEditing ? (
                    <>
                      <td className="py-1 px-2">{numInput('W')}</td>
                      <td className="py-1 px-2">{numInput('L')}</td>
                      <td className="py-1 px-2">{numInput('PD')}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 px-2 tabular-nums">{r.W}</td>
                      <td className="py-1 px-2 tabular-nums">{r.L}</td>
                      <td className="py-1 px-2 tabular-nums">{r.PD > 0 ? `+${r.PD}` : r.PD}</td>
                    </>
                  )}
                  {canEdit && (
                    <td className="py-1 px-2 whitespace-nowrap">
                      {isEditing ? (
                        <span className="inline-flex gap-1">
                          <button className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] hover:bg-emerald-700" onClick={saveEdit}>Save</button>
                          <button className="px-2 py-0.5 rounded border text-[11px]" onClick={() => setEditingKey(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <button className="px-2 py-0.5 rounded border text-slate-700 hover:bg-slate-50 text-[11px]" onClick={() => startEdit(r)}>Edit</button>
                          {r.overridden && (
                            <button className="px-2 py-0.5 rounded text-red-600 hover:bg-red-50 text-[11px]" onClick={() => clearOverride(r.overrideKey)} title="Go back to the calculated numbers">Reset</button>
                          )}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
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
  overrides = {},
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings?: ScoreSettings;
  overrides?: RevcoOverrides;
}) {
  const unitRows = useMemo<UnitRow[]>(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings, overrides),
    [rounds, pairsText, freeAgentsText, scoreSettings, overrides],
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

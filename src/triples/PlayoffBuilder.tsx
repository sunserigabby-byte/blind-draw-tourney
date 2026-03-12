import React, { useMemo, useState } from 'react';
import type { TriplesMatchRow, BracketMatch, Team } from '../types';
import { slug, clampN } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeTriplesStandings } from './Leaderboard';

export function TriplesPlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
}: {
  matches: TriplesMatchRow[];
  guysText: string;
  girlsText: string;
  setBrackets: (f: (prev: BracketMatch[]) => BracketMatch[] | BracketMatch[]) => void;
}) {
  const { guysRows, girlsRows } = useMemo(
    () => computeTriplesStandings(matches, guysText, girlsText),
    [matches, guysText, girlsText]
  );
  const [teamCount, setTeamCount] = useState(8);

  function onBuild() {
    const all = [
      ...guysRows.map(r => ({ ...r, gender: 'M' as const })),
      ...girlsRows.map(r => ({ ...r, gender: 'F' as const })),
    ].sort((a, b) => b.W - a.W || b.PD - a.PD || a.name.localeCompare(b.name));

    const selected = all.slice(0, Math.min(teamCount * 3, all.length));
    const teams: Team[] = [];

    for (let i = 0; i + 2 < selected.length; i += 3) {
      const members = [selected[i].name, selected[i + 1].name, selected[i + 2].name];
      const name = members.join(' / ');
      teams.push({
        id: `TR-${teams.length + 1}-${slug(name)}`,
        name,
        members,
        seed: teams.length + 1,
        division: 'UPPER',
      });
    }

    setBrackets(() => buildBracket('UPPER', teams.slice(0, teamCount)));
  }

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[16px] font-semibold text-sky-800 mb-2">Playoff Setup (Triples)</h3>
      <div className="flex items-center gap-3 text-[12px] flex-wrap">
        <label className="flex items-center gap-2">
          Teams in bracket
          <input className="w-20 border rounded px-2 py-1" type="number" min={2} value={teamCount} onChange={(e) => setTeamCount(clampN(+e.target.value || 2, 2))} />
        </label>
        <button className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-[13px]" onClick={onBuild}>Build Triples Bracket</button>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Builds a simple triples bracket from the top triples standings pool.</p>
    </section>
  );
}

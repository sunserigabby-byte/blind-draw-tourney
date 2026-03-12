import React, { useMemo, useState } from 'react';
import type { TriplesMatchRow } from '../types';
import { uniq, shuffle, clampN } from '../utils';

export function TriplesRoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}: {
  guysText: string;
  girlsText: string;
  matches: TriplesMatchRow[];
  setMatches: (f: (prev: TriplesMatchRow[]) => TriplesMatchRow[] | TriplesMatchRow[]) => void;
}) {
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);
  const [minGirlsPerTeam, setMinGirlsPerTeam] = useState(1);
  const guys = useMemo(() => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)), [guysText]);
  const girls = useMemo(() => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)), [girlsText]);

  function buildRound(roundIdx: number) {
    const gPool = shuffle(guys); const fPool = shuffle(girls);
    const total = gPool.length + fPool.length; const teamsCount = Math.floor(total / 3);
    const teams: string[][] = [];
    for (let i = 0; i < teamsCount; i++) {
      const team: string[] = [];
      const girlsNeeded = Math.min(minGirlsPerTeam, fPool.length >= (teamsCount - i) ? minGirlsPerTeam : fPool.length);
      for (let g = 0; g < girlsNeeded && fPool.length; g++) team.push(fPool.shift()!);
      while (team.length < 3 && gPool.length) team.push(gPool.shift()!);
      while (team.length < 3 && fPool.length) team.push(fPool.shift()!);
      if (team.length === 3) teams.push(team);
    }
    const made: TriplesMatchRow[] = []; let court = startCourt;
    const list = shuffle(teams);
    while (list.length >= 2) {
      const a = list.shift()!; const b = list.shift()!;
      made.push({
        id: `${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        round: roundIdx,
        court: court++,
        t1: a,
        t2: b,
        girlsNeeded: minGirlsPerTeam,
        scoreText: '',
      });
    }
    return made;
  }

  function onGenerate() {
    const n = clampN(roundsToGen, 1); const out: TriplesMatchRow[] = [];
    const currentMax = matches.reduce((mx, m) => Math.max(mx, m.round), 0) || 0;
    for (let i = 1; i <= n; i++) out.push(...buildRound(currentMax + i));
    setMatches(prev => (Array.isArray(prev) ? prev : []).concat(out));
  }

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Triples)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <label className="flex items-center gap-1">
            Rounds
            <input type="number" min={1} value={roundsToGen} onChange={(e) => setRoundsToGen(clampN(+e.target.value || 1, 1))} className="w-16 border rounded px-2 py-1" />
          </label>
          <label className="flex items-center gap-1">
            Start court
            <input type="number" min={1} value={startCourt} onChange={(e) => setStartCourt(clampN(+e.target.value || 1, 1))} className="w-16 border rounded px-2 py-1" />
          </label>
          <label className="flex items-center gap-1">
            Min girls / team
            <input type="number" min={0} max={3} value={minGirlsPerTeam} onChange={(e) => setMinGirlsPerTeam(clampN(+e.target.value || 0, 0))} className="w-16 border rounded px-2 py-1" />
          </label>
          <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]" onClick={onGenerate}>Generate</button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Triples uses teams of 3 and tries to honor the minimum girls-per-team setting whenever the roster makes that possible.</p>
    </section>
  );
}

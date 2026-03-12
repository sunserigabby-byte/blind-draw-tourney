import React, { useMemo, useState } from 'react';
import type { QuadsMatchRow } from '../types';
import { uniq, slug, shuffle, clampN } from '../utils';

export function QuadsRoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}: {
  guysText: string;
  girlsText: string;
  matches: QuadsMatchRow[];
  setMatches: (f: (prev: QuadsMatchRow[]) => QuadsMatchRow[] | QuadsMatchRow[]) => void;
}) {
  const [strict, setStrict] = useState(true);
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);

  const guys = useMemo(() => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)), [guysText]);
  const girls = useMemo(() => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)), [girlsText]);

  const buildOpponentMap = (history: QuadsMatchRow[]) => {
    const mp = new Map<string, Set<string>>();
    for (const m of history) {
      const t1 = m.t1, t2 = m.t2;
      for (const a of t1) for (const b of t2) {
        const A = slug(a), B = slug(b);
        if (!mp.has(A)) mp.set(A, new Set());
        mp.get(A)!.add(B);
      }
      for (const a of t2) for (const b of t1) {
        const A = slug(a), B = slug(b);
        if (!mp.has(A)) mp.set(A, new Set());
        mp.get(A)!.add(B);
      }
    }
    return mp;
  };

  const haventOpposedTeam = (mp: Map<string, Set<string>>, teamA: string[], teamB: string[]) => {
    if (!strict) return true;
    for (const a of teamA) {
      const set = mp.get(slug(a));
      if (!set) continue;
      for (const b of teamB) {
        if (set.has(slug(b))) return false;
      }
    }
    return true;
  };

  function buildRound(roundIdx: number, history: QuadsMatchRow[]) {
    const G = shuffle(guys);
    const H = shuffle(girls);

    const opponentMap = buildOpponentMap(history);

    const totalPlayers = G.length + H.length;
    const maxQuadsByCounts = Math.min(Math.floor(G.length / 2), Math.floor(H.length / 2));

    let quadsToMake = maxQuadsByCounts;
    for (let q = maxQuadsByCounts; q >= 0; q--) {
      const leftover = totalPlayers - 4 * q;
      if (leftover === 0 || leftover === 3 || leftover === 6) {
        quadsToMake = q;
        break;
      }
    }

    const teams: { members: string[]; isTriple: boolean }[] = [];
    let gIdx = 0, hIdx = 0;

    for (let i = 0; i < quadsToMake; i++) {
      const tGuys = G.slice(gIdx, gIdx + 2);
      const tGirls = H.slice(hIdx, hIdx + 2);
      gIdx += 2; hIdx += 2;
      teams.push({ members: [...tGuys, ...tGirls], isTriple: false });
    }

    const leftovers = [...G.slice(gIdx), ...H.slice(hIdx)];
    for (let i = 0; i + 2 < leftovers.length; i += 3) {
      const t = leftovers.slice(i, i + 3);
      teams.push({ members: t, isTriple: true });
    }

    const teamList = teams.slice();
    const made: QuadsMatchRow[] = [];
    let court = startCourt;

    while (teamList.length >= 2) {
      const a = teamList.shift()!;
      let idx = 0, found = false;
      for (let i = 0; i < teamList.length; i++) {
        const b = teamList[i];
        if (haventOpposedTeam(opponentMap, a.members, b.members)) {
          idx = i; found = true; break;
        }
      }
      const b = teamList.splice(found ? idx : 0, 1)[0];

      for (const A of a.members) {
        const SA = slug(A);
        const set = opponentMap.get(SA) || new Set<string>();
        for (const B of b.members) set.add(slug(B));
        opponentMap.set(SA, set);
      }
      for (const A of b.members) {
        const SA = slug(A);
        const set = opponentMap.get(SA) || new Set<string>();
        for (const B of a.members) set.add(slug(B));
        opponentMap.set(SA, set);
      }

      made.push({
        id: `${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        round: roundIdx,
        court: court++,
        t1: a.members,
        t2: b.members,
        isTriple1: a.isTriple,
        isTriple2: b.isTriple,
        scoreText: '',
      });
    }

    return made;
  }

  function onGenerate() {
    const n = clampN(roundsToGen, 1);
    const out: QuadsMatchRow[] = [];
    let history = matches.slice();
    const currentMax = history.reduce((mx, m) => Math.max(mx, m.round), 0) || 0;
    for (let i = 1; i <= n; i++) {
      const roundIdx = currentMax + i;
      const one = buildRound(roundIdx, history);
      out.push(...one);
      history = history.concat(one);
    }
    setMatches(prev => (Array.isArray(prev) ? prev : []).concat(out));
  }

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Quads)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
            />
            Strict no-repeat (opponents)
          </label>
          <label className="flex items-center gap-1">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={(e) => setRoundsToGen(clampN(+e.target.value || 1, 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={(e) => setStartCourt(clampN(+e.target.value || 1, 1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]"
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        Quads engine prioritizes 2 guys + 2 girls per team. Leftover players form up to two Triples teams. Strict mode
        avoids repeat opponents as much as possible.
      </p>
    </section>
  );
}

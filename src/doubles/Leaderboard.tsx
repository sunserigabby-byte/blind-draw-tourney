import React, { useMemo } from 'react';
import type { MatchRow } from '../types';
import { slug, parseScore, isValidDoublesScore } from '../utils';

type Bucket = { name: string; W: number; L: number; PD: number };

export function computeStandings(matches: MatchRow[], guysText: string, girlsText: string) {
  const guysList = Array.from(new Set((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)));
  const girlsList = Array.from(new Set((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)));
  const guysSet = new Set(guysList.map(slug));
  const girlsSet = new Set(girlsList.map(slug));
  const g = new Map<string, Bucket>(), h = new Map<string, Bucket>();
  const ensure = (map: Map<string, Bucket>, n: string) => {
    if (!map.has(n)) map.set(n, { name: n, W: 0, L: 0, PD: 0 });
    return map.get(n)!;
  };
  for (const n of guysList) ensure(g, n);
  for (const n of girlsList) ensure(h, n);
  for (const m of matches) {
    const s = parseScore(m.scoreText); if (!s) continue;
    const [a, b] = s;
    if (!isValidDoublesScore(a, b)) continue;
    const t1 = [m.t1p1, m.t1p2], t2 = [m.t2p1, m.t2p2];
    const diff = Math.abs(a - b);
    const t1Won = a > b;
    const apply = (name: string, won: boolean) => {
      const map = guysSet.has(slug(name)) ? g : h;
      const row = ensure(map, name);
      if (won) { row.W++; row.PD += diff; } else { row.L++; row.PD -= diff; }
    };
    for (const p of t1) apply(p, t1Won);
    for (const p of t2) apply(p, !t1Won);
  }
  const sortRows = (arr: Bucket[]) => arr.sort((x, y) => y.W - x.W || y.PD - x.PD || x.name.localeCompare(y.name));
  return { guysRows: sortRows(Array.from(g.values())), girlsRows: sortRows(Array.from(h.values())) };
}

export function Leaderboard({
  matches,
  guysText,
  girlsText,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
}) {
  const guysList = useMemo(
    () => Array.from(new Set((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))),
    [guysText],
  );
  const girlsList = useMemo(
    () => Array.from(new Set((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))),
    [girlsText],
  );
  const guysSet = useMemo(() => new Set(guysList.map(slug)), [guysList]);
  const girlsSet = useMemo(() => new Set(girlsList.map(slug)), [girlsList]);

  const baseStats = () => new Map<string, Bucket>();
  const ensure = (map: Map<string, Bucket>, n: string) => {
    if (!map.has(n)) map.set(n, { name: n, W: 0, L: 0, PD: 0 });
    return map.get(n)!;
  };

  const { guysRows, girlsRows } = useMemo(() => {
    const g = baseStats(); const h = baseStats();
    for (const n of guysList) ensure(g, n);
    for (const n of girlsList) ensure(h, n);

    for (const m of matches) {
      const s = parseScore(m.scoreText); if (!s) continue;
      const [a, b] = s;
      if (!isValidDoublesScore(a, b)) continue;
      const t1 = [m.t1p1, m.t1p2], t2 = [m.t2p1, m.t2p2];
      const diff = Math.abs(a - b); const t1Won = a > b;
      const apply = (name: string, won: boolean) => {
        const key = name;
        const isGuy = guysSet.has(slug(name));
        const isGirl = girlsSet.has(slug(name));
        const map = isGuy ? g : isGirl ? h : g;
        const row = ensure(map, key);
        if (won) { row.W++; row.PD += diff; } else { row.L++; row.PD -= diff; }
      };
      for (const p of t1) apply(p, t1Won);
      for (const p of t2) apply(p, !t1Won);
    }

    const sortRows = (arr: Bucket[]) =>
      arr.sort((x, y) => y.W - x.W || y.PD - x.PD || x.name.localeCompare(y.name));
    return {
      guysRows: sortRows(Array.from(g.values())),
      girlsRows: sortRows(Array.from(h.values())),
    };
  }, [matches, guysList, girlsList, guysSet, girlsSet]);

  const Table = ({ title, rows }: { title: string; rows: Bucket[] }) => (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[15px] font-semibold text-sky-800 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 px-2">#</th>
              <th className="py-1 px-2">Player</th>
              <th className="py-1 px-2">W</th>
              <th className="py-1 px-2">L</th>
              <th className="py-1 px-2">PD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-t">
                <td className="py-1 px-2 tabular-nums">{i + 1}</td>
                <td className="py-1 px-2">{r.name}</td>
                <td className="py-1 px-2 tabular-nums">{r.W}</td>
                <td className="py-1 px-2 tabular-nums">{r.L}</td>
                <td className="py-1 px-2 tabular-nums">{r.PD}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section>
      <h2 className="text-[18px] font-bold text-sky-900 mb-1">Leaderboard (Doubles – Live)</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Pool (doubles): one game to 21+, win by 2, no cap. W/L/PD auto-update as you type scores.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Table title="Guys Standings" rows={guysRows} />
        <Table title="Girls Standings" rows={girlsRows} />
      </div>
    </section>
  );
}

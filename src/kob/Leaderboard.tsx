import React, { useMemo } from 'react';
import type { KobGameRow } from '../types';
import { slug, uniq, parseScore, isValidKobScore } from '../utils';

type PlayerStats = {
  name: string;
  W: number;
  L: number;
  PF: number;
  PA: number;
  GP: number;
};

function computeStandings(games: KobGameRow[], roster: string[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  for (const p of roster) {
    stats.set(slug(p), { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 });
  }

  for (const g of games) {
    const parsed = parseScore(g.scoreText);
    if (!parsed || !isValidKobScore(parsed[0], parsed[1])) continue;

    const [s1, s2] = parsed;
    const t1Win = s1 > s2;

    for (const p of g.t1) {
      const key = slug(p);
      const cur = stats.get(key) ?? { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 };
      stats.set(key, {
        ...cur,
        W: cur.W + (t1Win ? 1 : 0),
        L: cur.L + (t1Win ? 0 : 1),
        PF: cur.PF + s1,
        PA: cur.PA + s2,
        GP: cur.GP + 1,
      });
    }

    for (const p of g.t2) {
      const key = slug(p);
      const cur = stats.get(key) ?? { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 };
      stats.set(key, {
        ...cur,
        W: cur.W + (t1Win ? 0 : 1),
        L: cur.L + (t1Win ? 1 : 0),
        PF: cur.PF + s2,
        PA: cur.PA + s1,
        GP: cur.GP + 1,
      });
    }
  }

  // Keep only players who appeared in at least 1 game
  return [...stats.values()]
    .filter(s => s.GP > 0)
    .sort((a, b) => {
      if (b.W !== a.W) return b.W - a.W;
      const pdA = a.PF - a.PA;
      const pdB = b.PF - b.PA;
      if (pdB !== pdA) return pdB - pdA;
      return b.PF - a.PF;
    });
}

function StandingsTable({
  standings,
  title,
  accentClass,
  maxGames,
}: {
  standings: PlayerStats[];
  title: string;
  accentClass: string;
  maxGames: number;
}) {
  if (standings.length === 0) {
    return (
      <div>
        <div className={`font-semibold text-[13px] mb-2 ${accentClass}`}>{title}</div>
        <p className="text-[12px] text-slate-400 italic">No players yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className={`font-semibold text-[13px] mb-2 ${accentClass}`}>{title}</div>
      <table className="min-w-full text-[12px]">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-1 pr-1">#</th>
            <th className="py-1 pr-3">Player</th>
            <th className="py-1 pr-2 text-center">W</th>
            <th className="py-1 pr-2 text-center">L</th>
            <th className="py-1 pr-2 text-center">PD</th>
            <th className="py-1 text-center">PF</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const pd = s.PF - s.PA;
            const isLeader = i === 0 && s.GP >= maxGames;
            return (
              <tr
                key={s.name}
                className={`border-t ${
                  isLeader ? 'bg-amber-50' : i === 1 ? 'bg-slate-50/60' : ''
                }`}
              >
                <td className="py-1 pr-1 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-3 font-medium">
                  {isLeader && <span className="mr-1">👑</span>}
                  {s.name}
                  {s.GP < maxGames && (
                    <span className="ml-1 text-[10px] text-slate-400">({s.GP}gp)</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-center tabular-nums text-emerald-700 font-semibold">
                  {s.W}
                </td>
                <td className="py-1 pr-2 text-center tabular-nums text-red-500">{s.L}</td>
                <td
                  className={`py-1 pr-2 text-center tabular-nums font-medium ${
                    pd > 0 ? 'text-emerald-700' : pd < 0 ? 'text-red-500' : 'text-slate-500'
                  }`}
                >
                  {pd > 0 ? '+' : ''}
                  {pd}
                </td>
                <td className="py-1 text-center tabular-nums text-slate-600">{s.PF}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-1">
        Ranked: Wins → Point Differential → Points For
      </p>
    </div>
  );
}

export function KobLeaderboard({
  games,
  guysText,
  girlsText,
}: {
  games: KobGameRow[];
  guysText: string;
  girlsText: string;
}) {
  const guys = useMemo(
    () => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [guysText],
  );
  const girls = useMemo(
    () => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [girlsText],
  );

  // Players who have actually played (appear in any game)
  const activeSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const g of games) {
      [...g.t1, ...g.t2].forEach(p => s.add(slug(p)));
    }
    return s;
  }, [games]);

  const activeGuys = useMemo(
    () => guys.filter(p => activeSlugs.has(slug(p))),
    [guys, activeSlugs],
  );
  const activeGirls = useMemo(
    () => girls.filter(p => activeSlugs.has(slug(p))),
    [girls, activeSlugs],
  );

  const kobStandings = useMemo(() => computeStandings(games, activeGuys), [games, activeGuys]);
  const qobStandings = useMemo(() => computeStandings(games, activeGirls), [games, activeGirls]);

  // Max games any player has played (for "full pool" crown indicator)
  const maxGames = useMemo(
    () => Math.max(0, ...[...kobStandings, ...qobStandings].map(s => s.GP)),
    [kobStandings, qobStandings],
  );

  if (games.length === 0) return null;

  const totalPools = uniq(games.map(g => g.pool)).length;
  const scoredGames = games.filter(g => {
    const p = parseScore(g.scoreText);
    return p && isValidKobScore(p[0], p[1]);
  }).length;

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-1 tracking-tight">
        Standings — KOB / QOB
      </h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-3" />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-[11px] text-slate-500">
          {totalPools} pool{totalPools !== 1 ? 's' : ''} · {scoredGames}/{games.length} games
          scored
        </span>
        <span className="text-[11px] text-slate-400">
          👑 = leader with full pool complete · ranked by W → PD → PF
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <StandingsTable
          standings={kobStandings}
          title="👑 King of the Beach (Men)"
          accentClass="text-blue-700"
          maxGames={maxGames}
        />
        <StandingsTable
          standings={qobStandings}
          title="👑 Queen of the Beach (Women)"
          accentClass="text-pink-700"
          maxGames={maxGames}
        />
      </div>
    </section>
  );
}

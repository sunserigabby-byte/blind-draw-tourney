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
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 1 : 0), L: cur.L + (t1Win ? 0 : 1), PF: cur.PF + s1, PA: cur.PA + s2, GP: cur.GP + 1 });
    }
    for (const p of g.t2) {
      const key = slug(p);
      const cur = stats.get(key) ?? { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 };
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 0 : 1), L: cur.L + (t1Win ? 1 : 0), PF: cur.PF + s2, PA: cur.PA + s1, GP: cur.GP + 1 });
    }
  }

  return [...stats.values()]
    .filter(s => s.GP > 0)
    .sort((a, b) => {
      if (b.W !== a.W) return b.W - a.W;
      const pd = (b.PF - b.PA) - (a.PF - a.PA);
      if (pd !== 0) return pd;
      return b.PF - a.PF;
    });
}

function PoolStandingsTable({
  standings,
  title,
  accentClass,
  maxGP,
}: {
  standings: PlayerStats[];
  title: string;
  accentClass: string;
  maxGP: number;
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
            const isTop = i < 4;
            return (
              <tr
                key={s.name}
                className={`border-t ${isTop ? 'bg-sky-50/40' : ''}`}
              >
                <td className="py-1 pr-1 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-3 font-medium">
                  {isTop && (
                    <span className="inline-block w-3 h-3 rounded-full bg-sky-400 mr-1 align-middle" title="Qualifies for finals" />
                  )}
                  {s.name}
                  {s.GP < maxGP && (
                    <span className="ml-1 text-[10px] text-slate-400">({s.GP}gp)</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-center tabular-nums text-emerald-700 font-semibold">{s.W}</td>
                <td className="py-1 pr-2 text-center tabular-nums text-red-500">{s.L}</td>
                <td className={`py-1 pr-2 text-center tabular-nums font-medium ${pd > 0 ? 'text-emerald-700' : pd < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                  {pd > 0 ? '+' : ''}{pd}
                </td>
                <td className="py-1 text-center tabular-nums text-slate-600">{s.PF}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-1">
        🔵 = top 4, qualifies for finals · W → PD → PF
      </p>
    </div>
  );
}

function FinalsResultsTable({
  standings,
  label,
  isComplete,
}: {
  standings: PlayerStats[];
  label: string;
  isComplete: boolean;
}) {
  if (standings.length === 0) return null;

  const champion = standings[0];
  const isKob = label === 'KOB';

  return (
    <div className={`border-2 rounded-xl p-4 ${isKob ? 'border-blue-200 bg-blue-50/30' : 'border-pink-200 bg-pink-50/30'}`}>
      {/* Champion banner */}
      {isComplete && (
        <div className={`flex items-center gap-3 mb-3 p-3 rounded-lg ${isKob ? 'bg-blue-100' : 'bg-pink-100'}`}>
          <span className="text-3xl">👑</span>
          <div>
            <div className={`font-bold text-[15px] ${isKob ? 'text-blue-800' : 'text-pink-800'}`}>
              {isKob ? 'King of the Beach' : 'Queen of the Beach'}
            </div>
            <div className={`text-[18px] font-extrabold ${isKob ? 'text-blue-900' : 'text-pink-900'}`}>
              {champion.name}
            </div>
            <div className="text-[11px] text-slate-500">
              {champion.W}W – {champion.L}L · PD {champion.PF - champion.PA > 0 ? '+' : ''}{champion.PF - champion.PA}
            </div>
          </div>
        </div>
      )}

      <div className={`font-semibold text-[13px] mb-2 ${isKob ? 'text-blue-700' : 'text-pink-700'}`}>
        {isKob ? 'KOB Finals Standings' : 'QOB Finals Standings'}
        {!isComplete && <span className="ml-2 text-[10px] font-normal text-slate-400">(in progress)</span>}
      </div>

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
            return (
              <tr key={s.name} className={`border-t ${i === 0 && isComplete ? (isKob ? 'bg-blue-50' : 'bg-pink-50') : ''}`}>
                <td className="py-1 pr-1 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-3 font-medium">
                  {i === 0 && isComplete && <span className="mr-1">👑</span>}
                  {s.name}
                </td>
                <td className="py-1 pr-2 text-center tabular-nums text-emerald-700 font-semibold">{s.W}</td>
                <td className="py-1 pr-2 text-center tabular-nums text-red-500">{s.L}</td>
                <td className={`py-1 pr-2 text-center tabular-nums font-medium ${pd > 0 ? 'text-emerald-700' : pd < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                  {pd > 0 ? '+' : ''}{pd}
                </td>
                <td className="py-1 text-center tabular-nums text-slate-600">{s.PF}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-1">Finals ranked: W → PD → PF</p>
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

  const poolGames = useMemo(() => games.filter(g => !g.isFinals), [games]);
  const kobFinalsGames = useMemo(() => games.filter(g => g.pool === 1001), [games]);
  const qobFinalsGames = useMemo(() => games.filter(g => g.pool === 1002), [games]);

  // Players who have actually appeared in pool games
  const activeSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const g of poolGames) [...g.t1, ...g.t2].forEach(p => s.add(slug(p)));
    return s;
  }, [poolGames]);

  const activeGuys = useMemo(() => guys.filter(p => activeSlugs.has(slug(p))), [guys, activeSlugs]);
  const activeGirls = useMemo(() => girls.filter(p => activeSlugs.has(slug(p))), [girls, activeSlugs]);

  const kobPoolStandings = useMemo(() => computeStandings(poolGames, activeGuys), [poolGames, activeGuys]);
  const qobPoolStandings = useMemo(() => computeStandings(poolGames, activeGirls), [poolGames, activeGirls]);

  // Finals — use all players who appear in finals games as roster
  const kobFinalistsRoster = useMemo(
    () => Array.from(new Set(kobFinalsGames.flatMap(g => [...g.t1, ...g.t2]))),
    [kobFinalsGames],
  );
  const qobFinalistsRoster = useMemo(
    () => Array.from(new Set(qobFinalsGames.flatMap(g => [...g.t1, ...g.t2]))),
    [qobFinalsGames],
  );

  const kobFinalsStandings = useMemo(
    () => computeStandings(kobFinalsGames, kobFinalistsRoster),
    [kobFinalsGames, kobFinalistsRoster],
  );
  const qobFinalsStandings = useMemo(
    () => computeStandings(qobFinalsGames, qobFinalistsRoster),
    [qobFinalsGames, qobFinalistsRoster],
  );

  const kobFinalsComplete = useMemo(
    () =>
      kobFinalsGames.length > 0 &&
      kobFinalsGames.every(g => {
        const p = parseScore(g.scoreText);
        return p && isValidKobScore(p[0], p[1]);
      }),
    [kobFinalsGames],
  );
  const qobFinalsComplete = useMemo(
    () =>
      qobFinalsGames.length > 0 &&
      qobFinalsGames.every(g => {
        const p = parseScore(g.scoreText);
        return p && isValidKobScore(p[0], p[1]);
      }),
    [qobFinalsGames],
  );

  const maxGP = useMemo(
    () => Math.max(0, ...[...kobPoolStandings, ...qobPoolStandings].map(s => s.GP)),
    [kobPoolStandings, qobPoolStandings],
  );

  const totalPools = useMemo(() => uniq(poolGames.map(g => g.pool)).length, [poolGames]);
  const scoredPoolGames = poolGames.filter(g => {
    const p = parseScore(g.scoreText);
    return p && isValidKobScore(p[0], p[1]);
  }).length;

  const hasFinalsData = kobFinalsGames.length > 0 || qobFinalsGames.length > 0;

  if (games.length === 0) return null;

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-1 tracking-tight">
        Standings — KOB / QOB
      </h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-3" />

      {/* ── Finals Results (shown first if they exist) ── */}
      {hasFinalsData && (
        <div className="mb-6">
          <div className="text-[13px] font-semibold text-amber-700 mb-3">🏆 Finals Results</div>
          <div className="grid md:grid-cols-2 gap-4">
            {kobFinalsGames.length > 0 && (
              <FinalsResultsTable
                standings={kobFinalsStandings}
                label="KOB"
                isComplete={kobFinalsComplete}
              />
            )}
            {qobFinalsGames.length > 0 && (
              <FinalsResultsTable
                standings={qobFinalsStandings}
                label="QOB"
                isComplete={qobFinalsComplete}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Pool Play Standings ── */}
      {poolGames.length > 0 && (
        <>
          <div className="text-[13px] font-semibold text-slate-600 mb-1">
            Pool Play Standings
          </div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-[11px] text-slate-500">
              {totalPools} pool{totalPools !== 1 ? 's' : ''} · {scoredPoolGames}/{poolGames.length} games scored
            </span>
            <span className="text-[11px] text-slate-400">🔵 top 4 qualify for finals</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <PoolStandingsTable
              standings={kobPoolStandings}
              title="Men (KOB)"
              accentClass="text-blue-700"
              maxGP={maxGP}
            />
            <PoolStandingsTable
              standings={qobPoolStandings}
              title="Women (QOB)"
              accentClass="text-pink-700"
              maxGP={maxGP}
            />
          </div>
        </>
      )}
    </section>
  );
}

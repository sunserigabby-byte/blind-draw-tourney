import React, { useMemo } from 'react';
import type { KobGameRow } from '../types';
import { slug, uniq, parseScore, isValidKobScore } from '../utils';

type PlayerStats = { name: string; W: number; L: number; PF: number; PA: number; GP: number };

function computeStandings(games: KobGameRow[], roster: string[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  for (const p of roster) stats.set(slug(p), { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 });

  for (const g of games) {
    const parsed = parseScore(g.scoreText);
    if (!parsed || !isValidKobScore(parsed[0], parsed[1])) continue;
    const [s1, s2] = parsed;
    const t1Win = s1 > s2;
    for (const p of g.t1) {
      const key = slug(p);
      if (!stats.has(key)) continue; // only track roster players
      const cur = stats.get(key)!;
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 1 : 0), L: cur.L + (t1Win ? 0 : 1), PF: cur.PF + s1, PA: cur.PA + s2, GP: cur.GP + 1 });
    }
    for (const p of g.t2) {
      const key = slug(p);
      if (!stats.has(key)) continue; // only track roster players
      const cur = stats.get(key)!;
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 0 : 1), L: cur.L + (t1Win ? 1 : 0), PF: cur.PF + s2, PA: cur.PA + s1, GP: cur.GP + 1 });
    }
  }

  return [...stats.values()]
    .filter(s => s.GP > 0)
    .sort((a, b) => {
      if (b.W !== a.W) return b.W - a.W;
      const pd = (b.PF - b.PA) - (a.PF - a.PA);
      return pd !== 0 ? pd : b.PF - a.PF;
    });
}

function isFullyScored(games: KobGameRow[]) {
  return games.length > 0 && games.every(g => {
    const p = parseScore(g.scoreText);
    return p && isValidKobScore(p[0], p[1]);
  });
}

// ── Pool standings table ───────────────────────────────────────────────────────
function PoolStandingsTable({
  standings, title, accentClass, maxGP, qualifyCount,
}: {
  standings: PlayerStats[];
  title: string;
  accentClass: string;
  maxGP: number;
  qualifyCount: number;
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
            const qualifies = i < qualifyCount;
            return (
              <tr key={s.name} className={`border-t ${qualifies ? 'bg-sky-50/50' : ''}`}>
                <td className="py-1 pr-1 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-3 font-medium">
                  {qualifies && <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 mr-1 align-middle" title="Qualifies for Gold Finals" />}
                  {s.name}
                  {s.GP < maxGP && <span className="ml-1 text-[10px] text-slate-400">({s.GP}gp)</span>}
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
      <p className="text-[10px] text-slate-400 mt-1">🔵 top {qualifyCount} qualify for Gold Finals · W → PD → PF</p>
    </div>
  );
}

// ── Finals results card ────────────────────────────────────────────────────────
function FinalsCard({
  standings, label, tier, isComplete,
}: {
  standings: PlayerStats[];
  label: string;
  tier: 'gold' | 'silver';
  isComplete: boolean;
}) {
  if (standings.length === 0) return null;

  const champion = standings[0];
  const isGold = tier === 'gold';
  const isKob  = label.includes('KOB') || label.includes('Men');

  const border = isGold
    ? isKob ? 'border-blue-200 bg-blue-50/30' : 'border-pink-200 bg-pink-50/30'
    : 'border-slate-200 bg-slate-50/30';

  const accent = isGold
    ? isKob ? 'text-blue-700' : 'text-pink-700'
    : 'text-slate-600';

  const championBg = isGold
    ? isKob ? 'bg-blue-100' : 'bg-pink-100'
    : 'bg-slate-100';

  const championText = isGold
    ? isKob ? 'text-blue-900' : 'text-pink-900'
    : 'text-slate-800';

  const rowBg = isGold
    ? isKob ? 'bg-blue-50' : 'bg-pink-50'
    : 'bg-slate-100';

  return (
    <div className={`border-2 rounded-xl p-4 ${border}`}>
      {/* Champion banner — only after ALL games scored */}
      {isComplete && (
        <div className={`flex items-center gap-3 mb-3 p-3 rounded-lg ${championBg}`}>
          <span className="text-3xl">{isGold ? '👑' : '🥈'}</span>
          <div>
            <div className={`font-bold text-[13px] ${accent}`}>
              {isGold ? (isKob ? 'King of the Beach' : 'Queen of the Beach') : label}
            </div>
            <div className={`text-[18px] font-extrabold ${championText}`}>{champion.name}</div>
            <div className="text-[11px] text-slate-500">
              {champion.W}W – {champion.L}L · PD {champion.PF - champion.PA > 0 ? '+' : ''}{champion.PF - champion.PA}
            </div>
          </div>
        </div>
      )}

      <div className={`font-semibold text-[12px] mb-2 ${accent}`}>
        {label}
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
              <tr key={s.name} className={`border-t ${i === 0 && isComplete ? rowBg : ''}`}>
                <td className="py-1 pr-1 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-3 font-medium">
                  {i === 0 && isComplete && <span className="mr-1">{isGold ? '👑' : '🥈'}</span>}
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

// ── Main export ────────────────────────────────────────────────────────────────
export function KobLeaderboard({
  games, guysText, girlsText,
}: {
  games: KobGameRow[];
  guysText: string;
  girlsText: string;
}) {
  const guys  = useMemo(() => uniq((guysText  || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)), [guysText]);
  const girls = useMemo(() => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)), [girlsText]);

  // Pool play: KOB = pools 1-499, QOB = pools 501-999
  const kobPoolGames   = useMemo(() => games.filter(g => !g.isFinals && g.pool >= 1   && g.pool <= 499), [games]);
  const qobPoolGames   = useMemo(() => games.filter(g => !g.isFinals && g.pool >= 501 && g.pool <= 999), [games]);
  const goldKobGames   = useMemo(() => games.filter(g => g.pool === 1001), [games]);
  const goldQobGames   = useMemo(() => games.filter(g => g.pool === 1002), [games]);
  const silverKobGames = useMemo(() => games.filter(g => g.pool === 1011), [games]);
  const silverQobGames = useMemo(() => games.filter(g => g.pool === 1012), [games]);

  // Active roster = players who've actually appeared in pool games (by gender range)
  const activeKobSlugs = useMemo(() => {
    const s = new Set<string>();
    kobPoolGames.forEach(g => [...g.t1, ...g.t2].forEach(p => s.add(slug(p))));
    return s;
  }, [kobPoolGames]);
  const activeQobSlugs = useMemo(() => {
    const s = new Set<string>();
    qobPoolGames.forEach(g => [...g.t1, ...g.t2].forEach(p => s.add(slug(p))));
    return s;
  }, [qobPoolGames]);

  const activeGuys  = useMemo(() => guys.filter(p => activeKobSlugs.has(slug(p))), [guys, activeKobSlugs]);
  const activeGirls = useMemo(() => girls.filter(p => activeQobSlugs.has(slug(p))), [girls, activeQobSlugs]);

  const kobPoolStandings = useMemo(() => computeStandings(kobPoolGames, activeGuys),  [kobPoolGames, activeGuys]);
  const qobPoolStandings = useMemo(() => computeStandings(qobPoolGames, activeGirls), [qobPoolGames, activeGirls]);

  // Finals standings — roster derived from the games themselves
  const finalsRoster = (fGames: KobGameRow[]) =>
    Array.from(new Set(fGames.flatMap(g => [...g.t1, ...g.t2])));

  const goldKobStandings   = useMemo(() => computeStandings(goldKobGames,   finalsRoster(goldKobGames)),   [goldKobGames]);
  const goldQobStandings   = useMemo(() => computeStandings(goldQobGames,   finalsRoster(goldQobGames)),   [goldQobGames]);
  const silverKobStandings = useMemo(() => computeStandings(silverKobGames, finalsRoster(silverKobGames)), [silverKobGames]);
  const silverQobStandings = useMemo(() => computeStandings(silverQobGames, finalsRoster(silverQobGames)), [silverQobGames]);

  const goldKobDone    = useMemo(() => isFullyScored(goldKobGames),   [goldKobGames]);
  const goldQobDone    = useMemo(() => isFullyScored(goldQobGames),   [goldQobGames]);
  const silverKobDone  = useMemo(() => isFullyScored(silverKobGames), [silverKobGames]);
  const silverQobDone  = useMemo(() => isFullyScored(silverQobGames), [silverQobGames]);

  const hasGoldFinals   = goldKobGames.length > 0 || goldQobGames.length > 0;
  const hasSilverFinals = silverKobGames.length > 0 || silverQobGames.length > 0;

  // For the "top N qualify" indicator — estimate gold size from existing finals games
  const goldKobSize = goldKobGames.length > 0
    ? new Set(goldKobGames.flatMap(g => [...g.t1, ...g.t2])).size
    : 4;
  const goldQobSize = goldQobGames.length > 0
    ? new Set(goldQobGames.flatMap(g => [...g.t1, ...g.t2])).size
    : 4;

  const allPoolGames = useMemo(() => [...kobPoolGames, ...qobPoolGames], [kobPoolGames, qobPoolGames]);

  const maxGP = useMemo(
    () => Math.max(0, ...[...kobPoolStandings, ...qobPoolStandings].map(s => s.GP)),
    [kobPoolStandings, qobPoolStandings],
  );
  const totalPools = uniq(allPoolGames.map(g => g.pool)).length;
  const scoredPoolGames = allPoolGames.filter(g => { const p = parseScore(g.scoreText); return p && isValidKobScore(p[0], p[1]); }).length;

  if (games.length === 0) return null;

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-1 tracking-tight">Standings — KOB / QOB</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-3" />

      {/* ── Gold Finals Results ── */}
      {hasGoldFinals && (
        <div className="mb-6">
          <div className="text-[13px] font-semibold text-amber-700 mb-3">🥇 Gold Finals</div>
          <div className="grid md:grid-cols-2 gap-4">
            {goldKobGames.length > 0 && (
              <FinalsCard standings={goldKobStandings} label="KOB Gold — Men" tier="gold" isComplete={goldKobDone} />
            )}
            {goldQobGames.length > 0 && (
              <FinalsCard standings={goldQobStandings} label="QOB Gold — Women" tier="gold" isComplete={goldQobDone} />
            )}
          </div>
        </div>
      )}

      {/* ── Silver Finals Results ── */}
      {hasSilverFinals && (
        <div className="mb-6">
          <div className="text-[13px] font-semibold text-slate-600 mb-3">🥈 Silver Finals — Consolation</div>
          <div className="grid md:grid-cols-2 gap-4">
            {silverKobGames.length > 0 && (
              <FinalsCard standings={silverKobStandings} label="KOB Silver — Men" tier="silver" isComplete={silverKobDone} />
            )}
            {silverQobGames.length > 0 && (
              <FinalsCard standings={silverQobStandings} label="QOB Silver — Women" tier="silver" isComplete={silverQobDone} />
            )}
          </div>
        </div>
      )}

      {/* ── Pool Play Standings ── */}
      {allPoolGames.length > 0 && (
        <>
          <div className="text-[13px] font-semibold text-slate-600 mb-1">Pool Play Standings</div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-[11px] text-slate-500">
              {totalPools} pool{totalPools !== 1 ? 's' : ''} · {scoredPoolGames}/{poolGames.length} games scored
            </span>
            <span className="text-[11px] text-slate-400">🔵 qualifies for Gold Finals</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <PoolStandingsTable
              standings={kobPoolStandings}
              title="Men (KOB)"
              accentClass="text-blue-700"
              maxGP={maxGP}
              qualifyCount={goldKobSize}
            />
            <PoolStandingsTable
              standings={qobPoolStandings}
              title="Women (QOB)"
              accentClass="text-pink-700"
              maxGP={maxGP}
              qualifyCount={goldQobSize}
            />
          </div>
        </>
      )}
    </section>
  );
}

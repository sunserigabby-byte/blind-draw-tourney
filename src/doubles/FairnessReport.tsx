import React, { useMemo, useState } from 'react';
import type { MatchRow } from '../types';
import { slug, firstName, uniq } from '../utils';
import { buildPartnerMap, buildOpponentMap, buildPlayerUsageStats } from './RoundGenerator';

type PlayerEntry = { key: string; label: string; short: string };

// Color coding for how many times two players have interacted.
// Teammate and opponent counts are tracked separately; we use
// whichever is higher for the cell color.
function cellColor(max: number): string {
  if (max === 0) return 'bg-sky-50 text-sky-700';
  if (max === 1) return 'bg-emerald-50 text-emerald-800';
  if (max === 2) return 'bg-amber-50 text-amber-800';
  return 'bg-red-50 text-red-800';
}

function coverageColor(pct: number): string {
  if (pct >= 0.9) return 'bg-emerald-100 text-emerald-800';
  if (pct >= 0.6) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

export function DoublesFairnessReport({
  matches,
  guysText,
  girlsText,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
}) {
  const [show, setShow] = useState(false);

  const { players, partnerMap, opponentMap, usageStats } = useMemo(() => {
    const guys = uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    const girls = uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    const all: PlayerEntry[] = [...guys, ...girls].map(name => ({
      key: slug(name),
      label: name,
      short: firstName(name),
    }));
    return {
      players: all,
      partnerMap: buildPartnerMap(matches),
      opponentMap: buildOpponentMap(matches),
      usageStats: buildPlayerUsageStats(matches),
    };
  }, [matches, guysText, girlsText]);

  if (players.length < 2) return null;

  const roundsPlayed = uniq(matches.map(m => m.round)).length;
  const possible = players.length - 1;

  // Coverage: how many distinct partners/opponents each player has had, out
  // of everyone else they could possibly have played with/against.
  const coverageRows = players.map(p => {
    const partnerCoverage = partnerMap.get(p.key)?.size ?? 0;
    const opponentCoverage = opponentMap.get(p.key)?.size ?? 0;
    return {
      ...p,
      partnerCoverage,
      opponentCoverage,
      partnerPct: possible > 0 ? partnerCoverage / possible : 0,
      opponentPct: possible > 0 ? opponentCoverage / possible : 0,
    };
  });
  const avgPartnerPct = coverageRows.reduce((s, r) => s + r.partnerPct, 0) / coverageRows.length;
  const avgOpponentPct = coverageRows.reduce((s, r) => s + r.opponentPct, 0) / coverageRows.length;
  const minPartnerCoverage = Math.min(...coverageRows.map(r => r.partnerCoverage));
  const minOpponentCoverage = Math.min(...coverageRows.map(r => r.opponentCoverage));

  // Summary stats: worst-repeated interactions
  const worstTeammate = { label: '', count: 0 };
  const worstOpponent = { label: '', count: 0 };
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const tc = partnerMap.get(players[i].key)?.get(players[j].key) ?? 0;
      const oc = opponentMap.get(players[i].key)?.get(players[j].key) ?? 0;
      if (tc > worstTeammate.count) Object.assign(worstTeammate, { label: `${players[i].short} + ${players[j].short}`, count: tc });
      if (oc > worstOpponent.count) Object.assign(worstOpponent, { label: `${players[i].short} vs ${players[j].short}`, count: oc });
    }
  }
  const maxSitOut = Math.max(...players.map(p => usageStats.sitCounts.get(p.key) ?? 0), 0);

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-sky-800">Partner &amp; Opponent Coverage</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tracks how close everyone is to having played with and against everyone else. After {roundsPlayed} round{roundsPlayed === 1 ? '' : 's'}.
          </p>
        </div>
        <button
          onClick={() => setShow(s => !s)}
          className="text-[12px] px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 shrink-0"
        >
          {show ? 'Hide matrix' : 'Show matrix'}
        </button>
      </div>

      {/* Coverage summary chips */}
      <div className="flex flex-wrap gap-2 text-[12px]">
        <span className={`px-2 py-1 rounded-full font-medium ${coverageColor(avgPartnerPct)}`}>
          Avg. partner coverage: <strong>{Math.round(avgPartnerPct * 100)}%</strong> (worst: {minPartnerCoverage} of {possible})
        </span>
        <span className={`px-2 py-1 rounded-full font-medium ${coverageColor(avgOpponentPct)}`}>
          Avg. opponent coverage: <strong>{Math.round(avgOpponentPct * 100)}%</strong> (worst: {minOpponentCoverage} of {possible})
        </span>
        {worstTeammate.count > 0 && (
          <span className={`px-2 py-1 rounded-full font-medium ${worstTeammate.count >= 3 ? 'bg-red-100 text-red-800' : worstTeammate.count >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            Most-repeated teammates: <strong>{worstTeammate.label}</strong> × {worstTeammate.count}
          </span>
        )}
        {worstOpponent.count > 0 && (
          <span className={`px-2 py-1 rounded-full font-medium ${worstOpponent.count >= 3 ? 'bg-red-100 text-red-800' : worstOpponent.count >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            Most-repeated opponents: <strong>{worstOpponent.label}</strong> × {worstOpponent.count}
          </span>
        )}
        {maxSitOut > 0 && (
          <span className={`px-2 py-1 rounded-full font-medium ${maxSitOut >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
            Max sit-outs: {maxSitOut}
          </span>
        )}
        {roundsPlayed === 0 && (
          <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-800 font-medium">
            No rounds generated yet — generate rounds to see coverage data.
          </span>
        )}
      </div>

      {/* Per-player coverage list */}
      {roundsPlayed > 0 && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
          {coverageRows
            .slice()
            .sort((a, b) => (a.partnerPct + a.opponentPct) - (b.partnerPct + b.opponentPct))
            .map(r => (
              <div key={r.key} className="flex items-baseline gap-1.5 text-[12px] py-0.5 border-b border-slate-100 last:border-0">
                <span className="truncate flex-1">{r.label}</span>
                <span className="tabular-nums text-slate-500 shrink-0" title="Distinct partners played with, out of everyone else">
                  P: {r.partnerCoverage}/{possible}
                </span>
                <span className="tabular-nums text-slate-500 shrink-0" title="Distinct opponents faced, out of everyone else">
                  O: {r.opponentCoverage}/{possible}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Color legend */}
      {show && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">0 — never met</span>
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">1 — met once</span>
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">2 — met twice</span>
          <span className="px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">3+ — high repeat</span>
          <span className="text-slate-400 ml-1">Each cell: T = teammate / O = opponent</span>
        </div>
      )}

      {show && (
        <div className="overflow-x-auto">
          <table className="text-[11px] border-collapse min-w-max">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 border border-slate-200 px-2 py-1 text-slate-400 font-normal text-left min-w-[90px]">
                  Player ↓ / Player →
                </th>
                {players.map(p => (
                  <th
                    key={p.key}
                    className="border border-slate-200 px-1.5 py-1 text-center font-medium text-slate-700 whitespace-nowrap min-w-[60px]"
                    title={p.label}
                  >
                    {p.short}
                  </th>
                ))}
                <th className="border border-slate-200 px-1.5 py-1 text-center font-medium text-slate-500 whitespace-nowrap">
                  Sit-outs
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((rowP, i) => {
                const sitOuts = usageStats.sitCounts.get(rowP.key) ?? 0;
                return (
                  <tr key={rowP.key}>
                    <td
                      className="sticky left-0 bg-white z-10 border border-slate-200 px-2 py-1 font-medium text-slate-700 whitespace-nowrap"
                      title={rowP.label}
                    >
                      {rowP.short}
                    </td>
                    {players.map((colP, j) => {
                      if (i === j) {
                        return (
                          <td key={colP.key} className="border border-slate-200 bg-slate-100 text-center text-slate-400 px-1.5 py-1">
                            —
                          </td>
                        );
                      }
                      const tc = partnerMap.get(rowP.key)?.get(colP.key) ?? 0;
                      const oc = opponentMap.get(rowP.key)?.get(colP.key) ?? 0;
                      const maxCount = Math.max(tc, oc);
                      return (
                        <td
                          key={colP.key}
                          className={`border border-slate-200 text-center px-1.5 py-1 ${cellColor(maxCount)}`}
                          title={`${rowP.label} + ${colP.label}: ${tc} as teammates, ${oc} as opponents`}
                        >
                          <span className="font-semibold">{tc}</span>
                          <span className="text-slate-400">/</span>
                          <span className="font-semibold">{oc}</span>
                        </td>
                      );
                    })}
                    <td className={`border border-slate-200 text-center px-1.5 py-1 font-semibold ${sitOuts >= 2 ? 'bg-amber-50 text-amber-800' : sitOuts === 1 ? 'bg-slate-50 text-slate-600' : 'text-slate-300'}`}>
                      {sitOuts > 0 ? sitOuts : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

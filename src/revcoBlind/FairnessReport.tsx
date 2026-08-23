import React, { useMemo, useState } from 'react';
import type { RevcoBDRound } from '../types';
import { parseMickeyPairsGendered, parseMickeyFreeGendered, slug, firstName } from '../utils';
import { buildPairMap, buildPairHistory, pairKey, type PairId } from './pairUtils';

type PairEntry = { id: PairId; label: string; short: string };

// Color coding for how many times two pairs have interacted.
// Teammate and opponent counts are tracked separately; we use
// whichever is higher for the cell color.
function cellColor(max: number): string {
  if (max === 0) return 'bg-sky-50 text-sky-700';
  if (max === 1) return 'bg-emerald-50 text-emerald-800';
  if (max === 2) return 'bg-amber-50 text-amber-800';
  return 'bg-red-50 text-red-800';
}

export function RevcoBDFairnessReport({
  rounds,
  pairsText,
  freeAgentsText,
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
}) {
  const [show, setShow] = useState(false);

  const { pairs, history } = useMemo(() => {
    const pairMap = buildPairMap(pairsText, freeAgentsText);
    const hist = buildPairHistory(rounds, pairMap);

    const registered: PairEntry[] = parseMickeyPairsGendered(pairsText).map(members => {
      const slugs = members.map(m => slug(m.name)).sort();
      const id = slugs.join('|');
      const names = members.map(m => m.name);
      return {
        id,
        label: names.join(' & '),
        short: names.map(n => firstName(n)).join(' & '),
      };
    });
    const freeAgents: PairEntry[] = parseMickeyFreeGendered(freeAgentsText).map(m => {
      const id = slug(m.name);
      return { id, label: m.name, short: firstName(m.name) };
    });

    return { pairs: [...registered, ...freeAgents], history: hist };
  }, [rounds, pairsText, freeAgentsText]);

  if (pairs.length < 2) return null;

  const roundsPlayed = rounds.length;

  // Summary stats: find the most-repeated pair interactions
  const worstTeammate = { label: '', count: 0 };
  const worstOpponent = { label: '', count: 0 };
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const key = pairKey(pairs[i].id, pairs[j].id);
      const tc = history.teammateCount.get(key) ?? 0;
      const oc = history.opponentCount.get(key) ?? 0;
      if (tc > worstTeammate.count) Object.assign(worstTeammate, { label: `${pairs[i].short} + ${pairs[j].short}`, count: tc });
      if (oc > worstOpponent.count) Object.assign(worstOpponent, { label: `${pairs[i].short} vs ${pairs[j].short}`, count: oc });
    }
  }
  const maxSitOut = Math.max(...pairs.map(p => history.sitOutCount.get(p.id) ?? 0), 0);

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-sky-800">Pair Interaction Report</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tracks how often every pair has been teammates or opponents. After {roundsPlayed} round{roundsPlayed === 1 ? '' : 's'}.
          </p>
        </div>
        <button
          onClick={() => setShow(s => !s)}
          className="text-[12px] px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 shrink-0"
        >
          {show ? 'Hide matrix' : 'Show matrix'}
        </button>
      </div>

      {/* Quick summary chips */}
      <div className="flex flex-wrap gap-2 text-[12px]">
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
        {worstTeammate.count === 0 && worstOpponent.count === 0 && (
          <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-800 font-medium">
            No rounds drawn yet — generate rounds to see interaction data.
          </span>
        )}
      </div>

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
                {/* Top-left corner cell */}
                <th className="sticky left-0 bg-white z-10 border border-slate-200 px-2 py-1 text-slate-400 font-normal text-left min-w-[90px]">
                  Pair ↓ / Pair →
                </th>
                {pairs.map(p => (
                  <th
                    key={p.id}
                    className="border border-slate-200 px-1.5 py-1 text-center font-medium text-slate-700 whitespace-nowrap min-w-[72px]"
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
              {pairs.map((rowPair, i) => {
                const sitOuts = history.sitOutCount.get(rowPair.id) ?? 0;
                return (
                  <tr key={rowPair.id}>
                    <td
                      className="sticky left-0 bg-white z-10 border border-slate-200 px-2 py-1 font-medium text-slate-700 whitespace-nowrap"
                      title={rowPair.label}
                    >
                      {rowPair.short}
                    </td>
                    {pairs.map((colPair, j) => {
                      if (i === j) {
                        return (
                          <td key={colPair.id} className="border border-slate-200 bg-slate-100 text-center text-slate-400 px-1.5 py-1">
                            —
                          </td>
                        );
                      }
                      const key = pairKey(rowPair.id, colPair.id);
                      const tc = history.teammateCount.get(key) ?? 0;
                      const oc = history.opponentCount.get(key) ?? 0;
                      const maxCount = Math.max(tc, oc);
                      return (
                        <td
                          key={colPair.id}
                          className={`border border-slate-200 text-center px-1.5 py-1 ${cellColor(maxCount)}`}
                          title={`${rowPair.label} + ${colPair.label}: ${tc} as teammates, ${oc} as opponents`}
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

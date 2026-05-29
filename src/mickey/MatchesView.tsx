import React, { useMemo } from 'react';
import type { MickeyTeam, MickeyMatchRow, ScoreSettings } from '../types';
import { uniq, parseScore, isValidScore, mickeyTeamLabel } from '../utils';

function ScoreCell({
  value,
  onChange,
  teamA,
  teamB,
  isAdmin,
  scoreSettings,
}: {
  value: string;
  onChange: (v: string) => void;
  teamA: string;
  teamB: string;
  isAdmin?: boolean;
  scoreSettings: ScoreSettings;
}) {
  const parsed = parseScore(value);
  const scored = parsed && parsed[0] !== parsed[1];
  const matchesRules = parsed ? isValidScore(parsed[0], parsed[1], scoreSettings) : false;
  const valid = !value || matchesRules;
  const warning = scored && !matchesRules;
  const winner = scored ? (parsed![0] > parsed![1] ? teamA : teamB) : null;

  return (
    <div className="flex flex-col gap-0.5">
      <input
        className={
          'w-24 border rounded px-2 py-1 text-[12px] ' +
          (warning ? 'border-amber-400 bg-amber-50' : valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
        }
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`to ${scoreSettings.playTo}${scoreSettings.cap ? ', cap ' + scoreSettings.cap : ''}`}
        title={warning ? `Score doesn't match current rules (play to ${scoreSettings.playTo}${scoreSettings.cap ? ', cap ' + scoreSettings.cap : ', no cap'})` : ''}
        readOnly={!isAdmin}
      />
      {winner && (
        <span className="text-[10px] text-emerald-700 font-medium truncate max-w-[6rem]" title={`${winner} won`}>
          {winner} ✓
        </span>
      )}
    </div>
  );
}

export function MickeyMatchesView({
  matches,
  setMatches,
  teams,
  pairsText = '',
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
}: {
  matches: MickeyMatchRow[];
  setMatches: (f: ((prev: MickeyMatchRow[]) => MickeyMatchRow[]) | MickeyMatchRow[]) => void;
  teams: MickeyTeam[];
  pairsText?: string;
  isAdmin?: boolean;
  scoreSettings?: ScoreSettings;
}) {
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, mickeyTeamLabel(t, pairsText));
    return (id: string) => m.get(id) ?? '(deleted team)';
  }, [teams, pairsText]);

  const pools = useMemo(
    () => uniq(matches.map(m => m.pool)).sort((a, b) => a - b),
    [matches],
  );

  const update = (id: string, patch: Partial<MickeyMatchRow>) =>
    setMatches(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Pool Matchups & Results</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {pools.length === 0 && (
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No matchups yet. Build your teams above, then click <span className="font-medium">Generate Pool Matchups</span>.
        </p>
      )}

      <div className="mt-2 space-y-6">
        {pools.map(pool => {
          const poolMatches = matches.filter(m => m.pool === pool);
          return (
            <div key={pool} className="border rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="px-3 py-2 bg-slate-50/80 border-b font-medium text-[14px] text-slate-800">
                Pool {pool}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-1 px-2">Team A</th>
                      <th className="py-1 px-2">Team B</th>
                      <th className="py-1 px-2">Mickey <span className="text-[10px] text-slate-400">(coed)</span></th>
                      <th className="py-1 px-2">Minnie <span className="text-[10px] text-slate-400">(revco)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolMatches.map((m, idx) => {
                      const a = nameOf(m.teamAId);
                      const b = nameOf(m.teamBId);
                      return (
                        <tr key={m.id} className={'border-t align-top ' + (idx % 2 ? 'bg-slate-50/60 ' : '')}>
                          <td className="py-1.5 px-2">{a}</td>
                          <td className="py-1.5 px-2">{b}</td>
                          <td className="py-1.5 px-2">
                            <ScoreCell
                              value={m.mickeyScore || ''}
                              onChange={v => update(m.id, { mickeyScore: v })}
                              teamA={a}
                              teamB={b}
                              isAdmin={isAdmin}
                              scoreSettings={scoreSettings}
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <ScoreCell
                              value={m.minnieScore || ''}
                              onChange={v => update(m.id, { minnieScore: v })}
                              teamA={a}
                              teamB={b}
                              isAdmin={isAdmin}
                              scoreSettings={scoreSettings}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

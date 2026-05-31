import React, { useMemo, useState } from 'react';
import { parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';
import type { MickeyBDRound } from './RoundManager';

type PlayerStats = {
  name: string;
  partner?: string;
  roundsPlayed: number;
  roundsSat: number;
  teammates: Map<string, number>;
  opponents: Map<string, number>;
  courts: Map<number, number>;
};

type Summary = {
  totalPlayers: number;
  totalRoundsPlayed: number;
  maxTeammateRepeat: number;
  maxOpponentRepeat: number;
  maxCourtRepeat: number;
  worstSatPlayer: { name: string; sat: number } | null;
};

function computeStats(
  rounds: MickeyBDRound[],
  pairsText: string,
  freeAgentsText: string,
): { stats: PlayerStats[]; summary: Summary } {
  const pairs = parseMickeyPairsGendered(pairsText);
  const frees = parseMickeyFreeGendered(freeAgentsText);

  const players = new Map<string, PlayerStats>();
  const ensure = (name: string, partner?: string): PlayerStats => {
    const existing = players.get(name);
    if (existing) {
      if (partner && !existing.partner) existing.partner = partner;
      return existing;
    }
    const s: PlayerStats = {
      name,
      partner,
      roundsPlayed: 0,
      roundsSat: 0,
      teammates: new Map(),
      opponents: new Map(),
      courts: new Map(),
    };
    players.set(name, s);
    return s;
  };

  for (const pair of pairs) {
    for (const m of pair) {
      const partner = pair.find(p => p.name !== m.name)?.name;
      ensure(m.name, partner);
    }
  }
  for (const f of frees) ensure(f.name);

  for (const round of rounds) {
    for (const team of round.teams) {
      const match = round.matches.find(m => m.teamAId === team.id || m.teamBId === team.id);
      if (!match) {
        // Team sat this round
        for (const p of team.players) ensure(p).roundsSat++;
        continue;
      }
      const isA = match.teamAId === team.id;
      const opponentTeamId = isA ? match.teamBId : match.teamAId;
      const opponentPlayers = round.teams.find(t => t.id === opponentTeamId)?.players ?? [];
      const courtIdx = round.matches.findIndex(m => m.id === match.id);

      for (const p of team.players) {
        const s = ensure(p);
        s.roundsPlayed++;
        if (courtIdx >= 0) s.courts.set(courtIdx, (s.courts.get(courtIdx) ?? 0) + 1);
        for (const teammate of team.players) {
          if (teammate === p) continue;
          s.teammates.set(teammate, (s.teammates.get(teammate) ?? 0) + 1);
        }
        for (const opp of opponentPlayers) {
          s.opponents.set(opp, (s.opponents.get(opp) ?? 0) + 1);
        }
      }
    }
  }

  const stats = Array.from(players.values()).sort((a, b) => a.name.localeCompare(b.name));

  let maxTeammateRepeat = 0;
  let maxOpponentRepeat = 0;
  let maxCourtRepeat = 0;
  let worstSat: { name: string; sat: number } | null = null;
  for (const s of stats) {
    for (const [other, count] of s.teammates) {
      if (other === s.partner) continue; // pair partners are always together — skip
      maxTeammateRepeat = Math.max(maxTeammateRepeat, count);
    }
    for (const [, count] of s.opponents) {
      maxOpponentRepeat = Math.max(maxOpponentRepeat, count);
    }
    for (const [, count] of s.courts) {
      maxCourtRepeat = Math.max(maxCourtRepeat, count);
    }
    if (!worstSat || s.roundsSat > worstSat.sat) {
      worstSat = { name: s.name, sat: s.roundsSat };
    }
  }
  if (worstSat && worstSat.sat === 0) worstSat = null;

  return {
    stats,
    summary: {
      totalPlayers: stats.length,
      totalRoundsPlayed: stats.reduce((n, s) => n + s.roundsPlayed, 0),
      maxTeammateRepeat,
      maxOpponentRepeat,
      maxCourtRepeat,
      worstSatPlayer: worstSat,
    },
  };
}

function StatCell({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={'rounded-lg p-2 ' + (highlight
      ? 'bg-amber-50 ring-1 ring-amber-200'
      : 'bg-slate-50 ring-1 ring-slate-200')}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className={'text-[18px] font-bold ' + (highlight ? 'text-amber-700' : 'text-slate-800')}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

export function MickeyBDFairnessReport({
  rounds,
  pairsText,
  freeAgentsText,
}: {
  rounds: MickeyBDRound[];
  pairsText: string;
  freeAgentsText: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { stats, summary } = useMemo(
    () => computeStats(rounds, pairsText, freeAgentsText),
    [rounds, pairsText, freeAgentsText],
  );

  if (rounds.length === 0 || stats.length === 0) return null;

  // Reasonable thresholds: same teammate (non-pair) twice or more is unusual
  // after just a few rounds; same opponent 3+ times suggests clustering;
  // same court 3+ times suggests not enough rotation.
  const teammateConcern = summary.maxTeammateRepeat >= 2;
  const opponentConcern = summary.maxOpponentRepeat >= 3;
  const courtConcern = summary.maxCourtRepeat >= 3;
  const anyConcern = teammateConcern || opponentConcern || courtConcern;

  return (
    <section className="bg-white/95 rounded-xl shadow-sm ring-1 ring-slate-200 p-4 mt-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-700">
            Fairness Report
            <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
              Admin
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            How the smart re-shuffle has spread teammates, opponents, and courts across rounds.
            {anyConcern && (
              <span className="ml-1 text-amber-700">
                A few patterns are worth a glance — see the highlighted cells below.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1 rounded border border-slate-300 text-[12px] text-slate-700 hover:bg-slate-50"
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCell label="Players" value={summary.totalPlayers} />
        <StatCell
          label="Rounds played"
          value={summary.totalRoundsPlayed}
          hint="summed across players"
        />
        <StatCell
          label="Repeat teammate"
          value={`max ${summary.maxTeammateRepeat}×`}
          hint="non-pair pairings"
          highlight={teammateConcern}
        />
        <StatCell
          label="Repeat opponent"
          value={`max ${summary.maxOpponentRepeat}×`}
          highlight={opponentConcern}
        />
        <StatCell
          label="Same court"
          value={`max ${summary.maxCourtRepeat}×`}
          highlight={courtConcern}
        />
      </div>

      {summary.worstSatPlayer && (
        <p className="mt-2 text-[11px] text-slate-500">
          Most sit-outs: <span className="font-semibold text-slate-700">{summary.worstSatPlayer.name}</span> ({summary.worstSatPlayer.sat} round{summary.worstSatPlayer.sat === 1 ? '' : 's'})
        </p>
      )}

      {expanded && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-1 px-2">Player</th>
                <th className="py-1 px-2 text-center">Played</th>
                <th className="py-1 px-2 text-center">Sat</th>
                <th className="py-1 px-2">Top non-pair teammate</th>
                <th className="py-1 px-2">Top opponent</th>
                <th className="py-1 px-2">Top court</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => {
                // Top non-pair teammate
                let topMate = '';
                let topMateCount = 0;
                for (const [name, count] of s.teammates) {
                  if (name === s.partner) continue;
                  if (count > topMateCount) {
                    topMate = name;
                    topMateCount = count;
                  }
                }
                let topOpp = '';
                let topOppCount = 0;
                for (const [name, count] of s.opponents) {
                  if (count > topOppCount) {
                    topOpp = name;
                    topOppCount = count;
                  }
                }
                let topCourt = -1;
                let topCourtCount = 0;
                for (const [court, count] of s.courts) {
                  if (count > topCourtCount) {
                    topCourt = court;
                    topCourtCount = count;
                  }
                }
                const rowFlag = topMateCount >= 2 || topOppCount >= 3 || topCourtCount >= 3;
                return (
                  <tr key={s.name} className={'border-t ' + (rowFlag ? 'bg-amber-50/60' : '')}>
                    <td className="py-1 px-2 font-medium text-slate-800">
                      {s.name}
                      {s.partner && (
                        <span className="ml-1 text-[10px] text-slate-400">(pair: {s.partner})</span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-center tabular-nums">{s.roundsPlayed}</td>
                    <td className="py-1 px-2 text-center tabular-nums text-slate-500">{s.roundsSat}</td>
                    <td className={'py-1 px-2 ' + (topMateCount >= 2 ? 'font-semibold text-amber-700' : '')}>
                      {topMate ? <>{topMate} <span className="text-slate-400">×{topMateCount}</span></> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className={'py-1 px-2 ' + (topOppCount >= 3 ? 'font-semibold text-amber-700' : '')}>
                      {topOpp ? <>{topOpp} <span className="text-slate-400">×{topOppCount}</span></> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className={'py-1 px-2 ' + (topCourtCount >= 3 ? 'font-semibold text-amber-700' : '')}>
                      {topCourt >= 0
                        ? <>Court {topCourt + 1} <span className="text-slate-400">×{topCourtCount}</span></>
                        : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-400 mt-2">
            Pair partners are always teammates by design, so the "top non-pair teammate" column ignores them.
            Highlighted cells flag potentially uneven spread — usually a sign to either re-roll the round or
            generate a few more rounds so the algorithm has more chances to balance.
          </p>
        </div>
      )}
    </section>
  );
}

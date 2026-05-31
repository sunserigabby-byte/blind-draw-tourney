import React, { useMemo, useState } from 'react';
import type { MickeyTeam, MickeyMatchRow } from '../types';
import {
  shuffle, mickeyMemberList, FUN_TEAM_NAMES, pickFunTeamNames,
  parseMickeyPairsGendered, parseMickeyFreeGendered, stripGenderMarker,
  type GenderedName,
} from '../utils';

const rid = () => Math.random().toString(36).slice(2, 10);

type Unit = { members: GenderedName[]; size: number; M: number; F: number; totalSkill: number };

function toUnit(members: GenderedName[]): Unit {
  return {
    members,
    size: members.length,
    M: members.filter(m => m.gender === 'M').length,
    F: members.filter(m => m.gender === 'F').length,
    totalSkill: members.reduce((n, m) => n + m.skill, 0),
  };
}

// "Smallest team first" draw. We pre-allocate ceil(N/4) teams, then walk
// pairs (shuffled) first followed by free agents (shuffled), and for each unit
// pick the team that's currently smallest — with gender balance and skill as
// tiebreakers. This naturally SPREADS pairs across teams, so leftover same-
// gender free agents land WITH a pair (e.g. 2 MF pairs + 4 male free agents
// → two teams of 3M+1F instead of one perfect 2M+2F and one all-male team).
function drawTeams(pairUnits: Unit[], freeUnits: Unit[], targetPoolSize: number): MickeyTeam[] {
  type Bin = { players: string[]; size: number; M: number; F: number; totalSkill: number };

  const totalPlayers =
    pairUnits.reduce((n, u) => n + u.size, 0) + freeUnits.length;
  const totalSkill =
    pairUnits.reduce((n, u) => n + u.totalSkill, 0) +
    freeUnits.reduce((n, u) => n + u.totalSkill, 0);
  const targetPerPlayer = totalPlayers > 0 ? totalSkill / totalPlayers : 3;

  const T = Math.max(1, Math.ceil(totalPlayers / 4));
  const teams: Bin[] = Array.from({ length: T }, () => ({
    players: [], size: 0, M: 0, F: 0, totalSkill: 0,
  }));

  const addUnit = (team: Bin, u: Unit) => {
    team.players.push(...u.members.map(m => m.name));
    team.size += u.size;
    team.M += u.M;
    team.F += u.F;
    team.totalSkill += u.totalSkill;
  };

  // Pairs first so they get distributed first; free agents fill the gaps.
  const ordered = [...shuffle(pairUnits), ...shuffle(freeUnits)];

  for (const u of ordered) {
    let bestIdx = -1;
    let bestKey: [number, number, number] = [Infinity, Infinity, Infinity];
    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      if (t.size + u.size > 4) continue;
      const newSize = t.size + u.size;
      const newM = t.M + u.M;
      const newF = t.F + u.F;
      const newSkill = t.totalSkill + u.totalSkill;
      const genderDist = Math.abs(newM - 2) + Math.abs(newF - 2);
      const skillDist = Math.abs(newSkill - newSize * targetPerPlayer);
      // Lex order: smallest size beats anything; gender breaks size ties;
      // skill breaks gender ties.
      if (
        newSize < bestKey[0] ||
        (newSize === bestKey[0] &&
          (genderDist < bestKey[1] ||
            (genderDist === bestKey[1] && skillDist < bestKey[2])))
      ) {
        bestKey = [newSize, genderDist, skillDist];
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      // No existing team had room (edge case with awkward splits) → start a
      // new team.
      teams.push({ players: [], size: 0, M: 0, F: 0, totalSkill: 0 });
      bestIdx = teams.length - 1;
    }
    addUnit(teams[bestIdx], u);
  }

  const filled = teams.filter(t => t.size > 0);
  const poolCount = Math.max(1, Math.round(filled.length / Math.max(2, targetPoolSize)));
  const names = pickFunTeamNames(filled.length);
  return filled.map((b, i) => ({
    id: rid(),
    name: names[i],
    players: b.players,
    pool: (i % poolCount) + 1,
  }));
}

// Build pool matchups. The matchFormat decides whether each pair of teams
// meets in ONE match playing both Mickey + Minnie sets back-to-back
// ('COMBINED', single round-robin), or in TWO matches each playing a single
// set in alternating formats ('ALTERNATING', double round-robin).
function buildMatches(
  teams: MickeyTeam[],
  firstFormat: 'MICKEY' | 'MINNIE',
  matchFormat: 'COMBINED' | 'ALTERNATING',
): MickeyMatchRow[] {
  const secondFormat: 'MICKEY' | 'MINNIE' = firstFormat === 'MICKEY' ? 'MINNIE' : 'MICKEY';
  const byPool = new Map<number, MickeyTeam[]>();
  for (const t of teams) {
    if (!byPool.has(t.pool)) byPool.set(t.pool, []);
    byPool.get(t.pool)!.push(t);
  }
  const out: MickeyMatchRow[] = [];
  for (const [pool, ts] of [...byPool.entries()].sort((a, b) => a[0] - b[0])) {
    if (matchFormat === 'COMBINED') {
      // Single round-robin. No format field → match plays both sets.
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          out.push({ id: rid(), pool, teamAId: ts[i].id, teamBId: ts[j].id });
        }
      }
    } else {
      // Double round-robin. Round 1 = firstFormat, round 2 = the other.
      for (let pass = 0; pass < 2; pass++) {
        const format = pass === 0 ? firstFormat : secondFormat;
        for (let i = 0; i < ts.length; i++) {
          for (let j = i + 1; j < ts.length; j++) {
            out.push({ id: rid(), pool, teamAId: ts[i].id, teamBId: ts[j].id, format });
          }
        }
      }
    }
  }
  return out;
}

export function MickeyTeamBuilder({
  pairsText,
  freeAgentsText,
  teams,
  setTeams,
  matches,
  setMatches,
  firstFormat,
  setFirstFormat,
  matchFormat,
  setMatchFormat,
}: {
  pairsText: string;
  freeAgentsText: string;
  teams: MickeyTeam[];
  setTeams: (f: ((prev: MickeyTeam[]) => MickeyTeam[]) | MickeyTeam[]) => void;
  matches: MickeyMatchRow[];
  setMatches: (f: ((prev: MickeyMatchRow[]) => MickeyMatchRow[]) | MickeyMatchRow[]) => void;
  firstFormat: 'MICKEY' | 'MINNIE';
  setFirstFormat: (f: 'MICKEY' | 'MINNIE') => void;
  matchFormat: 'COMBINED' | 'ALTERNATING';
  setMatchFormat: (f: 'COMBINED' | 'ALTERNATING') => void;
}) {
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false);
  const [targetPoolSize, setTargetPoolSize] = useState(5);

  const pairUnits = useMemo(
    () => parseMickeyPairsGendered(pairsText).map(toUnit),
    [pairsText],
  );
  const freeUnits = useMemo(
    () => parseMickeyFreeGendered(freeAgentsText).map(m => toUnit([m])),
    [freeAgentsText],
  );
  const totalPlayers = useMemo(
    () => pairUnits.reduce((n, u) => n + u.size, 0) + freeUnits.length,
    [pairUnits, freeUnits],
  );
  const totalM = useMemo(
    () => pairUnits.reduce((n, u) => n + u.M, 0) + freeUnits.reduce((n, u) => n + u.M, 0),
    [pairUnits, freeUnits],
  );
  const totalF = useMemo(
    () => pairUnits.reduce((n, u) => n + u.F, 0) + freeUnits.reduce((n, u) => n + u.F, 0),
    [pairUnits, freeUnits],
  );
  const unknownCount = totalPlayers - totalM - totalF;
  const totalSkill = useMemo(
    () => pairUnits.reduce((n, u) => n + u.totalSkill, 0) + freeUnits.reduce((n, u) => n + u.totalSkill, 0),
    [pairUnits, freeUnits],
  );
  const avgSkill = totalPlayers > 0 ? totalSkill / totalPlayers : 0;
  const remainder = totalPlayers % 4;

  const doDraw = () => {
    setTeams(drawTeams(pairUnits, freeUnits, targetPoolSize));
    setConfirmRedraw(false);
  };

  const updateTeam = (id: string, patch: Partial<MickeyTeam>) =>
    setTeams(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));

  const deleteTeam = (id: string) =>
    setTeams(prev => prev.filter(t => t.id !== id));

  const addEmptyTeam = () =>
    setTeams(prev => {
      const used = new Set(prev.map(t => t.name));
      const name = shuffle(FUN_TEAM_NAMES).find(n => !used.has(n)) ?? `Team ${prev.length + 1}`;
      return [...prev, { id: rid(), name, players: [], pool: 1 }];
    });

  const doGenerate = () => {
    setMatches(buildMatches(teams, firstFormat, matchFormat));
    setConfirmGen(false);
  };

  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.pool - b.pool || a.name.localeCompare(b.name)),
    [teams],
  );

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-sky-800">Build Teams of 4</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          After each name add <span className="font-mono">(M)</span>/<span className="font-mono">(F)</span> and optionally a
          1–5 skill rating, e.g. <span className="font-mono">Amanda(F4) &amp; Chance(M3)</span> or <span className="font-mono">Jordan(M)</span>.
          The draw picks a random team composition (two pairs, or a pair + free agents, or four free agents)
          and balances gender (2M+2F) and skill across teams. Pairs always stay together.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[12px]">
        <span className="text-slate-600">
          {pairUnits.length} pair{pairUnits.length === 1 ? '' : 's'} · {freeUnits.length} free agent
          {freeUnits.length === 1 ? '' : 's'} · <span className="font-semibold">{totalPlayers} players</span>
          {totalPlayers > 0 && (
            <span className="ml-1 text-slate-500">
              ({totalM}M, {totalF}F{unknownCount > 0 ? `, ${unknownCount} unmarked` : ''} · avg skill {avgSkill.toFixed(1)})
            </span>
          )}
        </span>
        {totalPlayers > 0 && remainder !== 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Not a multiple of 4 — one team will be short by {4 - remainder} (use subs or hand-edit)
          </span>
        )}
        {unknownCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {unknownCount} name{unknownCount === 1 ? '' : 's'} missing (M)/(F) — they'll fill any slot
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded bg-sky-700 text-white hover:bg-sky-800 text-[13px] disabled:opacity-40"
          disabled={totalPlayers === 0}
          onClick={() => (teams.length ? setConfirmRedraw(true) : doDraw())}
        >
          {teams.length ? 'Re-draw Teams' : 'Draw Teams of 4'}
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
          Target pool size:
          <input
            type="number"
            min={2}
            max={20}
            value={targetPoolSize}
            onChange={e => setTargetPoolSize(Math.max(2, parseInt(e.target.value) || 5))}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center"
          />
          <span className="text-slate-400">teams/pool</span>
        </label>
        <button
          className="px-3 py-1.5 rounded border text-[13px]"
          onClick={addEmptyTeam}
        >
          Add Empty Team
        </button>
      </div>

      {confirmRedraw && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-[12px]">
          <span className="text-amber-800">Re-draw all teams? This replaces the current teams (matchups are not cleared until you regenerate).</span>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]" onClick={doDraw}>Re-draw</button>
            <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmRedraw(false)}>Cancel</button>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1 px-2">Pool</th>
                  <th className="py-1 px-2">Team Name</th>
                  <th className="py-1 px-2">Players (comma-separated)</th>
                  <th className="py-1 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(t => (
                  <tr key={t.id} className="border-t align-top">
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        min={1}
                        className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center"
                        value={t.pool}
                        onChange={e => updateTeam(t.id, { pool: Math.max(1, parseInt(e.target.value) || 1) })}
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        className="w-40 border border-slate-300 rounded px-2 py-1 text-[12px]"
                        value={t.name}
                        onChange={e => updateTeam(t.id, { name: e.target.value })}
                      />
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {t.players.length
                          ? `(${mickeyMemberList(t.players, pairsText)})`
                          : '(no players)'}
                      </div>
                    </td>
                    <td className="py-1 px-2">
                      <input
                        className="w-full min-w-[16rem] border border-slate-300 rounded px-2 py-1 text-[12px]"
                        value={t.players.join(', ')}
                        onChange={e =>
                          updateTeam(t.id, {
                            players: e.target.value.split(',').map(s => stripGenderMarker(s.trim())).filter(Boolean),
                          })
                        }
                      />
                    </td>
                    <td className="py-1 px-2">
                      <button
                        className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                        onClick={() => deleteTeam(t.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-2 border-t space-y-2">
            <div className="flex items-start gap-2 flex-wrap text-[12px]">
              <span className="font-medium text-slate-700 mt-0.5">Match format:</span>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={matchFormat === 'COMBINED'}
                    onChange={() => setMatchFormat('COMBINED')}
                  />
                  <span>Combined &mdash; <span className="text-slate-500">one match per pair, both Mickey + Minnie sets back-to-back</span></span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={matchFormat === 'ALTERNATING'}
                    onChange={() => setMatchFormat('ALTERNATING')}
                  />
                  <span>Alternating &mdash; <span className="text-slate-500">two matches per pair, one set each, rematch is the other format</span></span>
                </label>
              </div>
            </div>

            {matchFormat === 'ALTERNATING' && (
              <div className="flex items-center gap-2 flex-wrap text-[12px] pl-1">
                <span className="font-medium text-slate-700">First round plays:</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={firstFormat === 'MICKEY'}
                    onChange={() => setFirstFormat('MICKEY')}
                  />
                  Mickey (coed)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={firstFormat === 'MINNIE'}
                    onChange={() => setFirstFormat('MINNIE')}
                  />
                  Minnie (revco)
                </label>
                <span className="text-[11px] text-slate-400">
                  Rematches play the other format.
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[13px]"
                onClick={() => (matches.length ? setConfirmGen(true) : doGenerate())}
              >
                Generate Pool Matchups
              </button>
              <span className="text-[11px] text-slate-500">
                {matchFormat === 'COMBINED'
                  ? 'Single round-robin — every team plays every other team once (both sets per match).'
                  : 'Double round-robin — every team plays every other team twice (once each format).'}
              </span>
            </div>
          </div>

          {confirmGen && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-[12px]">
              <span className="text-amber-800">Regenerate matchups? This clears any scores already entered for this division.</span>
              <div className="flex items-center gap-2">
                <button className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]" onClick={doGenerate}>Regenerate</button>
                <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmGen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

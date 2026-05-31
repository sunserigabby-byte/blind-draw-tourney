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

type Bucket = 'pairsMF' | 'pairsMM' | 'pairsFF' | 'pairsOther' | 'freeM' | 'freeF' | 'freeUnknown';
type Composition = Bucket[];

// 4-player team compositions that yield 2 guys + 2 girls when possible.
const COMPOSITIONS: Composition[] = [
  ['pairsMF', 'pairsMF'],              // two mixed pairs hang out together
  ['pairsMM', 'pairsFF'],              // all-guy pair + all-girl pair
  ['pairsMF', 'freeM', 'freeF'],       // a pair + one guy + one girl free agent
  ['pairsMM', 'freeF', 'freeF'],       // all-guy pair + two girl free agents
  ['pairsFF', 'freeM', 'freeM'],       // all-girl pair + two guy free agents
  ['freeM', 'freeM', 'freeF', 'freeF'], // four free agents, 2M + 2F
];

// Composition-based, skill-aware draw. For each team we pick a random valid
// 4-player template (e.g. "two pairs", "pair + 1M + 1F"); within each template
// we pick the specific units whose skill ratings keep the team close to the
// average. Pairs always stay together. When gender stocks are uneven, the
// remainder falls through to a greedy fill.
function drawTeams(pairUnits: Unit[], freeUnits: Unit[], targetPoolSize: number): MickeyTeam[] {
  type Bin = { players: string[]; size: number; M: number; F: number; totalSkill: number };
  const teams: Bin[] = [];

  const buckets: Record<Bucket, Unit[]> = {
    pairsMF: shuffle(pairUnits.filter(u => u.M === 1 && u.F === 1)),
    pairsMM: shuffle(pairUnits.filter(u => u.M === 2 && u.F === 0)),
    pairsFF: shuffle(pairUnits.filter(u => u.F === 2 && u.M === 0)),
    pairsOther: shuffle(pairUnits.filter(u => u.M + u.F < 2)),
    freeM: shuffle(freeUnits.filter(u => u.M === 1)),
    freeF: shuffle(freeUnits.filter(u => u.F === 1)),
    freeUnknown: shuffle(freeUnits.filter(u => u.M === 0 && u.F === 0)),
  };

  const totalSkill =
    pairUnits.reduce((n, u) => n + u.totalSkill, 0) +
    freeUnits.reduce((n, u) => n + u.totalSkill, 0);
  const totalPlayers =
    pairUnits.reduce((n, u) => n + u.size, 0) + freeUnits.length;
  const targetPerPlayer = totalPlayers > 0 ? totalSkill / totalPlayers : 3;

  const compositionFits = (comp: Composition): boolean => {
    const need: Partial<Record<Bucket, number>> = {};
    for (const b of comp) need[b] = (need[b] ?? 0) + 1;
    return (Object.entries(need) as [Bucket, number][])
      .every(([b, n]) => buckets[b].length >= n);
  };

  // Among candidates in `list`, pick (and remove) one whose skill brings the
  // team's running total closest to the ideal per-player average. Top-3 random
  // tiebreak so re-draw keeps some variety.
  const takeBalanced = (list: Unit[], teamSkillSoFar: number, teamSizeSoFar: number): Unit => {
    const scored = list.map((u, idx) => {
      const newSize = teamSizeSoFar + u.size;
      const ideal = newSize * targetPerPlayer;
      return { idx, u, dist: Math.abs(teamSkillSoFar + u.totalSkill - ideal) };
    }).sort((a, b) => a.dist - b.dist);
    const K = Math.min(3, scored.length);
    const pick = scored[Math.floor(Math.random() * K)];
    list.splice(pick.idx, 1);
    return pick.u;
  };

  const addUnit = (team: Bin, u: Unit) => {
    team.players.push(...u.members.map(m => m.name));
    team.size += u.size;
    team.M += u.M;
    team.F += u.F;
    team.totalSkill += u.totalSkill;
  };

  // Main loop: build teams from valid compositions until we can't.
  while (true) {
    const valid = COMPOSITIONS.filter(compositionFits);
    if (valid.length === 0) break;
    const comp = valid[Math.floor(Math.random() * valid.length)];
    const team: Bin = { players: [], size: 0, M: 0, F: 0, totalSkill: 0 };
    for (const slot of comp) {
      const u = takeBalanced(buckets[slot], team.totalSkill, team.size);
      addUnit(team, u);
    }
    teams.push(team);
  }

  // Fallback: anything left over (uneven gender stocks, unmarked names) gets
  // packed greedily — pairs first, then free agents — into existing or new
  // teams, scored by gender + skill distance.
  const leftoverPairs = shuffle([
    ...buckets.pairsMF, ...buckets.pairsMM, ...buckets.pairsFF, ...buckets.pairsOther,
  ]);
  const leftoverFrees = shuffle([
    ...buckets.freeM, ...buckets.freeF, ...buckets.freeUnknown,
  ]);

  const placeLeftover = (u: Unit) => {
    let best: Bin | null = null;
    let bestScore = Infinity;
    for (const t of teams) {
      if (t.size + u.size > 4) continue;
      const newSize = t.size + u.size;
      const newSkill = t.totalSkill + u.totalSkill;
      const newM = t.M + u.M;
      const newF = t.F + u.F;
      const genderDist = Math.abs(newM - 2) + Math.abs(newF - 2);
      const skillDist = Math.abs(newSkill - newSize * targetPerPlayer);
      const score = genderDist * 100 + skillDist * 5 + newSize;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) {
      best = { players: [], size: 0, M: 0, F: 0, totalSkill: 0 };
      teams.push(best);
    }
    addUnit(best, u);
  };

  for (const u of leftoverPairs) placeLeftover(u);
  for (const u of leftoverFrees) placeLeftover(u);

  const n = teams.length;
  const poolCount = Math.max(1, Math.round(n / Math.max(2, targetPoolSize)));
  const names = pickFunTeamNames(n);
  return teams.map((b, i) => ({
    id: rid(),
    name: names[i],
    players: b.players,
    pool: (i % poolCount) + 1,
  }));
}

// Build matches for each pool using a double round-robin so every team
// plays every other team in its pool twice. Round 1 then Round 2 to spread
// the rematches out.
function buildMatches(teams: MickeyTeam[]): MickeyMatchRow[] {
  const byPool = new Map<number, MickeyTeam[]>();
  for (const t of teams) {
    if (!byPool.has(t.pool)) byPool.set(t.pool, []);
    byPool.get(t.pool)!.push(t);
  }
  const out: MickeyMatchRow[] = [];
  for (const [pool, ts] of [...byPool.entries()].sort((a, b) => a[0] - b[0])) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          out.push({ id: rid(), pool, teamAId: ts[i].id, teamBId: ts[j].id });
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
}: {
  pairsText: string;
  freeAgentsText: string;
  teams: MickeyTeam[];
  setTeams: (f: ((prev: MickeyTeam[]) => MickeyTeam[]) | MickeyTeam[]) => void;
  matches: MickeyMatchRow[];
  setMatches: (f: ((prev: MickeyMatchRow[]) => MickeyMatchRow[]) | MickeyMatchRow[]) => void;
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
    setMatches(buildMatches(teams));
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

          <div className="pt-2 border-t flex items-center gap-2 flex-wrap">
            <button
              className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[13px]"
              onClick={() => (matches.length ? setConfirmGen(true) : doGenerate())}
            >
              Generate Pool Matchups
            </button>
            <span className="text-[11px] text-slate-500">
              Round-robin within each pool — every team plays every other team in its pool once (Mickey + Minnie set each).
            </span>
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

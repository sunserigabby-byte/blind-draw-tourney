import React, { useMemo, useState } from 'react';
import type { MickeyTeam, MickeyMatchRow } from '../types';
import { shuffle, mickeyMemberList, FUN_TEAM_NAMES, pickFunTeamNames } from '../utils';

const rid = () => Math.random().toString(36).slice(2, 10);

// Each pairs line becomes a "locked group" that stays together on the same team.
// Names may be separated by & , / or +  (e.g. "Alex & Sam").
function parseGroups(text: string): string[][] {
  return (text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(/[&/+,]/).map(s => s.trim()).filter(Boolean))
    .filter(g => g.length > 0);
}

function parseSingles(text: string): string[] {
  return (text || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

// First-fit-decreasing packing into teams of 4. Locked groups never split.
function drawTeams(groups: string[][], singles: string[]): MickeyTeam[] {
  const blocks = [
    ...shuffle(groups),
    ...shuffle(singles).map(s => [s]),
  ].sort((a, b) => b.length - a.length);

  const slots: string[][] = [];
  for (const block of blocks) {
    let placed = false;
    for (const slot of slots) {
      if (slot.length + block.length <= 4) {
        slot.push(...block);
        placed = true;
        break;
      }
    }
    if (!placed) slots.push([...block]);
  }

  const n = slots.length;
  const poolCount = Math.max(1, Math.round(n / 4.5));
  const names = pickFunTeamNames(n);
  return slots.map((players, i) => ({
    id: rid(),
    name: names[i],
    players,
    pool: (i % poolCount) + 1,
  }));
}

function buildMatches(teams: MickeyTeam[]): MickeyMatchRow[] {
  const byPool = new Map<number, MickeyTeam[]>();
  for (const t of teams) {
    if (!byPool.has(t.pool)) byPool.set(t.pool, []);
    byPool.get(t.pool)!.push(t);
  }
  const out: MickeyMatchRow[] = [];
  for (const [pool, ts] of [...byPool.entries()].sort((a, b) => a[0] - b[0])) {
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        out.push({ id: rid(), pool, teamAId: ts[i].id, teamBId: ts[j].id });
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

  const groups = useMemo(() => parseGroups(pairsText), [pairsText]);
  const singles = useMemo(() => parseSingles(freeAgentsText), [freeAgentsText]);
  const totalPlayers = useMemo(
    () => groups.reduce((n, g) => n + g.length, 0) + singles.length,
    [groups, singles],
  );
  const remainder = totalPlayers % 4;

  const doDraw = () => {
    setTeams(drawTeams(groups, singles));
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
          Pairs stay together; free agents fill out each team of 4. After drawing you can rename
          teams, fix the players, or change a team's pool — then generate the pool matchups.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[12px]">
        <span className="text-slate-600">
          {groups.length} pair{groups.length === 1 ? '' : 's'} · {singles.length} free agent
          {singles.length === 1 ? '' : 's'} · <span className="font-semibold">{totalPlayers} players</span>
        </span>
        {totalPlayers > 0 && remainder !== 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Not a multiple of 4 — one team will have {remainder} player{remainder === 1 ? '' : 's'} (use subs or hand-edit)
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
                            players: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
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

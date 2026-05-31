import React, { useMemo, useState } from 'react';
import type { MickeyTeam, MickeyMatchRow } from '../types';
import {
  parseMickeyPairsGendered, parseMickeyFreeGendered, mickeyMemberList, shuffle,
} from '../utils';
import { drawTeams, toUnit, type Unit } from '../mickey/TeamBuilder';

const rid = () => Math.random().toString(36).slice(2, 10);

export type MickeyBDRound = {
  id: string;
  number: number;
  teams: MickeyTeam[];
  matches: MickeyMatchRow[];
};

// Pair drawn teams within a round into single matches. Each round = one
// match per team (against another team); each match plays a Mickey + Minnie
// set back-to-back. Last team sits if the team count is odd.
function pairTeamsIntoMatches(teams: MickeyTeam[], roundNumber: number): MickeyMatchRow[] {
  const shuffled = shuffle(teams);
  const out: MickeyMatchRow[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    out.push({
      id: rid(),
      pool: roundNumber, // reuse "pool" slot to carry the round number for the match
      teamAId: shuffled[i].id,
      teamBId: shuffled[i + 1].id,
    });
  }
  return out;
}

export function MickeyBDRoundManager({
  pairsText,
  freeAgentsText,
  rounds,
  setRounds,
}: {
  pairsText: string;
  freeAgentsText: string;
  rounds: MickeyBDRound[];
  setRounds: (f: ((prev: MickeyBDRound[]) => MickeyBDRound[]) | MickeyBDRound[]) => void;
}) {
  const [targetPoolSize, setTargetPoolSize] = useState(5);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmRedrawId, setConfirmRedrawId] = useState<string | null>(null);

  const pairUnits = useMemo<Unit[]>(
    () => parseMickeyPairsGendered(pairsText).map(u => toUnit(u)),
    [pairsText],
  );
  const freeUnits = useMemo<Unit[]>(
    () => parseMickeyFreeGendered(freeAgentsText).map(m => toUnit([m])),
    [freeAgentsText],
  );
  const totalPlayers = pairUnits.reduce((n, u) => n + u.size, 0) + freeUnits.length;

  const generateRound = () => {
    const teams = drawTeams(pairUnits, freeUnits, targetPoolSize);
    if (teams.length < 2) {
      alert('Need at least 2 teams to make a round. Add more pairs or free agents.');
      return;
    }
    const number = rounds.length + 1;
    const matches = pairTeamsIntoMatches(teams, number);
    const next: MickeyBDRound = { id: rid(), number, teams, matches };
    setRounds(prev => [...prev, next]);
  };

  const redrawRound = (roundId: string) => {
    setRounds(prev => prev.map(r => {
      if (r.id !== roundId) return r;
      const teams = drawTeams(pairUnits, freeUnits, targetPoolSize);
      const matches = pairTeamsIntoMatches(teams, r.number);
      return { ...r, teams, matches };
    }));
    setConfirmRedrawId(null);
  };

  const removeRound = (roundId: string) => {
    setRounds(prev => {
      const filtered = prev.filter(r => r.id !== roundId);
      // Renumber the remaining rounds so display stays 1..N
      return filtered.map((r, i) => ({ ...r, number: i + 1 }));
    });
    setConfirmRemoveId(null);
  };

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold text-sky-800">Rounds</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Each round re-randomizes teams using the same pair-preserving algorithm. Each round plays one match per team
          with Mickey + Minnie sets back-to-back. Click <span className="font-medium">Generate Next Round</span> as many
          times as you want.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[12px] text-slate-600">
        <span>
          Roster:{' '}
          <span className="font-semibold">
            {pairUnits.length} pair{pairUnits.length === 1 ? '' : 's'}, {freeUnits.length} free agent
            {freeUnits.length === 1 ? '' : 's'}, {totalPlayers} player{totalPlayers === 1 ? '' : 's'}
          </span>
        </span>
        <label className="flex items-center gap-1.5">
          Target pool size:
          <input
            type="number"
            min={2}
            max={20}
            value={targetPoolSize}
            onChange={e => setTargetPoolSize(Math.max(2, parseInt(e.target.value) || 5))}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
          />
          <span className="text-slate-400">teams/round</span>
        </label>
      </div>

      <div>
        <button
          className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[13px] disabled:opacity-40"
          disabled={totalPlayers < 4}
          onClick={generateRound}
        >
          Generate {rounds.length === 0 ? 'First' : 'Next'} Round
        </button>
        {totalPlayers < 4 && (
          <span className="ml-2 text-[11px] text-slate-500">Need at least 4 players to start.</span>
        )}
      </div>

      {rounds.length > 0 && (
        <div className="border-t pt-3 space-y-3">
          <h3 className="text-[13px] font-semibold text-slate-600 uppercase tracking-wide">Rounds drawn so far</h3>
          {rounds.map(round => (
            <div key={round.id} className="border border-slate-200 rounded-lg bg-slate-50/50 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="text-[13px] font-semibold text-sky-800">
                  Round {round.number}
                  <span className="ml-2 text-[11px] font-normal text-slate-500">
                    {round.teams.length} team{round.teams.length === 1 ? '' : 's'} · {round.matches.length} match
                    {round.matches.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="px-2 py-1 rounded border text-slate-700 hover:bg-slate-50 text-[11px]"
                    onClick={() => setConfirmRedrawId(round.id)}
                  >
                    Re-roll
                  </button>
                  <button
                    className="px-2 py-1 rounded text-red-600 hover:bg-red-50 text-[11px]"
                    onClick={() => setConfirmRemoveId(round.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-1.5 text-[12px] text-slate-600">
                {round.teams.map(t => (
                  <div key={t.id} className="bg-white rounded px-2 py-1 border border-slate-200">
                    <span className="font-medium text-slate-800">{t.name}</span>
                    <span className="text-slate-500"> — {mickeyMemberList(t.players, pairsText) || t.players.join(', ')}</span>
                  </div>
                ))}
              </div>
              {confirmRedrawId === round.id && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-amber-800">Re-roll round {round.number}? Any scores entered for this round are cleared.</span>
                  <div className="flex items-center gap-1.5">
                    <button className="px-2 py-1 rounded bg-amber-600 text-white" onClick={() => redrawRound(round.id)}>Re-roll</button>
                    <button className="px-2 py-1 rounded border" onClick={() => setConfirmRedrawId(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {confirmRemoveId === round.id && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-red-800">Remove round {round.number}? Remaining rounds will be renumbered.</span>
                  <div className="flex items-center gap-1.5">
                    <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={() => removeRound(round.id)}>Remove</button>
                    <button className="px-2 py-1 rounded border" onClick={() => setConfirmRemoveId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

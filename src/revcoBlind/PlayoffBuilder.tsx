import React, { useMemo, useState } from 'react';
import type { Team, BracketMatch, RevcoBDRound, ScoreSettings } from '../types';
import { slug, shuffle, pickFunTeamNames } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeRevcoStandings, type UnitRow } from './Leaderboard';

type PreparedTeam = { name: string; players: string[] };

function toTeamObjs(teams: PreparedTeam[], division: 'UPPER' | 'LOWER'): Team[] {
  return teams.map((t, i) => ({
    id: `${division}-PO-${i + 1}-${slug(t.name)}`,
    name: t.name,
    members: t.players,
    seed: i + 1,
    division,
  }));
}

// Random: shuffle every pair/free agent, then group consecutive units into
// teams of 4 players. An odd unit left over sits out this bracket.
function formRandomTeams(units: UnitRow[]): PreparedTeam[] {
  const shuffled = shuffle(units);
  const teams: PreparedTeam[] = [];
  const names = pickFunTeamNames(Math.max(1, Math.floor(shuffled.length / 2)));
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    teams.push({
      name: names[teams.length] ?? `Team ${teams.length + 1}`,
      players: [...shuffled[i].players, ...shuffled[i + 1].players],
    });
  }
  return teams;
}

// Crossover: rank all 12 pairs/free agents by pool-play record, split into
// the top 6 and bottom 6, then randomly match each top unit with one from
// the bottom six. Bracket seeds follow the top unit's original rank (1-6).
function formCrossoverTeams(units: UnitRow[]): PreparedTeam[] {
  if (units.length !== 12) return [];
  const ranked = [...units].sort((a, b) => b.W - a.W || b.PD - a.PD || a.label.localeCompare(b.label));
  const top = ranked.slice(0, 6);
  const bottom = shuffle(ranked.slice(6, 12));
  const names = pickFunTeamNames(6);
  return top.map((u, i) => ({
    name: names[i] ?? `Team ${i + 1}`,
    players: [...u.players, ...bottom[i].players],
  }));
}

export function RevcoBDPlayoffBuilder({
  rounds,
  pairsText,
  freeAgentsText,
  brackets,
  setBrackets,
  division,
  scoreSettings = { playTo: 21, cap: null },
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  brackets: BracketMatch[];
  setBrackets: (f: ((prev: BracketMatch[]) => BracketMatch[]) | BracketMatch[]) => void;
  division: 'UPPER' | 'LOWER';
  scoreSettings?: ScoreSettings;
}) {
  const [confirmMode, setConfirmMode] = useState<'random' | 'crossover' | null>(null);

  const units = useMemo(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings),
    [rounds, pairsText, freeAgentsText, scoreSettings],
  );
  const totalPlayers = units.reduce((n, u) => n + u.players.length, 0);
  const hasBracket = brackets.some(b => b.division === division);

  const build = (mode: 'random' | 'crossover') => {
    const prepared = mode === 'random' ? formRandomTeams(units) : formCrossoverTeams(units);
    if (prepared.length < 2) {
      alert(mode === 'crossover'
        ? `Crossover pairing needs exactly 12 pairs/free agents. You currently have ${units.length}.`
        : 'Need at least 2 teams worth of players to build a bracket.');
      return;
    }
    setBrackets(() => buildBracket(division, toTeamObjs(prepared, division)));
    setConfirmMode(null);
  };

  const onClickBuild = (mode: 'random' | 'crossover') => {
    if (hasBracket) setConfirmMode(mode);
    else build(mode);
  };

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-[16px] font-semibold text-sky-800">Playoffs ({division})</h3>
        <p className="text-[11px] text-slate-500 mt-1">
          Builds a fresh single-elimination bracket by re-drawing new teams of 4 from your pairs and
          free agents, based on their pool-play record. Pairs always stay together.
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          {totalPlayers} player{totalPlayers === 1 ? '' : 's'} · {units.length} pair/agent{units.length === 1 ? '' : 's'}{' '}
          · {rounds.length} round{rounds.length === 1 ? '' : 's'} played
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[13px] disabled:opacity-40"
          disabled={units.length < 4}
          onClick={() => onClickBuild('random')}
        >
          {hasBracket ? 'Rebuild Random Bracket' : 'Build Random Bracket'}
        </button>
        <button
          className="px-3 py-1.5 rounded-lg border border-indigo-400 text-indigo-700 hover:bg-indigo-50 text-[13px] disabled:opacity-40"
          disabled={units.length !== 12}
          onClick={() => onClickBuild('crossover')}
          title={
            units.length === 12
              ? 'Ranks all 12 by pool-play record, then randomly pairs each of the top 6 with one of the bottom 6'
              : `Needs exactly 12 pairs/free agents. You currently have ${units.length}.`
          }
        >
          {hasBracket ? 'Rebuild Crossover Bracket' : 'Build Crossover Bracket (Top 6 vs Bottom 6)'}
        </button>
      </div>

      {units.length < 4 && (
        <p className="text-[11px] text-slate-400">Need at least 4 pairs/free agents (2 teams of 4) to build a bracket.</p>
      )}

      {confirmMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-[12px]">
          <span className="text-amber-800">
            Rebuild the {division} bracket? This clears the current bracket and any scores in it.
          </span>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]" onClick={() => build(confirmMode)}>
              Rebuild
            </button>
            <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

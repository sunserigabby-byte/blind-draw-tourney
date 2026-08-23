import React, { useMemo, useState } from 'react';
import type { Team, BracketMatch, RevcoBDRound, ScoreSettings } from '../types';
import { slug, shuffle, uniq, parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeRevcoStandings, type UnitRow } from './Leaderboard';

type PreparedTeam = { id: string; name: string; players: string[] };

function toTeamObjs(teams: PreparedTeam[], division: 'UPPER' | 'LOWER'): Team[] {
  return teams.map((t, i) => ({
    id: `${division}-PO-${i + 1}-${slug(t.name)}`,
    name: t.name,
    members: t.players.filter(Boolean),
    seed: i + 1,
    division,
  }));
}

// Random: shuffle every pair/free agent, then group consecutive units into
// teams of 4 players. An odd unit left over sits out this bracket.
function formRandomTeams(units: UnitRow[]): PreparedTeam[] {
  const shuffled = shuffle(units);
  const teams: PreparedTeam[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    teams.push({
      id: `rand-${teams.length + 1}`,
      name: `${shuffled[i].label} / ${shuffled[i + 1].label}`,
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
  return top.map((u, i) => ({
    id: `xover-${i + 1}`,
    name: `${u.label} / ${bottom[i].label}`,
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
  const [editTeams, setEditTeams] = useState<PreparedTeam[]>([]);

  const units = useMemo(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings),
    [rounds, pairsText, freeAgentsText, scoreSettings],
  );
  const totalPlayers = units.reduce((n, u) => n + u.players.length, 0);
  const hasBracket = brackets.some(b => b.division === division);

  const allPlayerNames = useMemo(
    () => uniq([
      ...parseMickeyPairsGendered(pairsText).flat().map(m => m.name),
      ...parseMickeyFreeGendered(freeAgentsText).map(m => m.name),
    ].filter(Boolean)),
    [pairsText, freeAgentsText],
  );

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
    setEditTeams([]);
  };

  const onClickBuild = (mode: 'random' | 'crossover') => {
    if (hasBracket) setConfirmMode(mode);
    else build(mode);
  };

  const prepareToEdit = (mode: 'random' | 'crossover') => {
    const prepared = mode === 'random' ? formRandomTeams(units) : formCrossoverTeams(units);
    if (prepared.length < 2) {
      alert(mode === 'crossover'
        ? `Crossover pairing needs exactly 12 pairs/free agents. You currently have ${units.length}.`
        : 'Need at least 2 teams worth of players to build a bracket.');
      return;
    }
    setEditTeams(prepared.map(t => ({ ...t, players: [...t.players, '', '', '', ''].slice(0, 4) })));
  };

  const buildFromEdit = () => {
    const objs = toTeamObjs(editTeams, division);
    if (objs.length < 2) { alert('Need at least 2 teams (with players) to build a bracket.'); return; }
    setBrackets(() => buildBracket(division, objs));
    setEditTeams([]);
    setConfirmMode(null);
  };

  const setTeamName = (tIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) => (i === tIdx ? { ...t, name: value } : t)));
  const setMember = (tIdx: number, mIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) =>
      i === tIdx ? { ...t, players: t.players.map((p, j) => (j === mIdx ? value : p)) } : t));
  const moveTeam = (idx: number, dir: -1 | 1) =>
    setEditTeams(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  const removeTeamAt = (idx: number) => setEditTeams(prev => prev.filter((_, i) => i !== idx));
  const addTeam = () =>
    setEditTeams(prev => [...prev, { id: `edit-new-${Date.now()}`, name: `Team ${prev.length + 1}`, players: ['', '', '', ''] }]);

  const dupNames = useMemo(() => {
    const all = editTeams.flatMap(t => t.players.filter(Boolean));
    return uniq(all.filter((n, i) => all.indexOf(n) !== i));
  }, [editTeams]);

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-[16px] font-semibold text-sky-800">Playoffs ({division})</h3>
        <p className="text-[11px] text-slate-500 mt-1">
          Builds a fresh single-elimination bracket by re-drawing new teams of 4 from your pairs and
          free agents, based on their pool-play record. Pairs always stay together. Adjust the
          auto-formed teams below before building, or build directly.
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
        <span className="text-slate-300">|</span>
        <button
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[12px] disabled:opacity-40"
          disabled={units.length < 4}
          onClick={() => prepareToEdit('random')}
        >
          Prepare Random Teams to Edit…
        </button>
        <button
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[12px] disabled:opacity-40"
          disabled={units.length !== 12}
          onClick={() => prepareToEdit('crossover')}
        >
          Prepare Crossover Teams to Edit…
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

      {editTeams.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[13px] font-semibold text-slate-800">
              Adjust Teams &amp; Seeds ({editTeams.length} team{editTeams.length === 1 ? '' : 's'})
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-[12px]" onClick={buildFromEdit}>
                Build Bracket from These Teams
              </button>
              <button className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]" onClick={addTeam}>
                + Add Team
              </button>
              <button className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]" onClick={() => setEditTeams([])}>
                Cancel
              </button>
            </div>
          </div>

          {dupNames.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              A player is on more than one team: {dupNames.join(', ')}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {editTeams.map((team, tIdx) => (
              <div key={team.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-1 text-[11px] font-semibold rounded-full bg-sky-100 text-sky-800">
                    #{tIdx + 1}
                  </span>
                  <input
                    className="flex-1 border border-slate-300 rounded px-2 py-1 text-[12px]"
                    value={team.name}
                    onChange={e => setTeamName(tIdx, e.target.value)}
                  />
                  <button className="text-[11px] px-1.5 py-1 rounded border text-slate-500 hover:bg-white" onClick={() => moveTeam(tIdx, -1)} title="Move up (better seed)">▲</button>
                  <button className="text-[11px] px-1.5 py-1 rounded border text-slate-500 hover:bg-white" onClick={() => moveTeam(tIdx, 1)} title="Move down (worse seed)">▼</button>
                  <button className="text-[11px] px-1.5 py-1 rounded border text-red-500 hover:bg-red-50" onClick={() => removeTeamAt(tIdx)} title="Remove team">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {team.players.map((member, mIdx) => (
                    <select
                      key={mIdx}
                      className={'border rounded px-1.5 py-1 text-[12px] bg-white ' + (member && dupNames.includes(member) ? 'border-amber-400 bg-amber-50' : 'border-slate-300')}
                      value={member}
                      onChange={e => setMember(tIdx, mIdx, e.target.value)}
                    >
                      <option value="">— player {mIdx + 1} —</option>
                      {allPlayerNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400">
            Reorder seeds with ▲▼; swap players between teams with the dropdowns. "Build Bracket from These Teams" locks it in.
          </p>
        </div>
      )}
    </section>
  );
}

import React, { useMemo, useState } from 'react';
import type { Team, BracketMatch, RevcoBDRound, ScoreSettings } from '../types';
import { slug, shuffle, uniq, parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeRevcoStandings, type UnitRow, type RevcoOverrides } from './Leaderboard';
import { buildDoubleElimBracket } from './doubleElim';

type ElimType = 'single' | 'double';

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

type Gender = 'M' | 'F' | null;
type BuildMode = 'ranked' | 'random' | 'crossover';

// Teams of 4 = 2 guys + 2 girls. Registered pairs (already 1 guy + 1 girl)
// team up two at a time; free agents are split into a guys list and a girls
// list and grouped two-and-two.
//   ranked — each list in standings order, so guys 1-2 + girls 1-2 make
//            Team 1 (seed 1), guys 3-4 + girls 3-4 make Team 2, and so on.
//   random — each list shuffled first.
// Anyone who can't make a full 2+2 team is returned in `leftOut`.
function formQuadTeams(
  units: UnitRow[],
  genderOf: Map<string, Gender>,
  mode: 'ranked' | 'random',
): { teams: PreparedTeam[]; leftOut: string[] } {
  const order = <T,>(list: T[]) => (mode === 'random' ? shuffle(list) : list);
  const pairs = order(units.filter(u => u.kind === 'pair' && u.players.length >= 2));
  const free = units.filter(u => !(u.kind === 'pair' && u.players.length >= 2));
  const g = (u: UnitRow) => genderOf.get(slug(u.players[0])) ?? null;
  const guys = order(free.filter(u => g(u) === 'M'));
  const girls = order(free.filter(u => g(u) === 'F'));
  // No (M)/(F) marker: fill whichever side is shorter.
  for (const u of order(free.filter(u => g(u) === null))) (guys.length <= girls.length ? guys : girls).push(u);

  const teams: { units: UnitRow[] }[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) teams.push({ units: [pairs[i], pairs[i + 1]] });
  const oddPair = pairs.length % 2 === 1 ? pairs[pairs.length - 1] : null;
  if (oddPair && guys.length && girls.length) teams.push({ units: [oddPair, guys.shift()!, girls.shift()!] });
  while (guys.length >= 2 && girls.length >= 2) {
    teams.push({ units: [guys.shift()!, guys.shift()!, girls.shift()!, girls.shift()!] });
  }

  // With pairs in the mix, seed by the team's combined record.
  if (mode === 'ranked' && pairs.length > 0) {
    const tot = (t: { units: UnitRow[] }, k: 'W' | 'PD') => t.units.reduce((n, u) => n + u[k], 0);
    teams.sort((a, b) => tot(b, 'W') - tot(a, 'W') || tot(b, 'PD') - tot(a, 'PD'));
  }

  const used = new Set(teams.flatMap(t => t.units));
  const leftOut = units.filter(u => !used.has(u)).flatMap(u => u.players);
  return {
    teams: teams.map((t, i) => {
      const players = t.units.flatMap(u => u.players);
      return { id: `${mode}-${i + 1}`, name: players.join(' / '), players };
    }),
    leftOut,
  };
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
  overrides = {},
  excluded = [],
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  brackets: BracketMatch[];
  setBrackets: (f: ((prev: BracketMatch[]) => BracketMatch[]) | BracketMatch[]) => void;
  division: 'UPPER' | 'LOWER';
  scoreSettings?: ScoreSettings;
  overrides?: RevcoOverrides;
  // Players not playing in the playoffs (chosen in PlayoffExclusions).
  excluded?: string[];
}) {
  const [confirmMode, setConfirmMode] = useState<BuildMode | null>(null);
  const [editTeams, setEditTeams] = useState<PreparedTeam[]>([]);

  const allUnits = useMemo(
    () => computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings, overrides),
    [rounds, pairsText, freeAgentsText, scoreSettings, overrides],
  );
  // Leave out anyone not playing playoffs (a registered pair drops out together).
  const excludedSet = useMemo(() => new Set(excluded.map(slug)), [excluded]);
  const units = useMemo(
    () => allUnits.filter(u => !u.players.some(p => excludedSet.has(slug(p)))),
    [allUnits, excludedSet],
  );
  const genderOf = useMemo(() => {
    const m = new Map<string, Gender>();
    for (const pair of parseMickeyPairsGendered(pairsText)) for (const p of pair) m.set(slug(p.name), p.gender);
    for (const p of parseMickeyFreeGendered(freeAgentsText)) m.set(slug(p.name), p.gender);
    return m;
  }, [pairsText, freeAgentsText]);
  const rankedPreview = useMemo(() => formQuadTeams(units, genderOf, 'ranked'), [units, genderOf]);

  const totalPlayers = units.reduce((n, u) => n + u.players.length, 0);
  const hasBracket = brackets.some(b => b.division === division);
  // Default to whatever the current bracket is, so the toggle matches what's shown.
  const [elimType, setElimType] = useState<ElimType>(() =>
    brackets.some(b => b.division === division && b.bracketSide === 'L') ? 'double' : 'single');
  const makeBracket = (teams: Team[]) =>
    elimType === 'double' ? buildDoubleElimBracket(division, teams) : buildBracket(division, teams);

  const allPlayerNames = useMemo(
    () => uniq([
      ...parseMickeyPairsGendered(pairsText).flat().map(m => m.name),
      ...parseMickeyFreeGendered(freeAgentsText).map(m => m.name),
    ].filter(Boolean)),
    [pairsText, freeAgentsText],
  );

  const minTeams = elimType === 'double' ? 3 : 2;

  const formFor = (mode: BuildMode): PreparedTeam[] =>
    mode === 'crossover' ? formCrossoverTeams(units) : formQuadTeams(units, genderOf, mode).teams;

  const build = (mode: BuildMode) => {
    const prepared = formFor(mode);
    if (prepared.length < minTeams) {
      alert(mode === 'crossover'
        ? `Crossover pairing needs exactly 12 pairs/free agents. You currently have ${units.length}.`
        : `Need at least ${minTeams} teams worth of players to build a ${elimType}-elimination bracket.`);
      return;
    }
    setBrackets(() => makeBracket(toTeamObjs(prepared, division)));
    setConfirmMode(null);
    setEditTeams([]);
  };

  const onClickBuild = (mode: BuildMode) => {
    if (hasBracket) setConfirmMode(mode);
    else build(mode);
  };

  const prepareToEdit = (mode: BuildMode) => {
    const prepared = formFor(mode);
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
    if (objs.length < minTeams) { alert(`Need at least ${minTeams} teams (with players) to build a ${elimType}-elimination bracket.`); return; }
    setBrackets(() => makeBracket(objs));
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
          Builds a single- or double-elimination bracket from new teams of 4 (2 guys + 2 girls). Ranked groups guys
          and girls by their pool-play standings: the top 2 guys + top 2 girls are Team 1, the next 2 + 2 are Team 2,
          and so on. Pairs always stay together. Adjust the auto-formed teams before building, or build directly.
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          {totalPlayers} player{totalPlayers === 1 ? '' : 's'} · {units.length} pair/agent{units.length === 1 ? '' : 's'}{' '}
          · {rounds.length} round{rounds.length === 1 ? '' : 's'} played
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-slate-500 font-medium">Bracket type:</span>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[12px] font-medium">
          {([
            { key: 'single', label: 'Single elimination' },
            { key: 'double', label: 'Double elimination' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              type="button"
              className={'px-3 py-1.5 transition-colors ' + (elimType === opt.key ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              onClick={() => setElimType(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">
          {elimType === 'double'
            ? 'Every team must lose twice to be out. Losers drop to a second bracket; Grand Final has an "if necessary" reset game.'
            : 'One loss and you\'re out.'}
        </span>
      </div>
      {elimType === 'double' && hasBracket && !brackets.some(b => b.division === division && b.bracketSide === 'L') && (
        <p className="text-[11px] text-amber-700">The current bracket is single elimination — rebuild to switch it to double.</p>
      )}

      {rankedPreview.teams.length > 0 && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 text-[12px] space-y-1">
          <div className="font-semibold text-slate-700">Ranked teams preview</div>
          {rankedPreview.teams.map((t, i) => (
            <div key={t.id}><span className="font-semibold text-sky-800">Seed {i + 1}:</span> {t.players.join(', ')}</div>
          ))}
          {rankedPreview.leftOut.length > 0 && (
            <div className="text-amber-700">
              Can't fit on a 2 guys + 2 girls team: {rankedPreview.leftOut.join(', ')}. Mark someone as not playing,
              or use "Prepare Ranked Teams to Edit" to place them by hand.
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-[13px] disabled:opacity-40"
          disabled={rankedPreview.teams.length < minTeams}
          onClick={() => onClickBuild('ranked')}
        >
          {hasBracket ? 'Rebuild Ranked Bracket (1-4, 5-8…)' : 'Build Ranked Bracket (1-4, 5-8…)'}
        </button>
        <button
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[12px] disabled:opacity-40"
          disabled={rankedPreview.teams.length < 2}
          onClick={() => prepareToEdit('ranked')}
        >
          Prepare Ranked Teams to Edit…
        </button>
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

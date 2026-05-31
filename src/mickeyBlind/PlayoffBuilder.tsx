import React, { useMemo, useState } from 'react';
import type { BracketMatch, Team, PlayDiv } from '../types';
import {
  slug, uniq, parseScore, mickeyGamesWinner, mickeyTeamLabel,
  parseMickeyPairsGendered, parseMickeyFreeGendered,
  shuffle, pickFunTeamNames,
} from '../utils';
import { drawTeams, toUnit, type Unit } from '../mickey/TeamBuilder';
import { buildBracket } from '../components/BracketView';
import type { MickeyBDRound } from './RoundManager';

// One unit (a pair or a free agent) with their aggregate W/PD across all
// BD rounds they appeared in.
type UnitWithRecord = {
  name: string;
  kind: 'pair' | 'free';
  members: string[];
  M: number;
  F: number;
  skill: number; // total
  W: number;
  PD: number;
  size: number;
};

function computeUnits(
  rounds: MickeyBDRound[],
  pairsText: string,
  freeAgentsText: string,
): UnitWithRecord[] {
  const pairs = parseMickeyPairsGendered(pairsText);
  const frees = parseMickeyFreeGendered(freeAgentsText);

  const units: UnitWithRecord[] = [
    ...pairs.filter(u => u.length >= 1).map(u => ({
      name: u.map(m => m.name).join(' & '),
      kind: 'pair' as const,
      members: u.map(m => m.name),
      M: u.filter(m => m.gender === 'M').length,
      F: u.filter(m => m.gender === 'F').length,
      skill: u.reduce((n, m) => n + m.skill, 0),
      W: 0, PD: 0, size: u.length,
    })),
    ...frees.map(m => ({
      name: m.name,
      kind: 'free' as const,
      members: [m.name],
      M: m.gender === 'M' ? 1 : 0,
      F: m.gender === 'F' ? 1 : 0,
      skill: m.skill,
      W: 0, PD: 0, size: 1,
    })),
  ];

  for (const round of rounds) {
    for (const unit of units) {
      const slugs = unit.members.map(slug);
      const team = round.teams.find(t => {
        const set = new Set(t.players.map(slug));
        return slugs.every(s => set.has(s));
      });
      if (!team) continue;
      const match = round.matches.find(m => m.teamAId === team.id || m.teamBId === team.id);
      if (!match) continue;
      const isA = match.teamAId === team.id;
      for (const fmt of ['mickey', 'minnie'] as const) {
        const text = fmt === 'mickey' ? match.mickeyScore : match.minnieScore;
        const p = parseScore(text);
        if (!p || p[0] === p[1]) continue;
        const diff = Math.abs(p[0] - p[1]);
        const aWon = p[0] > p[1];
        const won = (isA && aWon) || (!isA && !aWon);
        if (won) { unit.W += 1; unit.PD += diff; }
        else { unit.PD -= diff; }
      }
    }
  }
  return units;
}

type PreparedTeam = { id: string; name: string; players: string[] };

// Form playoff teams via the standard pair-preserving FA-block draw.
// Pairs always stay together, gender and skill balance across teams.
function formPlayoffTeams(units: UnitWithRecord[]): PreparedTeam[] {
  const toGenderedNames = (u: UnitWithRecord) =>
    u.members.map((name, i) => {
      const gender: 'M' | 'F' | null =
        i < u.M ? 'M' : i < u.M + u.F ? 'F' : null;
      return { name, gender, skill: u.skill / u.size };
    });

  const pairUnits: Unit[] = units
    .filter(u => u.size >= 2)
    .map(u => toUnit(toGenderedNames(u)));
  const freeUnits: Unit[] = units
    .filter(u => u.size === 1)
    .map(u => toUnit(toGenderedNames(u)));

  const teams = drawTeams(pairUnits, freeUnits, 5);
  // Seed by aggregate team record (sum of member units' W/PD), best first
  const teamRecords = teams.map(t => {
    let W = 0, PD = 0;
    for (const u of units) {
      const onTeam = u.members.every(m => t.players.includes(m));
      if (onTeam) { W += u.W; PD += u.PD; }
    }
    return { t, W, PD };
  });
  teamRecords.sort((a, b) => b.W - a.W || b.PD - a.PD);
  return teamRecords.map(({ t }) => ({ id: t.id, name: t.name, players: t.players }));
}

// Crossover pairing: rank all 12 units by aggregate pool-play record,
// then pair seeds 1-3 with a random unit from seeds 7-9, and pair
// seeds 4-6 with a random unit from seeds 10-12. Produces 6 teams of
// mixed size (2-4 players) depending on whether each combined unit is
// a pair or a free agent. Pairs always stay together.
// Returns [] if there are not exactly 12 units.
function formCrossoverTeams(units: UnitWithRecord[]): PreparedTeam[] {
  if (units.length !== 12) return [];
  const ranked = [...units].sort(
    (a, b) => b.W - a.W || b.PD - a.PD || a.name.localeCompare(b.name),
  );
  const top = ranked.slice(0, 3);         // seeds 1-3
  const upperMid = ranked.slice(3, 6);    // seeds 4-6
  const lowerMid = shuffle(ranked.slice(6, 9));   // seeds 7-9 (randomized)
  const bottom = shuffle(ranked.slice(9, 12));    // seeds 10-12 (randomized)
  const names = pickFunTeamNames(6);

  const teams: PreparedTeam[] = [];
  for (let i = 0; i < 3; i++) {
    teams.push({
      id: `xover-top-${i + 1}`,
      name: names[i],
      players: [...top[i].members, ...lowerMid[i].members],
    });
  }
  for (let i = 0; i < 3; i++) {
    teams.push({
      id: `xover-mid-${i + 1}`,
      name: names[i + 3],
      players: [...upperMid[i].members, ...bottom[i].members],
    });
  }
  return teams;
}

function firstNamesOnly(label: string): string {
  const m = label.match(/^(.*)\s\(([^)]*)\)$/);
  return m ? m[2] : label;
}

export function MickeyBDPlayoffBuilder({
  rounds,
  pairsText,
  freeAgentsText,
  brackets,
  setBrackets,
  division,
}: {
  rounds: MickeyBDRound[];
  pairsText: string;
  freeAgentsText: string;
  brackets: BracketMatch[];
  setBrackets: (f: ((prev: BracketMatch[]) => BracketMatch[]) | BracketMatch[]) => void;
  division: 'UPPER' | 'LOWER';
}) {
  const [editTeams, setEditTeams] = useState<PreparedTeam[]>([]);
  const [confirmBuild, setConfirmBuild] = useState(false);

  const allPlayerNames = useMemo(
    () => uniq([
      ...parseMickeyPairsGendered(pairsText).flat().map(m => m.name),
      ...parseMickeyFreeGendered(freeAgentsText).map(m => m.name),
    ].filter(Boolean)),
    [pairsText, freeAgentsText],
  );

  const units = useMemo(
    () => computeUnits(rounds, pairsText, freeAgentsText),
    [rounds, pairsText, freeAgentsText],
  );
  const totalPlayers = units.reduce((n, u) => n + u.size, 0);

  const computeSeeded = (): PreparedTeam[] => formPlayoffTeams(units);

  const toTeamObjs = (list: PreparedTeam[]): Team[] =>
    list
      .map(t => ({ name: t.name, players: t.players.map(s => s.trim()).filter(Boolean) }))
      .filter(t => t.players.length >= 1)
      .map((t, i) => ({
        id: `${division}-${i + 1}-${slug(t.name)}`,
        name: mickeyTeamLabel({ name: t.name, players: t.players }, pairsText),
        members: t.players,
        seed: i + 1,
        division: division as PlayDiv,
      }));

  const quickBuild = () => {
    const objs = toTeamObjs(computeSeeded());
    if (objs.length < 2) { alert('Need at least 2 playoff teams.'); return; }
    setBrackets(() => buildBracket(division, objs));
    setEditTeams([]);
    setConfirmBuild(false);
  };

  const prepareTeams = () => {
    setEditTeams(computeSeeded().map((t, i) => ({
      id: `edit-${i}`,
      name: t.name,
      players: [...t.players, '', '', '', ''].slice(0, 4),
    })));
  };

  const prepareCrossoverTeams = () => {
    const xover = formCrossoverTeams(units);
    if (xover.length === 0) {
      alert(`Crossover pairing needs exactly 12 units (pairs + free agents). You currently have ${units.length}.`);
      return;
    }
    setEditTeams(xover.map(t => ({
      id: t.id,
      name: t.name,
      players: [...t.players, '', '', '', ''].slice(0, 4),
    })));
  };

  const buildFromEdit = () => {
    const objs = toTeamObjs(editTeams);
    if (objs.length < 2) { alert('Need at least 2 teams (with players) to build a bracket.'); return; }
    setBrackets(() => buildBracket(division, objs));
    setEditTeams([]);
    setConfirmBuild(false);
  };

  const buildRedemptionRally = () => {
    setBrackets(prev => {
      const mainOnly = prev.filter(b => b.division !== 'RR');
      const losers: Team[] = [];
      for (const m of mainOnly) {
        if (m.division !== division) continue;
        if (m.round !== 1 && m.round !== 2) continue;
        if (!m.team1 || !m.team2) continue;
        const w = mickeyGamesWinner(m.games, m.score);
        if (!w) continue;
        const loser = w === 'team1' ? m.team2 : m.team1;
        if (loser) losers.push(loser);
      }
      if (losers.length < 2) {
        alert('Not enough finished Round 1 / Round 2 games yet to build the Redemption Rally.');
        return prev;
      }
      const rr: Team[] = losers.map((t, i) => ({
        ...t, id: `RR-${i + 1}-${slug(t.name)}`, seed: i + 1, division: 'RR' as PlayDiv,
      }));
      return [...mainOnly, ...buildBracket('RR', rr)];
    });
  };

  // Edit helpers
  const setMember = (tIdx: number, mIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) =>
      i === tIdx ? { ...t, players: t.players.map((p, j) => (j === mIdx ? value : p)) } : t));
  const setTName = (tIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) => (i === tIdx ? { ...t, name: value } : t)));
  const move = (idx: number, dir: -1 | 1) =>
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

  const preview = useMemo(() => {
    const objs = toTeamObjs(editTeams);
    if (objs.length < 2) return [];
    return buildBracket(division, objs).filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
  }, [editTeams, division, pairsText]);

  const dupNames = useMemo(() => {
    const all = editTeams.flatMap(t => t.players.filter(Boolean));
    return uniq(all.filter((n, i) => all.indexOf(n) !== i));
  }, [editTeams]);

  const hasMain = brackets.some(b => b.division === division);
  const hasRR = brackets.some(b => b.division === 'RR');

  const r12Finished = brackets.filter(b => {
    if (b.division !== division) return false;
    if (b.round !== 1 && b.round !== 2) return false;
    if (!b.team1 || !b.team2) return false;
    return !!mickeyGamesWinner(b.games, b.score);
  }).length;
  const r12Total = brackets.filter(b => b.division === division && (b.round === 1 || b.round === 2) && b.team1 && b.team2).length;

  return (
    <section className="space-y-4">
      <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-2">
        <div>
          <h2 className="text-[16px] font-semibold text-sky-800">Playoffs ({division})</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Playoff teams form by re-drawing fresh teams of 4 from your pairs and free agents using their
            aggregate pool-play records. Pairs always stay together. Adjust the auto-formed teams below
            before building the bracket. Rounds 1 &amp; 2 are single games to 25; semifinal &amp; final are
            best of 3 (21/21/15).
          </p>
        </div>
        <div className="text-[11px] text-slate-500">
          {totalPlayers} player{totalPlayers === 1 ? '' : 's'} · {units.length} unit{units.length === 1 ? '' : 's'}
          {' · '}{rounds.length} round{rounds.length === 1 ? '' : 's'} played
        </div>
      </section>

      {/* Main Bracket */}
      <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-sky-800">Main Bracket</h3>
          <p className="text-[11px] text-slate-500 mt-1">
            Seeded single-elimination bracket. Build it directly or prepare an editable team list first.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[13px] disabled:opacity-40"
            disabled={totalPlayers < 8}
            onClick={() => (hasMain ? setConfirmBuild(true) : quickBuild())}
          >
            {hasMain ? 'Rebuild Bracket' : 'Build Bracket'}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[13px] disabled:opacity-40"
            disabled={totalPlayers < 8}
            onClick={prepareTeams}
          >
            Prepare Teams to Edit…
          </button>
          {division === 'UPPER' && (
            <button
              className="px-3 py-1.5 rounded-lg border border-indigo-400 text-indigo-700 hover:bg-indigo-50 text-[13px] disabled:opacity-40"
              disabled={units.length !== 12}
              onClick={prepareCrossoverTeams}
              title={units.length === 12
                ? 'Pairs seeds 1-3 with random units from seeds 7-9, and seeds 4-6 with random units from seeds 10-12'
                : `Needs exactly 12 units. You currently have ${units.length}.`}
            >
              Crossover Pairing (1-3 ↔ 7-9, 4-6 ↔ 10-12)
            </button>
          )}
        </div>
        {division === 'UPPER' && (
          <p className="text-[11px] text-slate-500">
            <span className="font-semibold text-indigo-700">Crossover Pairing</span> ranks all 12 units (pairs + free agents) by their pool-play record, then pairs top seeds 1-3 with a random unit from seeds 7-9, and seeds 4-6 with a random unit from seeds 10-12 — six teams of mixed size (2-4 players). Pairs always stay together. Loads into the editor below so you can review before building.
          </p>
        )}

        {confirmBuild && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-[12px]">
            <span className="text-amber-800">Rebuild the bracket? This clears the current {division} bracket and any scores in it.</span>
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]" onClick={quickBuild}>Rebuild</button>
              <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmBuild(false)}>Cancel</button>
            </div>
          </div>
        )}

        {totalPlayers < 8 && (
          <p className="text-[11px] text-slate-400">Need at least 8 players (2 teams of 4) to build a bracket.</p>
        )}

        {/* Edit panel */}
        {editTeams.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[13px] font-semibold text-slate-800">
                Adjust Teams &amp; Seeds ({editTeams.length} team{editTeams.length === 1 ? '' : 's'})
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]" onClick={prepareTeams}>
                  Re-shuffle
                </button>
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
                      onChange={e => setTName(tIdx, e.target.value)}
                    />
                    <button className="px-1.5 py-1 text-[12px] rounded border disabled:opacity-30" disabled={tIdx === 0} onClick={() => move(tIdx, -1)} title="Move up (higher seed)">▲</button>
                    <button className="px-1.5 py-1 text-[12px] rounded border disabled:opacity-30" disabled={tIdx === editTeams.length - 1} onClick={() => move(tIdx, 1)} title="Move down (lower seed)">▼</button>
                    <button className="px-1.5 py-1 text-[12px] rounded text-red-500 hover:text-red-700" onClick={() => removeTeamAt(tIdx)} title="Remove team">✕</button>
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

            {preview.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-slate-700 mb-1">Round 1 preview (who plays whom)</div>
                <ul className="text-[12px] text-slate-600 space-y-0.5">
                  {preview.map(m => {
                    const a = m.team1 ? `#${m.team1.seed} ${firstNamesOnly(m.team1.name)}` : '—';
                    const b = m.team2 ? `#${m.team2.seed} ${firstNamesOnly(m.team2.name)}` : null;
                    return (
                      <li key={m.id}>
                        {b ? <>{a} <span className="text-slate-400">vs</span> {b}</> : <>{a} <span className="text-emerald-600">— BYE</span></>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Reorder seeds with ▲▼ to change who plays whom; swap players between teams with the dropdowns.
              "Build Bracket from These Teams" locks it in.
            </p>
          </div>
        )}
      </section>

      {/* Redemption Rally */}
      <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-indigo-200 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[15px] font-semibold text-sky-800">Redemption Rally</h3>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">
            Consolation bracket
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          A second-chance bracket built from teams that lost in round 1 or round 2 of the {division} main bracket.
        </p>

        {!hasMain ? (
          <p className="text-[12px] text-slate-500 bg-slate-50 rounded-lg p-3">
            Build the main {division} bracket first. Once teams start losing in round 1 / round 2, they'll be eligible to enter here.
          </p>
        ) : (
          <p className="text-[12px] text-slate-600 bg-slate-50 rounded-lg p-3">
            <span className="font-semibold text-slate-800">{r12Finished}</span> finished round 1/2 {r12Finished === 1 ? 'game' : 'games'}{' '}
            out of {r12Total} eligible. Need at least 2 completed games to seed the bracket.
          </p>
        )}

        <div>
          <button
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-[13px] disabled:opacity-40"
            disabled={!hasMain || r12Finished < 2}
            onClick={buildRedemptionRally}
            title={!hasMain ? 'Build the main bracket first' : r12Finished < 2 ? 'Need at least 2 completed round 1/2 games' : ''}
          >
            {hasRR ? 'Rebuild Redemption Rally' : 'Build Redemption Rally'}
          </button>
        </div>
      </section>
    </section>
  );
}

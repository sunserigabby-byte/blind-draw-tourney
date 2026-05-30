import React, { useMemo, useState } from 'react';
import type { MickeyTeam, MickeyMatchRow, BracketMatch, Team, PlayDiv } from '../types';
import {
  slug, uniq, shuffle, computeMickeyTeamStats, mickeyGamesWinner, mickeyTeamLabel,
  pickFunTeamNames, parseMickeyPairsGendered, parseMickeyFreeGendered,
} from '../utils';
import { buildBracket } from '../components/BracketView';

// ── Parse helpers (clean names, markers stripped) ────────────────────────────
function parsePairsClean(text: string): string[][] {
  return parseMickeyPairsGendered(text)
    .map(u => u.map(m => m.name).filter(Boolean))
    .filter(g => g.length >= 2);
}
function parseFreeClean(text: string): string[] {
  return parseMickeyFreeGendered(text).map(m => m.name).filter(Boolean);
}

type PreparedTeam = { id: string; name: string; players: string[] };
type TeamSource = 'KEEP' | 'REDRAW';

type Bucket = 'pairsMF' | 'pairsMM' | 'pairsFF' | 'pairsOther' | 'freeM' | 'freeF' | 'freeUnknown';
type Composition = Bucket[];

const COMPOSITIONS: Composition[] = [
  ['pairsMF', 'pairsMF'],
  ['pairsMM', 'pairsFF'],
  ['pairsMF', 'freeM', 'freeF'],
  ['pairsMM', 'freeF', 'freeF'],
  ['pairsFF', 'freeM', 'freeM'],
  ['freeM', 'freeM', 'freeF', 'freeF'],
];

// Composition-aware playoff re-draw: forms fresh teams of 4 using random 2M+2F
// templates, balanced for (a) gender, (b) skill (from (M3)/(F4) markers), and
// (c) pool-play record. Pairs always stay together.
function redrawBalanced(
  teams: MickeyTeam[],
  matches: MickeyMatchRow[],
  pairsText: string,
  freeAgentsText: string,
): PreparedTeam[] {
  const stats = computeMickeyTeamStats(matches, teams);
  const teamSlugSets = teams.map(t => ({ t, set: new Set(t.players.map(slug)) }));
  const recordOf = (members: string[]) => {
    const team =
      teamSlugSets.find(x => members.every(m => x.set.has(slug(m))))?.t ??
      teamSlugSets.find(x => x.set.has(slug(members[0])))?.t;
    const s = team ? stats.get(team.id) : undefined;
    return { W: s?.W ?? 0, PD: s?.PD ?? 0 };
  };

  type Unit = {
    members: string[]; size: number;
    M: number; F: number; totalSkill: number;
    W: number; PD: number;
  };
  const pairs = parseMickeyPairsGendered(pairsText).filter(u => u.length >= 1);
  const frees = parseMickeyFreeGendered(freeAgentsText);
  const pairUnits: Unit[] = pairs.map(u => ({
    members: u.map(m => m.name),
    size: u.length,
    M: u.filter(m => m.gender === 'M').length,
    F: u.filter(m => m.gender === 'F').length,
    totalSkill: u.reduce((n, m) => n + m.skill, 0),
    ...recordOf(u.map(m => m.name)),
  }));
  const freeUnits: Unit[] = frees.map(m => ({
    members: [m.name],
    size: 1,
    M: m.gender === 'M' ? 1 : 0,
    F: m.gender === 'F' ? 1 : 0,
    totalSkill: m.skill,
    ...recordOf([m.name]),
  }));
  if (pairUnits.length + freeUnits.length === 0) return [];

  const totalPlayers = pairUnits.reduce((n, u) => n + u.size, 0) + freeUnits.length;
  const totalSkill =
    pairUnits.reduce((n, u) => n + u.totalSkill, 0) +
    freeUnits.reduce((n, u) => n + u.totalSkill, 0);
  const totalW =
    pairUnits.reduce((n, u) => n + u.W, 0) +
    freeUnits.reduce((n, u) => n + u.W, 0);
  const T = Math.max(1, Math.ceil(totalPlayers / 4));
  const targetSkillPerPlayer = totalPlayers > 0 ? totalSkill / totalPlayers : 3;
  const targetWPerTeam = T > 0 ? totalW / T : 0;

  type Bin = {
    players: string[]; size: number;
    M: number; F: number; totalSkill: number;
    W: number; PD: number;
  };
  const buckets: Record<Bucket, Unit[]> = {
    pairsMF: shuffle(pairUnits.filter(u => u.M === 1 && u.F === 1)),
    pairsMM: shuffle(pairUnits.filter(u => u.M === 2 && u.F === 0)),
    pairsFF: shuffle(pairUnits.filter(u => u.F === 2 && u.M === 0)),
    pairsOther: shuffle(pairUnits.filter(u => u.M + u.F < 2)),
    freeM: shuffle(freeUnits.filter(u => u.M === 1)),
    freeF: shuffle(freeUnits.filter(u => u.F === 1)),
    freeUnknown: shuffle(freeUnits.filter(u => u.M === 0 && u.F === 0)),
  };

  const compositionFits = (comp: Composition): boolean => {
    const need: Partial<Record<Bucket, number>> = {};
    for (const b of comp) need[b] = (need[b] ?? 0) + 1;
    return (Object.entries(need) as [Bucket, number][])
      .every(([b, n]) => buckets[b].length >= n);
  };

  // Pick (and remove) the unit whose skill + record best balance the team so
  // far. Top-3 random tiebreak so each re-shuffle has some variety.
  const takeBalanced = (list: Unit[], team: Bin): Unit => {
    const scored = list.map((u, idx) => {
      const newSize = team.size + u.size;
      const idealSkill = newSize * targetSkillPerPlayer;
      const idealW = (newSize / 4) * targetWPerTeam;
      const skillDist = Math.abs(team.totalSkill + u.totalSkill - idealSkill);
      const wDist = Math.abs(team.W + u.W - idealW);
      return { idx, u, dist: skillDist * 2 + wDist };
    }).sort((a, b) => a.dist - b.dist);
    const K = Math.min(3, scored.length);
    const pick = scored[Math.floor(Math.random() * K)];
    list.splice(pick.idx, 1);
    return pick.u;
  };

  const addUnit = (team: Bin, u: Unit) => {
    team.players.push(...u.members);
    team.size += u.size;
    team.M += u.M;
    team.F += u.F;
    team.totalSkill += u.totalSkill;
    team.W += u.W;
    team.PD += u.PD;
  };

  const bins: Bin[] = [];

  while (true) {
    const valid = COMPOSITIONS.filter(compositionFits);
    if (valid.length === 0) break;
    const comp = valid[Math.floor(Math.random() * valid.length)];
    const team: Bin = { players: [], size: 0, M: 0, F: 0, totalSkill: 0, W: 0, PD: 0 };
    for (const slot of comp) {
      const u = takeBalanced(buckets[slot], team);
      addUnit(team, u);
    }
    bins.push(team);
  }

  // Fallback: anything left (uneven gender stocks, unmarked names) gets packed
  // greedily, scored by gender + skill + record distance.
  const leftoverPairs = shuffle([
    ...buckets.pairsMF, ...buckets.pairsMM, ...buckets.pairsFF, ...buckets.pairsOther,
  ]);
  const leftoverFrees = shuffle([
    ...buckets.freeM, ...buckets.freeF, ...buckets.freeUnknown,
  ]);

  const placeLeftover = (u: Unit) => {
    let best: Bin | null = null;
    let bestScore = Infinity;
    for (const t of bins) {
      if (t.size + u.size > 4) continue;
      const newSize = t.size + u.size;
      const newSkill = t.totalSkill + u.totalSkill;
      const newW = t.W + u.W;
      const newM = t.M + u.M;
      const newF = t.F + u.F;
      const genderDist = Math.abs(newM - 2) + Math.abs(newF - 2);
      const skillDist = Math.abs(newSkill - newSize * targetSkillPerPlayer);
      const wDist = Math.abs(newW - (newSize / 4) * targetWPerTeam);
      const score = genderDist * 1000 + skillDist * 10 + wDist * 5 + newSize;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) {
      best = { players: [], size: 0, M: 0, F: 0, totalSkill: 0, W: 0, PD: 0 };
      bins.push(best);
    }
    addUnit(best, u);
  };

  for (const u of leftoverPairs) placeLeftover(u);
  for (const u of leftoverFrees) placeLeftover(u);

  const filled = bins.filter(b => b.players.length).sort((a, b) => b.W - a.W || b.PD - a.PD);
  const names = pickFunTeamNames(filled.length);
  return filled.map((b, i) => ({ id: `redraw-${i}`, name: names[i], players: b.players }));
}

export function MickeyPlayoffBuilder({
  teams,
  matches,
  pairsText,
  freeAgentsText,
  brackets,
  setBrackets,
  division,
}: {
  teams: MickeyTeam[];
  matches: MickeyMatchRow[];
  pairsText: string;
  freeAgentsText: string;
  brackets: BracketMatch[];
  setBrackets: (f: ((prev: BracketMatch[]) => BracketMatch[]) | BracketMatch[]) => void;
  division: 'UPPER' | 'LOWER';
}) {
  const [teamSource, setTeamSource] = useState<TeamSource>('KEEP');
  const [editTeams, setEditTeams] = useState<PreparedTeam[]>([]);
  const [confirmBuild, setConfirmBuild] = useState(false);

  const allPlayerNames = useMemo(
    () => uniq([
      ...teams.flatMap(t => t.players),
      ...parsePairsClean(pairsText).flat(),
      ...parseFreeClean(freeAgentsText),
    ].map(s => s.trim()).filter(Boolean)),
    [teams, pairsText, freeAgentsText],
  );

  // Teams in seed order, computed fresh on each call (so Re-shuffle actually re-draws).
  const computeSeeded = (): PreparedTeam[] => {
    if (teamSource === 'REDRAW') {
      return redrawBalanced(teams, matches, pairsText, freeAgentsText);
    }
    const stats = computeMickeyTeamStats(matches, teams);
    return [...teams]
      .sort((a, b) => {
        const sa = stats.get(a.id)!;
        const sb = stats.get(b.id)!;
        return sb.W - sa.W || sb.PD - sa.PD || a.name.localeCompare(b.name);
      })
      .map(t => ({ id: t.id, name: t.name, players: t.players }));
  };

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
    if (objs.length < 2) { alert('Need at least 2 teams to build a bracket.'); return; }
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

  // ── Edit helpers ───────────────────────────────────────────────────────────
  const setMember = (tIdx: number, mIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) =>
      i === tIdx ? { ...t, players: t.players.map((p, j) => (j === mIdx ? value : p)) } : t));
  const setName = (tIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) => (i === tIdx ? { ...t, name: value } : t)));
  const move = (idx: number, dir: -1 | 1) =>
    setEditTeams(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  const removeTeam = (idx: number) => setEditTeams(prev => prev.filter((_, i) => i !== idx));
  const addTeam = () =>
    setEditTeams(prev => [...prev, { id: `edit-new-${Date.now()}`, name: `Team ${prev.length + 1}`, players: ['', '', '', ''] }]);

  // Round-1 matchup preview from the current edit order.
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

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4 space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold text-sky-800">Playoffs ({division})</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Rounds 1 &amp; 2 are a single game to 25; semifinal &amp; final are match play (21/21/15, best of the
          games you play). Higher seed picks Mickey or Minnie on each game card.
        </p>
      </div>

      {/* Team source toggle */}
      <div className="flex items-center gap-4 flex-wrap text-[12px]">
        <span className="font-medium text-slate-700">Playoff teams:</span>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={teamSource === 'KEEP'} onChange={() => setTeamSource('KEEP')} />
          Keep pool teams (seed by record)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={teamSource === 'REDRAW'} onChange={() => setTeamSource('REDRAW')} />
          Re-draw balanced teams
        </label>
      </div>
      {teamSource === 'REDRAW' && (
        <p className="text-[11px] text-slate-500">
          Re-draw forms fresh teams of 4 (pairs kept together), spreading strong and weak pairs/free agents
          evenly using their pool-play records. Click "Prepare Teams to Edit" to review or re-shuffle before locking.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[13px] disabled:opacity-40"
          disabled={teams.length < 2}
          onClick={() => (hasMain ? setConfirmBuild(true) : quickBuild())}
        >
          {hasMain ? 'Rebuild Bracket' : 'Build Bracket'}
        </button>
        <button
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[13px] disabled:opacity-40"
          disabled={teams.length < 2}
          onClick={prepareTeams}
        >
          Prepare Teams to Edit…
        </button>
        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-[13px] disabled:opacity-40"
          disabled={!hasMain}
          onClick={buildRedemptionRally}
        >
          {hasRR ? 'Rebuild Redemption Rally' : 'Build Redemption Rally'}
        </button>
      </div>

      {confirmBuild && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-[12px]">
          <span className="text-amber-800">Rebuild the bracket? This clears the current {division} bracket and any scores in it.</span>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]" onClick={quickBuild}>Rebuild</button>
            <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmBuild(false)}>Cancel</button>
          </div>
        </div>
      )}

      {teams.length < 2 && (
        <p className="text-[11px] text-slate-400">Build teams in the section above before seeding playoffs.</p>
      )}

      {/* Edit panel */}
      {editTeams.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[13px] font-semibold text-slate-800">
              Adjust Teams &amp; Seeds ({editTeams.length} team{editTeams.length === 1 ? '' : 's'})
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {teamSource === 'REDRAW' && (
                <button className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]" onClick={prepareTeams}>
                  Re-shuffle
                </button>
              )}
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
                    onChange={e => setName(tIdx, e.target.value)}
                  />
                  <button className="px-1.5 py-1 text-[12px] rounded border disabled:opacity-30" disabled={tIdx === 0} onClick={() => move(tIdx, -1)} title="Move up (higher seed)">▲</button>
                  <button className="px-1.5 py-1 text-[12px] rounded border disabled:opacity-30" disabled={tIdx === editTeams.length - 1} onClick={() => move(tIdx, 1)} title="Move down (lower seed)">▼</button>
                  <button className="px-1.5 py-1 text-[12px] rounded text-red-500 hover:text-red-700" onClick={() => removeTeam(tIdx)} title="Remove team">✕</button>
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

          {/* Round-1 matchup preview */}
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
            Drag seeds with ▲▼ to change who plays whom, or swap players between teams with the dropdowns.
            "Build Bracket from These Teams" locks it in.
          </p>
        </div>
      )}
    </section>
  );
}

// The bracket stores team names as "Fun (first names)"; show just the inside in the preview.
function firstNamesOnly(label: string): string {
  const m = label.match(/^(.*)\s\(([^)]*)\)$/);
  return m ? m[2] : label;
}

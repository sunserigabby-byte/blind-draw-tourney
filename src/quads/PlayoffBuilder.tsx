import React, { useMemo, useState } from 'react';
import type { QuadsMatchRow, BracketMatch, PlayDiv, Team } from '../types';
import { slug, clampN, uniq, shuffle, parseScore } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeQuadsStandingsFull, QuadsPlayerRow } from './Leaderboard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Form 4-person 2G+2G teams from a sorted pool.
 * Players are paired within ranking windows so nearby seeds can play together.
 */
function buildQuadsPlayoffTeams(
  pool: QuadsPlayerRow[],
  windowSize: number,
  randomize: boolean,
  div: PlayDiv,
): Team[] {
  const teams: Team[] = [];
  const guys = pool.filter(p => p.gender === 'M');
  const girls = pool.filter(p => p.gender === 'F');
  const win = Math.max(2, windowSize);

  // K is the number of players from each gender we can form balanced teams from
  const K = Math.min(guys.length, girls.length);

  for (let base = 0; base < K; base += win) {
    const end = Math.min(base + win, K);
    const gSlice = randomize ? shuffle(guys.slice(base, end)) : guys.slice(base, end);
    const hSlice = randomize ? shuffle(girls.slice(base, end)) : girls.slice(base, end);

    // Pair off gSlice[0]+gSlice[1] with hSlice[0]+hSlice[1], etc.
    const pairs = Math.floor(Math.min(gSlice.length, hSlice.length) / 2);
    for (let p = 0; p < pairs; p++) {
      const members = [
        gSlice[p * 2].name,
        gSlice[p * 2 + 1].name,
        hSlice[p * 2].name,
        hSlice[p * 2 + 1].name,
      ];
      teams.push({
        id: `${div}-tmp-${teams.length + 1}`,
        name: members.join(' / '),
        members,
        seed: teams.length + 1,
        division: div,
      });
    }
  }

  return teams;
}

/** Sort and re-seed teams by combined pool play W then PD. */
function reseedTeams(
  teams: Team[],
  statMap: Map<string, { W: number; PD: number }>,
  div: PlayDiv,
): Team[] {
  const scored = teams.map(t => ({
    team: t,
    W: t.members.reduce((s, n) => s + (statMap.get(n)?.W ?? 0), 0),
    PD: t.members.reduce((s, n) => s + (statMap.get(n)?.PD ?? 0), 0),
  }));
  scored.sort((a, b) => b.W - a.W || b.PD - a.PD || a.team.name.localeCompare(b.team.name));
  return scored.map(({ team }, i) => ({
    ...team,
    seed: i + 1,
    id: `${div}-${i + 1}-${slug(team.name)}`,
    division: div,
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

type EditTeam = { id: string; members: string[] };

export function QuadsPlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
  baseDivision = 'UPPER',
  scoreSettings,
}: {
  matches: QuadsMatchRow[];
  guysText: string;
  girlsText: string;
  setBrackets: (f: (prev: BracketMatch[]) => BracketMatch[] | BracketMatch[]) => void;
  baseDivision?: 'UPPER' | 'LOWER';
  scoreSettings?: { playTo: number; cap: number | null };
}) {
  const { guysRows, girlsRows, allRows } = useMemo(
    () => computeQuadsStandingsFull(matches, guysText, girlsText),
    [matches, guysText, girlsText],
  );

  const statMap = useMemo(() => {
    const m = new Map<string, { W: number; PD: number }>();
    [...guysRows, ...girlsRows].forEach(r => m.set(r.name, { W: r.W, PD: r.PD }));
    return m;
  }, [guysRows, girlsRows]);

  // All registered players (for dropdowns)
  const allPlayerNames = useMemo(() => uniq([
    ...(guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    ...(girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
  ]), [guysText, girlsText]);

  type SelectMode = 'COMBINED' | 'SPLIT';
  const [selectMode, setSelectMode] = useState<SelectMode>('COMBINED');
  const [totalPlayers, setTotalPlayers] = useState(16);
  const [perGender, setPerGender] = useState(4);
  const [windowSize, setWindowSize] = useState(4);
  const [randomize, setRandomize] = useState(true);
  const [splitBracket, setSplitBracket] = useState(false);
  const [upperCut, setUpperCut] = useState(4);
  const [rrRandomize, setRrRandomize] = useState(false);

  // Edit-before-bracket state
  const [editTeams, setEditTeams] = useState<EditTeam[]>([]);

  const buildPool = (): QuadsPlayerRow[] => {
    if (selectMode === 'COMBINED') {
      return allRows.slice(0, Math.min(clampN(totalPlayers, 4), allRows.length));
    }
    const k = clampN(perGender, 1);
    return [
      ...guysRows.slice(0, k).map(r => ({ ...r, gender: 'M' as const })),
      ...girlsRows.slice(0, k).map(r => ({ ...r, gender: 'F' as const })),
    ];
  };

  // ── Quick build ──────────────────────────────────────────────────────────

  function quickBuildSingle(div: PlayDiv, pool: QuadsPlayerRow[]) {
    const raw = buildQuadsPlayoffTeams(pool, windowSize, randomize, div);
    return buildBracket(div, reseedTeams(raw, statMap, div));
  }

  function onQuickBuild() {
    const pool = buildPool();
    if (pool.length < 4) { alert('Not enough players for a bracket.'); return; }

    if (splitBracket) {
      // upperCut = number of teams in upper bracket; need 2*upperCut players per gender
      const perSide = Math.max(2, Math.min(upperCut, Math.floor(pool.length / 2)));
      // Take the top perSide*2 players for upper, rest for lower
      const uPool = pool.slice(0, perSide * 2);
      const lPool = pool.slice(perSide * 2);
      if (lPool.length < 4) { alert('Not enough players for a lower bracket. Reduce the split cut.'); return; }
      setBrackets(() => [...quickBuildSingle('UPPER', uPool), ...quickBuildSingle('LOWER', lPool)]);
    } else {
      setBrackets(() => quickBuildSingle(baseDivision, pool));
    }
  }

  // ── Edit-before-bracket ──────────────────────────────────────────────────

  function onGenerateTeams() {
    const pool = buildPool();
    if (pool.length < 4) { alert('Not enough players to generate teams.'); return; }

    const raw = buildQuadsPlayoffTeams(pool, windowSize, randomize, baseDivision);
    if (raw.length === 0) {
      alert(
        `Could not form any 2G+2G teams. Got ${pool.filter(p => p.gender === 'M').length} guys ` +
        `and ${pool.filter(p => p.gender === 'F').length} girls — need at least 4 of each.`
      );
      return;
    }

    setEditTeams(raw.map((t, i) => ({
      id: `edit-${i}`,
      // Pad to 4 slots for the editor
      members: [...t.members, '', '', '', ''].slice(0, 4),
    })));
  }

  function addEmptyTeam() {
    setEditTeams(prev => [...prev, { id: `edit-new-${Date.now()}`, members: ['', '', '', ''] }]);
  }

  function removeTeam(idx: number) {
    setEditTeams(prev => prev.filter((_, i) => i !== idx));
  }

  function handleMemberChange(tIdx: number, mIdx: number, value: string) {
    setEditTeams(prev => prev.map((t, i) =>
      i === tIdx ? { ...t, members: t.members.map((m, j) => j === mIdx ? value : m) } : t
    ));
  }

  function onBuildBracketFromTeams() {
    if (!editTeams.length) { alert('No teams to build from.'); return; }

    const finalTeams = editTeams
      .map((t, i) => {
        const members = t.members.map(m => m.trim()).filter(Boolean);
        return { members, name: members.join(' / ') || `Team ${i + 1}` };
      })
      .filter(t => t.members.length >= 2); // need at least 2 players

    if (finalTeams.length < 2) {
      alert('Need at least 2 teams with 2+ players each to build a bracket.');
      return;
    }

    const teams: Team[] = finalTeams.map((t, i) => ({
      id: `Q-edit-${i}`,
      name: t.name,
      members: t.members,
      seed: 0,
      division: baseDivision,
    }));

    const reseeded = reseedTeams(teams, statMap, baseDivision);
    setBrackets(() => buildBracket(baseDivision, reseeded));
    setEditTeams([]);
  }

  // ── Redemption Rally ─────────────────────────────────────────────────────

  function buildRedemptionRally() {
    setBrackets(prev => {
      const mainOnly = prev.filter(b => b.division !== 'RR');
      const divs: PlayDiv[] = splitBracket ? ['UPPER', 'LOWER'] : [baseDivision];

      const losers: Team[] = [];
      for (const m of mainOnly) {
        if (!divs.includes(m.division)) continue;
        if (m.round !== 1 && m.round !== 2) continue;
        if (!m.team1 || !m.team2 || !m.score?.trim()) continue;
        const parsed = parseScore(m.score);
        if (!parsed || parsed[0] === parsed[1]) continue;
        const loser = parsed[0] > parsed[1] ? m.team2 : m.team1;
        if (!loser) continue;
        losers.push({ ...loser, seed: losers.length + 1, division: 'RR' as PlayDiv });
      }

      if (losers.length < 2) {
        alert('Not enough completed R1/R2 matches to build Redemption Rally.');
        return prev;
      }

      let rrTeams: Team[];

      if (!rrRandomize) {
        // Keep original teams, just re-label as RR
        rrTeams = losers.map((t, i) => ({
          ...t, seed: i + 1, id: `RR-${i + 1}-${slug(t.name)}`, division: 'RR' as PlayDiv,
        }));
      } else {
        // Shuffle all loser players into new 2G+2G teams
        const allNames = uniq(losers.flatMap(t => t.members).filter(Boolean));
        const rrGuys = shuffle(allNames.filter(n => guysRows.some(r => r.name === n)));
        const rrGirls = shuffle(allNames.filter(n => girlsRows.some(r => r.name === n)));
        const pairs = Math.floor(Math.min(rrGuys.length, rrGirls.length) / 2);
        rrTeams = [];
        for (let i = 0; i < pairs; i++) {
          const members = [rrGuys[i * 2], rrGuys[i * 2 + 1], rrGirls[i * 2], rrGirls[i * 2 + 1]].filter(Boolean);
          const name = members.join(' / ');
          rrTeams.push({ id: `RR-${i + 1}-${slug(name)}`, name, members, seed: i + 1, division: 'RR' });
        }
        rrTeams = reseedTeams(rrTeams, statMap, 'RR');
      }

      if (rrTeams.length < 2) { alert('Not enough valid RR teams.'); return prev; }
      return [...mainOnly, ...buildBracket('RR', rrTeams)];
    });
  }

  // ── Validation ───────────────────────────────────────────────────────────

  const dupNames = useMemo(() => {
    const all = editTeams.flatMap(t => t.members.filter(Boolean));
    return Array.from(new Set(all.filter((n, i) => all.indexOf(n) !== i)));
  }, [editTeams]);

  const teamsWithWarn = useMemo(() =>
    editTeams.map(t => {
      const filled = t.members.filter(m => m.trim());
      return { ...t, filled, warn: filled.length > 0 && filled.length < 4 };
    }), [editTeams]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h2 className="text-[16px] font-semibold text-sky-800 mb-3">Playoff Builder (Quads)</h2>

      <div className="grid md:grid-cols-2 gap-4 text-[12px]">
        {/* Left: player selection */}
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Player selection</div>

          <label className="flex items-center gap-2">
            <input type="radio" checked={selectMode === 'COMBINED'} onChange={() => setSelectMode('COMBINED')} />
            Combined – top
            <input
              type="number" min={4} step={4}
              className="w-16 border rounded px-1 py-0.5"
              value={totalPlayers}
              onChange={e => setTotalPlayers(clampN(+e.target.value || 4, 4))}
            />
            players
          </label>

          <label className="flex items-center gap-2">
            <input type="radio" checked={selectMode === 'SPLIT'} onChange={() => setSelectMode('SPLIT')} />
            Top
            <input
              type="number" min={1}
              className="w-12 border rounded px-1 py-0.5"
              value={perGender}
              onChange={e => setPerGender(clampN(+e.target.value || 1, 1))}
            />
            guys + top {perGender} girls
          </label>

          <label className="flex items-center gap-2">
            Pairing window
            <input
              type="number" min={2}
              className="w-14 border rounded px-1 py-0.5"
              value={windowSize}
              onChange={e => setWindowSize(clampN(+e.target.value || 2, 2))}
            />
            <span className="text-slate-400">(randomize within groups)</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={randomize} onChange={e => setRandomize(e.target.checked)} />
            Randomize within pairing window
          </label>
        </div>

        {/* Right: bracket options */}
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Bracket options</div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={splitBracket} onChange={e => setSplitBracket(e.target.checked)} />
            Split Upper / Lower brackets
          </label>

          {splitBracket && (
            <label className="flex items-center gap-2">
              Teams in upper bracket
              <input
                type="number" min={2}
                className="w-14 border rounded px-1 py-0.5"
                value={upperCut}
                onChange={e => setUpperCut(clampN(+e.target.value || 2, 2))}
              />
            </label>
          )}

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rrRandomize} onChange={e => setRrRandomize(e.target.checked)} />
            Re-randomize RR teams from loser pool
          </label>

          <div className="text-[11px] text-slate-500 pt-1">
            Standings: {guysRows.length}G / {girlsRows.length}F · {allRows.length} total
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-[13px]"
          onClick={onQuickBuild}
        >
          {splitBracket ? 'Build Upper & Lower' : `Build ${baseDivision} Bracket`}
        </button>

        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm text-[13px]"
          onClick={buildRedemptionRally}
        >
          Build Redemption Rally
        </button>

        <button
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[13px]"
          onClick={onGenerateTeams}
        >
          Generate Teams to Edit…
        </button>
      </div>

      <p className="text-[11px] text-slate-500 mt-2">
        "Build Bracket" auto-pairs from standings. "Generate Teams to Edit" lets you review and adjust
        rosters before locking in. Teams are seeded by combined pool-play W/PD.
        Redemption Rally collects R1/R2 losers into a second-chance bracket.
      </p>

      {/* ── Edit panel ── */}
      {editTeams.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="text-[13px] font-semibold text-slate-800">
              Edit Teams ({editTeams.length} team{editTeams.length !== 1 ? 's' : ''})
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-[12px] shadow-sm"
                onClick={onBuildBracketFromTeams}
              >
                Build Bracket from These Teams
              </button>
              <button
                className="px-2.5 py-1.5 rounded-lg border border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-[12px]"
                onClick={addEmptyTeam}
              >
                + Add Team
              </button>
              <button
                className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]"
                onClick={() => setEditTeams([])}
              >
                Clear All
              </button>
            </div>
          </div>

          {dupNames.length > 0 && (
            <div className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              Duplicate players: {dupNames.join(', ')}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {teamsWithWarn.map((team, tIdx) => (
              <div
                key={team.id}
                className={`border rounded-xl p-3 bg-slate-50/60 ${team.warn ? 'border-amber-300' : 'border-slate-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[12px] text-slate-700">
                    Team {tIdx + 1}
                    {team.filled.length > 0 && (
                      <span className={`ml-2 text-[10px] font-normal ${team.warn ? 'text-amber-600' : 'text-slate-400'}`}>
                        {team.filled.length}/4 players
                      </span>
                    )}
                  </span>
                  <button
                    className="text-[10px] text-red-500 hover:text-red-700 px-1"
                    onClick={() => removeTeam(tIdx)}
                    title="Remove this team"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {team.members.map((member, mIdx) => (
                    <div key={mIdx} className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500">Player {mIdx + 1}</span>
                      <select
                        className={`border rounded px-1.5 py-1 text-[12px] bg-white ${
                          member && dupNames.includes(member) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                        }`}
                        value={member}
                        onChange={e => handleMemberChange(tIdx, mIdx, e.target.value)}
                      >
                        <option value="">— choose —</option>
                        {allPlayerNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {team.filled.length >= 2 && (
                  <div className="mt-2 text-[10px] text-slate-500">
                    {(() => {
                      const gCount = team.filled.filter(n =>
                        (guysText || '').split(/\r?\n/).map(s => s.trim()).includes(n)
                      ).length;
                      const W = team.filled.reduce((s, n) => s + (statMap.get(n)?.W ?? 0), 0);
                      const PD = team.filled.reduce((s, n) => s + (statMap.get(n)?.PD ?? 0), 0);
                      return `${gCount}M+${team.filled.length - gCount}F · ${W}W · PD${PD >= 0 ? '+' : ''}${PD}`;
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-400 mt-2">
            Use "Build Bracket from These Teams" when rosters are final. Teams with fewer than 4 players show a warning but are still accepted (min 2).
            Seeding is determined by combined W/PD from pool play.
          </p>
        </div>
      )}
    </section>
  );
}

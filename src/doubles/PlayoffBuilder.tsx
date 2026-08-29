import React, { useEffect, useMemo, useState } from 'react';
import type { MatchRow, BracketMatch, PlayDiv, Team } from '../types';
import { slug, uniq, shuffle, clampN, parseScore } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeStandings } from './Leaderboard';

type EditTeam = { id: string; name: string; players: [string, string] };

export function PlayoffBuilder({
  matches,
  guysText,
  girlsText,
  brackets,
  setBrackets,
  baseDivision,
  bonuses = {},
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
  brackets: BracketMatch[];
  setBrackets: (f: (prev: BracketMatch[]) => BracketMatch[] | BracketMatch[]) => void;
  baseDivision: 'UPPER' | 'LOWER';
  // Same grace-points adjustments as the Leaderboard, so playoff seeding by
  // rank matches what's actually shown there instead of drifting from it.
  bonuses?: Record<string, { w: number; pd: number }>;
}) {
  const { guysRows, girlsRows } = useMemo(
    () => computeStandings(matches, guysText, girlsText, bonuses),
    [matches, guysText, girlsText, bonuses],
  );

  const [splitBracket, setSplitBracket] = useState<boolean>(false);
  const [upperK, setUpperK] = useState<number>(Math.ceil(Math.max(1, guysRows.length) / 2));
  const [seedRandom, setSeedRandom] = useState<boolean>(true);
  const [groupSize, setGroupSize] = useState<number>(5);
  const [rrRandomize, setRrRandomize] = useState<boolean>(false);
  const [confirmMode, setConfirmMode] = useState<'main' | 'rr' | null>(null);
  const [editTeams, setEditTeams] = useState<EditTeam[]>([]);
  const [editMode, setEditMode] = useState<'main' | 'rr' | null>(null);

  const allPlayerNames = useMemo(
    () => uniq([...guysRows.map(r => r.name), ...girlsRows.map(r => r.name)]),
    [guysRows, girlsRows],
  );
  const hasMain = brackets.some(b => b.division !== 'RR');
  const hasRR = brackets.some(b => b.division === 'RR');

  useEffect(() => {
    setUpperK(Math.ceil(Math.max(1, Math.min(guysRows.length, girlsRows.length)) / 2));
  }, [guysRows.length, girlsRows.length]);

  function scoreTeam(
    members: string[],
    gStats: Map<string, any>,
    hStats: Map<string, any>
  ) {
    const stats = members.map(n => gStats.get(n) || hStats.get(n) || { W: 0, L: 0, PD: 0 });
    const W = stats.reduce((s, v) => s + (v.W || 0), 0);
    const PD = stats.reduce((s, v) => s + (v.PD || 0), 0);
    return { W, PD };
  }

  // Pairs a same-gender leftover pool into teams, windowed by standing like
  // the mixed teams above. Carries an odd window's leftover into the next
  // window instead of dropping it, so an overall-even pool always pairs
  // completely even though the window size itself may be odd. Returns
  // anyone who couldn't be paired at all (only possible if the pool's total
  // count is odd) so the caller can warn about it.
  function pairSameGenderWindowed(
    rows: { name: string }[],
    div: PlayDiv,
  ): { teams: Team[]; unpaired: { name: string }[] } {
    const teams: Team[] = [];
    const windowSize = Math.max(2, groupSize);
    let carry: { name: string }[] = [];

    for (let base = 0; base < rows.length; base += windowSize) {
      const window = [...carry, ...rows.slice(base, base + windowSize)];
      carry = [];
      const order = seedRandom ? shuffle(window) : window;
      for (let j = 0; j + 1 < order.length; j += 2) {
        const a = order[j];
        const b = order[j + 1];
        const name = `${a.name} & ${b.name}`;
        teams.push({
          id: `${div}-tmp-sg-${teams.length + 1}-${slug(name)}`,
          name,
          members: [a.name, b.name],
          seed: teams.length + 1,
          division: div,
        });
      }
      if (order.length % 2 === 1) carry = [order[order.length - 1]];
    }

    return { teams, unpaired: carry };
  }

  function randomTeamsFromSlices(
    div: PlayDiv,
    guySlice: { start: number, end: number },
    girlSlice: { start: number, end: number },
  ) {
    const g = guysRows.slice(guySlice.start, guySlice.end);
    const h = girlsRows.slice(girlSlice.start, girlSlice.end);

    const gStats = new Map(guysRows.map(r => [r.name, r] as const));
    const hStats = new Map(girlsRows.map(r => [r.name, r] as const));

    const teams: Team[] = [];
    const K = Math.min(g.length, h.length);
    const windowSize = Math.max(2, groupSize);

    for (let base = 0; base < K; base += windowSize) {
      const end = Math.min(base + windowSize, K);

      const guysWindow = g.slice(base, end);
      const girlsWindow = h.slice(base, end);

      const guysWindowOrder = seedRandom ? shuffle(guysWindow) : guysWindow;
      const girlsWindowOrder = seedRandom ? shuffle(girlsWindow) : girlsWindow;

      for (let j = 0; j < Math.min(guysWindowOrder.length, girlsWindowOrder.length); j++) {
        const guy = guysWindowOrder[j];
        const girl = girlsWindowOrder[j];
        const name = `${guy?.name || '—'} & ${girl?.name || '—'}`;

        teams.push({
          id: `${div}-tmp-${teams.length + 1}-${slug(name)}`,
          name,
          members: [guy?.name || '', girl?.name || ''],
          seed: teams.length + 1,
          division: div,
        });
      }
    }

    // Leftover guys/girls beyond what the other gender's count can absorb
    // into mixed teams — pair them into same-gender (Ultimate Revco /
    // Power Puff) teams instead of silently dropping them from the bracket.
    const leftoverGuys = g.slice(K);
    const leftoverGirls = h.slice(K);
    const guyPairs = pairSameGenderWindowed(leftoverGuys, div);
    const girlPairs = pairSameGenderWindowed(leftoverGirls, div);
    teams.push(...guyPairs.teams, ...girlPairs.teams);

    const unpaired = [...guyPairs.unpaired, ...girlPairs.unpaired];
    if (unpaired.length > 0) {
      alert(`Heads up: ${unpaired.map(p => p.name).join(', ')} couldn't be paired into a team and won't be in the ${div} bracket. Add them manually via "Prepare Teams to Edit..." if you want them included.`);
    }

    teams.sort((A, B) => {
      const sA = scoreTeam(A.members, gStats, hStats);
      const sB = scoreTeam(B.members, gStats, hStats);
      return (sB.W - sA.W) || (sB.PD - sA.PD) || A.name.localeCompare(B.name);
    });

    teams.forEach((t, i) => {
      t.seed = i + 1;
      t.id = `${div}-${t.seed}-${slug(t.name)}`;
    });

    return teams;
  }

  function buildSingleDivisionMain() {
    const mainTeams = randomTeamsFromSlices(
      baseDivision,
      { start: 0, end: guysRows.length },
      { start: 0, end: girlsRows.length }
    );

    const mainBracket = buildBracket(baseDivision, mainTeams);
    setBrackets(() => mainBracket);
  }

  function buildSplitMain() {
    const cut = Math.max(1, Math.min(upperK, Math.min(guysRows.length, girlsRows.length)));

    const upperTeams = randomTeamsFromSlices(
      'UPPER',
      { start: 0, end: cut },
      { start: 0, end: cut }
    );

    const lowerTeams = randomTeamsFromSlices(
      'LOWER',
      { start: cut, end: guysRows.length },
      { start: cut, end: girlsRows.length }
    );

    const upperMain = buildBracket('UPPER', upperTeams);
    const lowerMain = buildBracket('LOWER', lowerTeams);

    setBrackets(() => ([...upperMain, ...lowerMain]));
  }

  function onBuild() {
    if (splitBracket) buildSplitMain();
    else buildSingleDivisionMain();
    setConfirmMode(null);
    setEditTeams([]);
    setEditMode(null);
  }

  function onClickBuild() {
    if (hasMain) setConfirmMode('main');
    else onBuild();
  }

  // Editable-teams review — only for the single-division build path (not
  // split Upper/Lower), matching the quick "Build {division} Bracket" button.
  function prepareToEdit() {
    const teams = randomTeamsFromSlices(
      baseDivision,
      { start: 0, end: guysRows.length },
      { start: 0, end: girlsRows.length },
    );
    if (teams.length < 2) { alert('Need at least 2 teams to build a bracket.'); return; }
    setEditTeams(teams.map(t => ({
      id: t.id,
      name: t.name,
      players: [t.members[0] || '', t.members[1] || ''] as [string, string],
    })));
    setEditMode('main');
  }

  function buildFromEdit() {
    const objs: Team[] = editTeams
      .map(t => ({ ...t, players: t.players.filter(Boolean) }))
      .filter(t => t.players.length >= 1)
      .map((t, i) => ({
        id: `${editMode}-${i + 1}-${slug(t.name)}`,
        name: t.name,
        members: t.players,
        seed: i + 1,
        division: (editMode === 'rr' ? 'RR' : baseDivision) as PlayDiv,
      }));
    if (objs.length < 2) { alert('Need at least 2 teams (with players) to build a bracket.'); return; }
    if (editMode === 'rr') {
      const rrBracket = buildBracket('RR', objs);
      setBrackets(prev => [...prev.filter(b => b.division !== 'RR'), ...rrBracket]);
    } else {
      setBrackets(() => buildBracket(baseDivision, objs));
    }
    setEditTeams([]);
    setEditMode(null);
    setConfirmMode(null);
  }

  const setTeamName = (tIdx: number, value: string) =>
    setEditTeams(prev => prev.map((t, i) => (i === tIdx ? { ...t, name: value } : t)));
  const setMember = (tIdx: number, mIdx: 0 | 1, value: string) =>
    setEditTeams(prev => prev.map((t, i) => {
      if (i !== tIdx) return t;
      const players: [string, string] = [...t.players];
      players[mIdx] = value;
      return { ...t, players };
    }));
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
    setEditTeams(prev => [...prev, { id: `edit-new-${Date.now()}`, name: `Team ${prev.length + 1}`, players: ['', ''] }]);

  const dupNames = useMemo(() => {
    const all = editTeams.flatMap(t => t.players.filter(Boolean));
    return uniq(all.filter((n, i) => all.indexOf(n) !== i));
  }, [editTeams]);

  function collectLosersForRR(main: BracketMatch[], includeDivs: PlayDiv[]) {
    const losers: Team[] = [];

    const decided = main.filter(
      m =>
        includeDivs.includes(m.division) &&
        (m.round === 1 || m.round === 2) &&
        m.team1 &&
        m.team2 &&
        typeof m.score === 'string' &&
        m.score.trim()
    );

    for (const m of decided) {
      const parsed = parseScore(m.score);
      if (!parsed) continue;

      const [a, b] = parsed;
      if (a === b) continue;

      const loser = a > b ? m.team2 : m.team1;
      if (!loser) continue;

      losers.push({
        id: `RR-carry-${losers.length + 1}`,
        name: loser.name,
        members: loser.members.slice(),
        seed: losers.length + 1,
        division: 'RR',
      });
    }

    return losers;
  }

  function rerandomizeRrTeams(losers: Team[]) {
    if (!rrRandomize) {
      return losers.map((t, i) => ({
        ...t,
        seed: i + 1,
        id: `RR-${i + 1}-${slug(t.name)}`,
        division: 'RR' as PlayDiv,
      }));
    }

    const gStats = new Map(guysRows.map(r => [r.name, r] as const));
    const hStats = new Map(girlsRows.map(r => [r.name, r] as const));

    const allNames = uniq(losers.flatMap(t => t.members).filter(Boolean));
    const allGuys = allNames.filter(n => gStats.has(n));
    const allGirls = allNames.filter(n => hStats.has(n));

    const K = Math.min(allGuys.length, allGirls.length);
    const guysShuffled = shuffle(allGuys);
    const girlsShuffled = shuffle(allGirls);

    const rrTeams: Team[] = [];
    for (let i = 0; i < K; i++) {
      const members = [guysShuffled[i], girlsShuffled[i]];
      const name = members.join(' & ');
      rrTeams.push({
        id: `RR-${i + 1}-${slug(name)}`,
        name,
        members,
        seed: i + 1,
        division: 'RR',
      });
    }

    rrTeams.sort((A, B) => {
      const sA = scoreTeam(A.members, gStats, hStats);
      const sB = scoreTeam(B.members, gStats, hStats);
      return (sB.W - sA.W) || (sB.PD - sA.PD) || A.name.localeCompare(B.name);
    });

    rrTeams.forEach((t, i) => {
      t.seed = i + 1;
      t.id = `RR-${i + 1}-${slug(t.name)}`;
    });

    return rrTeams;
  }

  function buildRedemptionRally() {
    setBrackets(prev => {
      const mainOnly = prev.filter(b => b.division !== 'RR');
      const nonRr = prev.filter(b => b.division !== 'RR');

      const includeDivs: PlayDiv[] = splitBracket ? ['UPPER', 'LOWER'] : [baseDivision];
      const losers = collectLosersForRR(mainOnly, includeDivs);

      if (losers.length < 2) {
        alert("Not enough completed Round 1 / Round 2 matches yet to build Redemption Rally.");
        return prev;
      }

      const rrTeams = rerandomizeRrTeams(losers);
      if (rrTeams.length < 2) {
        alert("Not enough valid RR teams could be formed.");
        return prev;
      }

      const rrBracket = buildBracket('RR', rrTeams);
      return [...nonRr, ...rrBracket];
    });
    setConfirmMode(null);
    setEditTeams([]);
    setEditMode(null);
  }

  function onClickBuildRedemptionRally() {
    if (hasRR) setConfirmMode('rr');
    else buildRedemptionRally();
  }

  function prepareRRToEdit() {
    const mainOnly = brackets.filter(b => b.division !== 'RR');
    const includeDivs: PlayDiv[] = splitBracket ? ['UPPER', 'LOWER'] : [baseDivision];
    const losers = collectLosersForRR(mainOnly, includeDivs);
    if (losers.length < 2) {
      alert("Not enough completed Round 1 / Round 2 matches yet to build Redemption Rally.");
      return;
    }
    const rrTeams = rerandomizeRrTeams(losers);
    if (rrTeams.length < 2) {
      alert("Not enough valid RR teams could be formed.");
      return;
    }
    setEditTeams(rrTeams.map(t => ({
      id: t.id,
      name: t.name,
      players: [t.members[0] || '', t.members[1] || ''] as [string, string],
    })));
    setEditMode('rr');
  }

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h2 className="text-[16px] font-semibold text-sky-800 mb-2">
        Playoff Builder (Doubles)
      </h2>

      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={splitBracket}
            onChange={(e) => setSplitBracket(e.target.checked)}
          />
          Split into Upper / Lower playoff brackets
        </label>

        <label className="flex items-center gap-2">
          Randomize pairings within window
          <input
            type="checkbox"
            checked={seedRandom}
            onChange={(e) => setSeedRandom(e.target.checked)}
          />
        </label>

        <label className="flex items-center gap-2">
          Pairing window
          <input
            className="w-16 border rounded px-2 py-1"
            type="number"
            min={2}
            value={groupSize}
            onChange={(e) => setGroupSize(clampN(+e.target.value || 2, 2))}
          />
        </label>

        {splitBracket && (
          <label className="flex items-center gap-2">
            Upper cutoff
            <input
              className="w-16 border rounded px-2 py-1"
              type="number"
              min={1}
              value={upperK}
              onChange={(e) => setUpperK(clampN(+e.target.value || 1, 1))}
            />
          </label>
        )}

        <label className="flex items-center gap-2">
          RR re-randomize partners
          <input
            type="checkbox"
            checked={rrRandomize}
            onChange={(e) => setRrRandomize(e.target.checked)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-[13px]"
          onClick={onClickBuild}
        >
          {splitBracket ? 'Build Upper & Lower' : `Build ${baseDivision} Bracket`}
        </button>

        {!splitBracket && (
          <button
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[12px]"
            onClick={prepareToEdit}
          >
            Prepare Teams to Edit…
          </button>
        )}

        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm text-[13px]"
          onClick={onClickBuildRedemptionRally}
        >
          Build Redemption Rally
        </button>

        <button
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[12px]"
          onClick={prepareRRToEdit}
        >
          Prepare RR Teams to Edit…
        </button>
      </div>

      {confirmMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 flex items-center justify-between gap-3 text-[12px]">
          <span className="text-amber-800">
            {confirmMode === 'rr'
              ? 'Rebuild the Redemption Rally? This clears the current RR bracket and any scores in it.'
              : 'Rebuild the bracket? This clears the current bracket and any scores in it.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]"
              onClick={confirmMode === 'rr' ? buildRedemptionRally : onBuild}
            >
              Rebuild
            </button>
            <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirmMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 mt-2">
        Pairings are randomized within each ranking window, then teams are re-seeded by combined wins and point differential.
        With split mode off, this builds one bracket for the current division and one RR for that division only.
        With split mode on, it restores the merged Upper / Lower playoff-bracket workflow.
      </p>

      {editTeams.length > 0 && (
        <div className="border-t pt-4 mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[13px] font-semibold text-slate-800">
              {editMode === 'rr' ? 'Adjust Redemption Rally Teams' : 'Adjust Teams'} &amp; Seeds ({editTeams.length} team{editTeams.length === 1 ? '' : 's'})
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]"
                onClick={editMode === 'rr' ? prepareRRToEdit : prepareToEdit}
              >
                Re-shuffle
              </button>
              <button className="px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-[12px]" onClick={buildFromEdit}>
                Build Bracket from These Teams
              </button>
              <button className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]" onClick={addTeam}>
                + Add Team
              </button>
              <button className="px-2.5 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50 text-[12px]" onClick={() => { setEditTeams([]); setEditMode(null); }}>
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
                  {([0, 1] as const).map(mIdx => (
                    <select
                      key={mIdx}
                      className={'border rounded px-1.5 py-1 text-[12px] bg-white ' + (team.players[mIdx] && dupNames.includes(team.players[mIdx]) ? 'border-amber-400 bg-amber-50' : 'border-slate-300')}
                      value={team.players[mIdx]}
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

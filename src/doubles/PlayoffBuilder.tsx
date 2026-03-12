import React, { useEffect, useMemo, useState } from 'react';
import type { MatchRow, BracketMatch, PlayDiv, Team } from '../types';
import { slug, uniq, shuffle, clampN, parseScore } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeStandings } from './Leaderboard';

export function PlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
  baseDivision,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
  setBrackets: (f: (prev: BracketMatch[]) => BracketMatch[] | BracketMatch[]) => void;
  baseDivision: 'UPPER' | 'LOWER';
}) {
  const { guysRows, girlsRows } = useMemo(
    () => computeStandings(matches, guysText, girlsText),
    [matches, guysText, girlsText],
  );

  const [splitBracket, setSplitBracket] = useState<boolean>(false);
  const [upperK, setUpperK] = useState<number>(Math.ceil(Math.max(1, guysRows.length) / 2));
  const [seedRandom, setSeedRandom] = useState<boolean>(true);
  const [groupSize, setGroupSize] = useState<number>(5);
  const [rrRandomize, setRrRandomize] = useState<boolean>(false);

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
  }

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
          onClick={onBuild}
        >
          {splitBracket ? 'Build Upper & Lower' : `Build ${baseDivision} Bracket`}
        </button>

        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm text-[13px]"
          onClick={buildRedemptionRally}
        >
          Build Redemption Rally
        </button>
      </div>

      <p className="text-[11px] text-slate-500 mt-2">
        Pairings are randomized within each ranking window, then teams are re-seeded by combined wins and point differential.
        With split mode off, this builds one bracket for the current division and one RR for that division only.
        With split mode on, it restores the merged Upper / Lower playoff-bracket workflow.
      </p>
    </section>
  );
}

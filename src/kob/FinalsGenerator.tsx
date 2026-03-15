import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KobGameRow } from '../types';
import { slug, uniq, parseScore, isValidKobScore } from '../utils';

type PlayerStats = { name: string; W: number; L: number; PF: number; PA: number; GP: number };

// ── Standings helpers ──────────────────────────────────────────────────────────

function computeStandings(games: KobGameRow[], roster: string[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  for (const p of roster) {
    stats.set(slug(p), { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 });
  }
  for (const g of games) {
    const parsed = parseScore(g.scoreText);
    if (!parsed || !isValidKobScore(parsed[0], parsed[1])) continue;
    const [s1, s2] = parsed;
    const t1Win = s1 > s2;
    for (const p of g.t1) {
      const key = slug(p);
      const cur = stats.get(key) ?? { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 };
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 1 : 0), L: cur.L + (t1Win ? 0 : 1), PF: cur.PF + s1, PA: cur.PA + s2, GP: cur.GP + 1 });
    }
    for (const p of g.t2) {
      const key = slug(p);
      const cur = stats.get(key) ?? { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 };
      stats.set(key, { ...cur, W: cur.W + (t1Win ? 0 : 1), L: cur.L + (t1Win ? 1 : 0), PF: cur.PF + s2, PA: cur.PA + s1, GP: cur.GP + 1 });
    }
  }
  return [...stats.values()]
    .filter(s => s.GP > 0)
    .sort((a, b) => {
      if (b.W !== a.W) return b.W - a.W;
      const pd = (b.PF - b.PA) - (a.PF - a.PA);
      return pd !== 0 ? pd : b.PF - a.PF;
    });
}

// ── Wildcard qualification calculator ─────────────────────────────────────────
// Returns which players are direct qualifiers (top N per pool) vs wildcards (best remaining).

function computeQualification(
  poolGames: KobGameRow[],
  roster: string[],
  goldSpots: number,
): {
  directSlugs: Set<string>;
  wildcardSlugs: Set<string>;
  directPerPool: number;
  numWildcards: number;
  poolCount: number;
} {
  const pools = uniq(poolGames.filter(g => !g.isFinals).map(g => g.pool));
  const poolCount = pools.length;

  if (poolCount === 0) {
    return { directSlugs: new Set(), wildcardSlugs: new Set(), directPerPool: 1, numWildcards: 0, poolCount: 0 };
  }

  // directPerPool = how many advance automatically from each pool
  const directPerPool = Math.max(1, Math.floor(goldSpots / poolCount));
  const numDirect = Math.min(directPerPool * poolCount, goldSpots);
  const numWildcards = Math.max(0, goldSpots - numDirect);

  // Per-pool standings for this gender
  const directSlugs = new Set<string>();
  for (const pool of pools) {
    const pg = poolGames.filter(g => g.pool === pool);
    const poolRoster = roster.filter(p => pg.some(g => g.t1.includes(p) || g.t2.includes(p)));
    const standing = computeStandings(pg, poolRoster);
    standing.slice(0, directPerPool).forEach(s => directSlugs.add(slug(s.name)));
  }

  // Wildcards: best remaining from overall standings
  const overallStandings = computeStandings(poolGames, roster);
  const wildcardSlugs = new Set<string>();
  for (const s of overallStandings) {
    if (wildcardSlugs.size >= numWildcards) break;
    if (!directSlugs.has(slug(s.name))) wildcardSlugs.add(slug(s.name));
  }

  return { directSlugs, wildcardSlugs, directPerPool, numWildcards, poolCount };
}

// ── Finals game builder ────────────────────────────────────────────────────────

const FINALS4_SCHEDULE: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

const FINALS5_SCHEDULE: [[number, number], [number, number], number][] = [
  [[0, 1], [2, 3], 4],
  [[0, 2], [1, 4], 3],
  [[0, 3], [2, 4], 1],
  [[0, 4], [1, 3], 2],
  [[1, 2], [3, 4], 0],
];

function buildFinalsGames(
  finalists: string[],
  label: KobGameRow['finalsLabel'],
  poolNum: number,
  court: number,
): KobGameRow[] {
  const ts = Date.now();
  if (finalists.length === 5) {
    return FINALS5_SCHEDULE.map(([[i1, i2], [i3, i4], sitter], gi) => ({
      id: `finals-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      pool: poolNum, game: gi + 1,
      t1: [finalists[i1], finalists[i2]] as [string, string],
      t2: [finalists[i3], finalists[i4]] as [string, string],
      court, scoreText: '', isFinals: true, finalsLabel: label,
      sitOut: finalists[sitter],
    }));
  }
  return FINALS4_SCHEDULE.map(([[i1, i2], [i3, i4]], gi) => ({
    id: `finals-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
    pool: poolNum, game: gi + 1,
    t1: [finalists[i1], finalists[i2]] as [string, string],
    t2: [finalists[i3], finalists[i4]] as [string, string],
    court, scoreText: '', isFinals: true, finalsLabel: label,
  }));
}

// ── Single bracket panel (Gold or Silver for one gender) ──────────────────────

function BracketPanel({
  title,
  tier,
  accentClass,
  borderClass,
  standings,       // ordered by pool play rank for this tier
  excludedSlugs,   // players already in a higher tier
  directSlugs,
  wildcardSlugs,
  existingGames,
  defaultCourt,
  finalsSize,
  isAdmin,
  onGenerate,
  onClear,
}: {
  title: string;
  tier: 'gold' | 'silver';
  accentClass: string;
  borderClass: string;
  standings: PlayerStats[];
  allPlayers: string[];
  excludedSlugs: Set<string>;
  directSlugs: Set<string>;
  wildcardSlugs: Set<string>;
  existingGames: KobGameRow[];
  defaultCourt: number;
  finalsSize: 4 | 5;
  isAdmin?: boolean;
  onGenerate: (finalists: string[], court: number) => void;
  onClear: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [court, setCourt] = useState(defaultCourt);
  const inited = useRef(false);

  // Available candidates = standings minus excluded
  const candidates = standings.filter(s => !excludedSlugs.has(slug(s.name)));

  // Auto-select top finalsSize on first load
  useEffect(() => {
    if (!inited.current && candidates.length >= finalsSize) {
      setSelected(new Set(candidates.slice(0, finalsSize).map(s => slug(s.name))));
      inited.current = true;
    }
  }, [candidates.length]);

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug(name))) {
        next.delete(slug(name));
      } else if (next.size < finalsSize) {
        next.add(slug(name));
      }
      return next;
    });
  };

  const finalistsInOrder = candidates
    .filter(s => selected.has(slug(s.name)))
    .map(s => s.name);

  const hasFinals = existingGames.length > 0;
  const scoredCount = existingGames.filter(g => {
    const p = parseScore(g.scoreText);
    return p && isValidKobScore(p[0], p[1]);
  }).length;
  const allScored = hasFinals && scoredCount === existingGames.length;

  const qualBadge = (name: string) => {
    const s = slug(name);
    if (directSlugs.has(s)) return <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold ml-1">Direct</span>;
    if (wildcardSlugs.has(s)) return <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold ml-1">WC</span>;
    return null;
  };

  return (
    <div className={`border-2 ${borderClass} rounded-xl p-4`}>
      <div className={`font-bold text-[14px] mb-3 ${accentClass}`}>{title}</div>

      {hasFinals ? (
        <div className="space-y-2">
          <div className={`text-[12px] font-medium ${allScored ? 'text-emerald-700' : 'text-slate-600'}`}>
            {allScored ? '✓ Complete' : `${scoredCount}/${existingGames.length} games scored`}
          </div>
          <div className="text-[11px] text-slate-500">
            Finalists: {Array.from(new Set(existingGames.flatMap(g => [...g.t1, ...g.t2]))).join(', ')}
          </div>
          {isAdmin && (
            <button
              className="text-[11px] px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Clear ${title} and regenerate?`)) onClear();
              }}
            >
              Regenerate
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.length < finalsSize ? (
            <p className="text-[12px] text-slate-400 italic">
              Need at least {finalsSize} players with pool play results
              {excludedSlugs.size > 0 ? ' (not already in Gold Finals)' : ''}.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                Select {finalsSize} finalists — same rotating-partner format, best record wins.
                {directSlugs.size > 0 && ` Direct = top qualifier per pool · WC = wildcard spot.`}
              </p>

              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {candidates.map((s, i) => {
                  const isSelected = selected.has(slug(s.name));
                  const pd = s.PF - s.PA;
                  return (
                    <label
                      key={s.name}
                      className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer text-[12px] select-none ${
                        isSelected
                          ? tier === 'gold' ? 'bg-amber-50' : 'bg-slate-100'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(s.name)}
                        disabled={!isAdmin || (!isSelected && selected.size >= finalsSize)}
                        className={tier === 'gold' ? 'accent-amber-500' : 'accent-slate-500'}
                      />
                      <span className="w-5 text-slate-400 tabular-nums text-right shrink-0">{i + 1}.</span>
                      <span className="font-medium flex-1">{s.name}{qualBadge(s.name)}</span>
                      <span className="text-slate-500 tabular-nums text-[11px]">{s.W}W {s.L}L</span>
                      <span className={`tabular-nums text-[11px] ${pd > 0 ? 'text-emerald-600' : pd < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {pd > 0 ? '+' : ''}{pd}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1 text-[12px]">
                  Court
                  <input
                    type="number" min={1} value={court}
                    onChange={e => setCourt(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border rounded px-2 py-1 text-[12px]"
                    disabled={!isAdmin}
                  />
                </label>
                <span className="text-[11px] text-slate-500">{selected.size}/{finalsSize} selected</span>
                {isAdmin && (
                  <button
                    className={`px-3 py-1.5 rounded-lg shadow-sm text-[12px] font-semibold disabled:opacity-40 text-white ${
                      tier === 'gold' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-500 hover:bg-slate-600'
                    }`}
                    disabled={finalistsInOrder.length !== finalsSize}
                    onClick={() => onGenerate(finalistsInOrder, court)}
                  >
                    Generate {title}
                  </button>
                )}
              </div>

              {/* Schedule preview */}
              {finalistsInOrder.length === finalsSize && (
                <div className="mt-1 border rounded-lg p-2 bg-slate-50 text-[11px]">
                  <div className="font-medium text-slate-600 mb-1">Schedule preview:</div>
                  {(finalsSize === 5 ? FINALS5_SCHEDULE : FINALS4_SCHEDULE).map((entry, gi) => {
                    const [[i1, i2], [i3, i4]] = entry as any;
                    return (
                      <div key={gi} className="text-slate-500">
                        G{gi + 1}:{' '}
                        <span className="text-slate-700 font-medium">{finalistsInOrder[i1]} + {finalistsInOrder[i2]}</span>
                        {' '}vs{' '}
                        <span className="text-slate-700 font-medium">{finalistsInOrder[i3]} + {finalistsInOrder[i4]}</span>
                        {finalsSize === 5 && <span className="text-slate-400 ml-1">(sits: {finalistsInOrder[(entry as any)[2]]})</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Per-gender section (Gold + Silver) ────────────────────────────────────────

function GenderSection({
  genderLabel,
  isKob,
  poolGames,
  roster,
  allGames,
  setGames,
  isAdmin,
  goldPoolNum,
  silverPoolNum,
}: {
  genderLabel: string;
  isKob: boolean;
  poolGames: KobGameRow[];
  roster: string[];
  allGames: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  isAdmin?: boolean;
  goldPoolNum: number;
  silverPoolNum: number;
}) {
  const [goldSize, setGoldSize] = useState<4 | 5>(4);
  const [silverSize, setSilverSize] = useState<4 | 5>(4);
  const [showSilver, setShowSilver] = useState(false);

  const overallStandings = useMemo(() => computeStandings(poolGames, roster), [poolGames, roster]);

  const qualInfo = useMemo(
    () => computeQualification(poolGames, roster, goldSize),
    [poolGames, roster, goldSize],
  );

  const { directSlugs, wildcardSlugs, directPerPool, numWildcards, poolCount } = qualInfo;

  // Gold finalists for exclusion from silver
  const goldFinalists = useMemo(() => {
    const goldGames = allGames.filter(g => g.pool === goldPoolNum);
    if (goldGames.length > 0) {
      return new Set(goldGames.flatMap(g => [...g.t1, ...g.t2]).map(p => slug(p)));
    }
    // Not yet generated — use top goldSize from standings
    return new Set(overallStandings.slice(0, goldSize).map(s => slug(s.name)));
  }, [allGames, goldPoolNum, overallStandings, goldSize]);

  const goldGames = allGames.filter(g => g.pool === goldPoolNum);
  const silverGames = allGames.filter(g => g.pool === silverPoolNum);

  const generateGold = (finalists: string[], court: number) => {
    const label: KobGameRow['finalsLabel'] = isKob ? 'Gold KOB' : 'Gold QOB';
    const newGames = buildFinalsGames(finalists, label, goldPoolNum, court);
    setGames(prev => [...prev.filter(g => g.pool !== goldPoolNum), ...newGames]);
  };

  const generateSilver = (finalists: string[], court: number) => {
    const label: KobGameRow['finalsLabel'] = isKob ? 'Silver KOB' : 'Silver QOB';
    const newGames = buildFinalsGames(finalists, label, silverPoolNum, court);
    setGames(prev => [...prev.filter(g => g.pool !== silverPoolNum), ...newGames]);
  };

  const poolCountLabel = poolCount > 0
    ? `${poolCount} pool${poolCount !== 1 ? 's' : ''} · ${directPerPool} direct per pool${numWildcards > 0 ? ` + ${numWildcards} wildcard${numWildcards !== 1 ? 's' : ''}` : ''}`
    : 'No pool play yet';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`font-semibold text-[13px] ${isKob ? 'text-blue-700' : 'text-pink-700'}`}>
          {genderLabel}
        </span>
        <span className="text-[11px] text-slate-500">{poolCountLabel}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-slate-500">Finals size:</span>
          {([4, 5] as const).map(n => (
            <button key={n}
              className={`px-2 py-0.5 rounded border text-[11px] ${goldSize === n ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
              onClick={() => { setGoldSize(n); setSilverSize(n); }}
              disabled={!!goldGames.length || !!silverGames.length}
            >{n} players</button>
          ))}
        </div>
      </div>

      {/* Gold bracket */}
      <BracketPanel
        title={isKob ? '🥇 Gold — King of the Beach' : '🥇 Gold — Queen of the Beach'}
        tier="gold"
        accentClass={isKob ? 'text-blue-700' : 'text-pink-700'}
        borderClass={isKob ? 'border-blue-200' : 'border-pink-200'}
        standings={overallStandings}
        allPlayers={roster}
        excludedSlugs={new Set()}
        directSlugs={directSlugs}
        wildcardSlugs={wildcardSlugs}
        existingGames={goldGames}
        defaultCourt={isKob ? 1 : 2}
        finalsSize={goldSize}
        isAdmin={isAdmin}
        onGenerate={generateGold}
        onClear={() => setGames(prev => prev.filter(g => g.pool !== goldPoolNum))}
      />

      {/* Silver toggle + bracket */}
      {!showSilver && overallStandings.length > goldSize && (
        <button
          className="text-[12px] text-slate-500 hover:text-slate-700 underline"
          onClick={() => setShowSilver(true)}
        >
          + Add Silver Finals (5th–{goldSize + 4}th place consolation)
        </button>
      )}
      {showSilver && (
        <BracketPanel
          title={isKob ? '🥈 Silver — Consolation KOB' : '🥈 Silver — Consolation QOB'}
          tier="silver"
          accentClass="text-slate-600"
          borderClass="border-slate-300"
          standings={overallStandings}
          allPlayers={roster}
          excludedSlugs={goldFinalists}
          directSlugs={new Set()}
          wildcardSlugs={new Set()}
          existingGames={silverGames}
          defaultCourt={isKob ? 3 : 4}
          finalsSize={silverSize}
          isAdmin={isAdmin}
          onGenerate={generateSilver}
          onClear={() => setGames(prev => prev.filter(g => g.pool !== silverPoolNum))}
        />
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function KobFinalsGenerator({
  games,
  setGames,
  guysText,
  girlsText,
  isAdmin,
}: {
  games: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  guysText: string;
  girlsText: string;
  isAdmin?: boolean;
}) {
  const guys = useMemo(
    () => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [guysText],
  );
  const girls = useMemo(
    () => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [girlsText],
  );

  const poolGames = useMemo(() => games.filter(g => !g.isFinals), [games]);

  const hasAnyPoolPlay = poolGames.length > 0;
  if (!hasAnyPoolPlay) return null;

  // Determine which gender(s) have pool play data
  const activeSlugs = new Set(poolGames.flatMap(g => [...g.t1, ...g.t2]).map(p => slug(p)));
  const hasKob = guys.some(p => activeSlugs.has(slug(p)));
  const hasQob = girls.some(p => activeSlugs.has(slug(p)));

  if (!hasKob && !hasQob) return null;

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="mb-3">
        <h3 className="text-[16px] font-semibold text-sky-800">Finals Generator (KOB / QOB)</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Direct = top qualifier from each pool · WC = wildcard (best remaining) · same rotating-partner format as pool play
        </p>
      </div>

      <div className={`space-y-6 ${hasKob && hasQob ? 'divide-y divide-slate-100' : ''}`}>
        {hasKob && (
          <GenderSection
            genderLabel="Men — KOB"
            isKob={true}
            poolGames={poolGames}
            roster={guys}
            allGames={games}
            setGames={setGames}
            isAdmin={isAdmin}
            goldPoolNum={1001}
            silverPoolNum={1011}
          />
        )}
        {hasQob && (
          <div className={hasKob ? 'pt-6' : ''}>
            <GenderSection
              genderLabel="Women — QOB"
              isKob={false}
              poolGames={poolGames}
              roster={girls}
              allGames={games}
              setGames={setGames}
              isAdmin={isAdmin}
              goldPoolNum={1002}
              silverPoolNum={1012}
            />
          </div>
        )}
      </div>
    </section>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KobGameRow } from '../types';
import { slug, uniq, parseScore, isValidKobScore } from '../utils';

type PlayerStats = { name: string; W: number; L: number; PF: number; PA: number; GP: number };

function computePoolStandings(poolGames: KobGameRow[], roster: string[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  for (const p of roster) {
    stats.set(slug(p), { name: p, W: 0, L: 0, PF: 0, PA: 0, GP: 0 });
  }
  for (const g of poolGames) {
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
      if (pd !== 0) return pd;
      return b.PF - a.PF;
    });
}

const FINALS_SCHEDULE: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function buildFinalsGames(
  finalists: string[],
  label: 'KOB Finals' | 'QOB Finals',
  poolNum: number,
  court: number,
): KobGameRow[] {
  const ts = Date.now();
  return FINALS_SCHEDULE.map(([[i1, i2], [i3, i4]], gi) => ({
    id: `finals-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
    pool: poolNum,
    game: gi + 1,
    t1: [finalists[i1], finalists[i2]] as [string, string],
    t2: [finalists[i3], finalists[i4]] as [string, string],
    court,
    scoreText: '',
    isFinals: true,
    finalsLabel: label,
  }));
}

// ── Per-gender finals panel ────────────────────────────────────────────────────
function FinalsBracket({
  label,
  poolNum,
  accentClass,
  borderClass,
  headerClass,
  standings,
  allPlayers,
  existingFinals,
  defaultCourt,
  isAdmin,
  onGenerate,
  onClear,
}: {
  label: 'KOB Finals' | 'QOB Finals';
  poolNum: number;
  accentClass: string;
  borderClass: string;
  headerClass: string;
  standings: PlayerStats[];
  allPlayers: string[];
  existingFinals: KobGameRow[];
  defaultCourt: number;
  isAdmin?: boolean;
  onGenerate: (finalists: string[], court: number) => void;
  onClear: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [court, setCourt] = useState(defaultCourt);
  const inited = useRef(false);

  // Auto-select top 4 when standings first load
  useEffect(() => {
    if (!inited.current && standings.length > 0) {
      setSelected(new Set(standings.slice(0, 4).map(s => slug(s.name))));
      inited.current = true;
    }
  }, [standings]);

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug(name))) {
        next.delete(slug(name));
      } else if (next.size < 4) {
        next.add(slug(name));
      }
      return next;
    });
  };

  const finalistsInOrder = standings
    .filter(s => selected.has(slug(s.name)))
    .map(s => s.name)
    .concat(
      // Also include anyone selected who doesn't appear in standings
      allPlayers.filter(p => selected.has(slug(p)) && !standings.find(s => slug(s.name) === slug(p))),
    );

  const hasFinals = existingFinals.length > 0;
  const scoredCount = existingFinals.filter(g => {
    const p = parseScore(g.scoreText);
    return p && isValidKobScore(p[0], p[1]);
  }).length;
  const allScored = hasFinals && scoredCount === existingFinals.length;

  const isKob = label === 'KOB Finals';
  const title = isKob ? '👑 King of the Beach Finals' : '👑 Queen of the Beach Finals';

  return (
    <div className={`border-2 ${borderClass} rounded-xl p-4`}>
      <div className={`font-bold text-[14px] mb-3 ${accentClass}`}>{title}</div>

      {hasFinals ? (
        <div className="space-y-2">
          <div className={`text-[12px] font-medium ${allScored ? 'text-emerald-700' : 'text-slate-600'}`}>
            {allScored ? '✓ Finals complete' : `${scoredCount}/${existingFinals.length} games scored`}
          </div>
          <div className="text-[11px] text-slate-500">
            Finalists:{' '}
            {Array.from(new Set(existingFinals.flatMap(g => [...g.t1, ...g.t2]))).join(', ')}
          </div>
          {isAdmin && (
            <button
              className="text-[11px] px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
              onClick={onClear}
            >
              Regenerate Finals
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {standings.length < 4 ? (
            <p className="text-[12px] text-slate-400 italic">
              Need at least 4 players with pool play results to generate finals.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                Select exactly 4 finalists (top 4 auto-selected). They'll play the same
                rotating-partner format — 3 games, every pairing once. Best record wins.
              </p>

              {/* Standings checklist */}
              <div className="space-y-1">
                {standings.map((s, i) => {
                  const isSelected = selected.has(slug(s.name));
                  const pd = s.PF - s.PA;
                  return (
                    <label
                      key={s.name}
                      className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer text-[12px] select-none ${
                        isSelected ? (isKob ? 'bg-blue-50' : 'bg-pink-50') : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(s.name)}
                        className={isKob ? 'accent-blue-600' : 'accent-pink-500'}
                        disabled={!isAdmin || (!isSelected && selected.size >= 4)}
                      />
                      <span className="w-5 text-slate-400 tabular-nums text-right">{i + 1}.</span>
                      <span className="font-medium flex-1">{s.name}</span>
                      <span className="text-slate-500 tabular-nums">
                        {s.W}W {s.L}L
                      </span>
                      <span
                        className={`tabular-nums text-[11px] ${
                          pd > 0 ? 'text-emerald-600' : pd < 0 ? 'text-red-500' : 'text-slate-400'
                        }`}
                      >
                        {pd > 0 ? '+' : ''}
                        {pd}
                      </span>
                    </label>
                  );
                })}

                {/* Players in roster but without pool results */}
                {allPlayers
                  .filter(p => !standings.find(s => slug(s.name) === slug(p)))
                  .map(p => (
                    <label
                      key={p}
                      className="flex items-center gap-2 rounded px-2 py-1 cursor-pointer text-[12px] text-slate-400 select-none hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(slug(p))}
                        onChange={() => toggle(p)}
                        disabled={!isAdmin || (!selected.has(slug(p)) && selected.size >= 4)}
                      />
                      <span className="w-5" />
                      <span className="flex-1">{p}</span>
                      <span className="text-[10px] italic">no pool results</span>
                    </label>
                  ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap mt-2">
                <label className="flex items-center gap-1 text-[12px]">
                  Court
                  <input
                    type="number"
                    min={1}
                    value={court}
                    onChange={e => setCourt(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border rounded px-2 py-1 text-[12px]"
                    disabled={!isAdmin}
                  />
                </label>

                <div className="text-[11px] text-slate-500">
                  {selected.size}/4 selected
                </div>

                {isAdmin && (
                  <button
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 shadow-sm text-[12px] font-semibold disabled:opacity-40"
                    disabled={finalistsInOrder.length !== 4}
                    onClick={() => onGenerate(finalistsInOrder, court)}
                  >
                    Generate {label}
                  </button>
                )}
              </div>

              {/* Preview matchups */}
              {finalistsInOrder.length === 4 && (
                <div className="mt-2 border rounded-lg p-2 bg-slate-50 text-[11px]">
                  <div className="font-medium text-slate-600 mb-1">Finals schedule preview:</div>
                  {FINALS_SCHEDULE.map(([[i1, i2], [i3, i4]], gi) => (
                    <div key={gi} className="text-slate-500">
                      Game {gi + 1}:{' '}
                      <span className="text-slate-700 font-medium">
                        {finalistsInOrder[i1]} + {finalistsInOrder[i2]}
                      </span>{' '}
                      vs{' '}
                      <span className="text-slate-700 font-medium">
                        {finalistsInOrder[i3]} + {finalistsInOrder[i4]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
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
  const kobFinals = useMemo(() => games.filter(g => g.pool === 1001), [games]);
  const qobFinals = useMemo(() => games.filter(g => g.pool === 1002), [games]);

  const kobStandings = useMemo(() => computePoolStandings(poolGames, guys), [poolGames, guys]);
  const qobStandings = useMemo(() => computePoolStandings(poolGames, girls), [poolGames, girls]);

  const hasAnyPoolPlay = poolGames.length > 0;

  if (!hasAnyPoolPlay) return null;

  const generateKobFinals = (finalists: string[], court: number) => {
    const newGames = buildFinalsGames(finalists, 'KOB Finals', 1001, court);
    setGames(prev => [...prev.filter(g => g.pool !== 1001), ...newGames]);
  };

  const generateQobFinals = (finalists: string[], court: number) => {
    const newGames = buildFinalsGames(finalists, 'QOB Finals', 1002, court);
    setGames(prev => [...prev.filter(g => g.pool !== 1002), ...newGames]);
  };

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center gap-3 mb-1">
        <h3 className="text-[16px] font-semibold text-sky-800">Finals (KOB / QOB)</h3>
        <span className="text-[11px] text-slate-400">
          Top 4 from pool play advance · same rotating-partner format · best record wins
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-3">
        <FinalsBracket
          label="KOB Finals"
          poolNum={1001}
          accentClass="text-blue-700"
          borderClass="border-blue-200"
          headerClass="bg-blue-50"
          standings={kobStandings}
          allPlayers={guys}
          existingFinals={kobFinals}
          defaultCourt={1}
          isAdmin={isAdmin}
          onGenerate={generateKobFinals}
          onClear={() => setGames(prev => prev.filter(g => g.pool !== 1001))}
        />
        <FinalsBracket
          label="QOB Finals"
          poolNum={1002}
          accentClass="text-pink-700"
          borderClass="border-pink-200"
          headerClass="bg-pink-50"
          standings={qobStandings}
          allPlayers={girls}
          existingFinals={qobFinals}
          defaultCourt={2}
          isAdmin={isAdmin}
          onGenerate={generateQobFinals}
          onClear={() => setGames(prev => prev.filter(g => g.pool !== 1002))}
        />
      </div>
    </section>
  );
}

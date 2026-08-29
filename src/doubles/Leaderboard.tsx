import React, { useMemo, useState } from 'react';
import type { MatchRow, ScoreSettings } from '../types';
import { slug, parseScore, isValidScore } from '../utils';

type Bucket = { name: string; W: number; L: number; PD: number };
export type StandingsBonus = { w: number; pd: number };
export type StandingsOverride = { W: number; L: number; PD: number };

// `bonuses` lets an admin credit a player who'll miss rounds (e.g. arriving
// late) with grace wins/point differential, so standings and playoff
// seeding both reflect it — not just the on-screen leaderboard. `overrides`
// replaces a player's row outright with admin-typed numbers (bonus ignored
// for that player) — for directly correcting/setting their final W/L/PD.
export function computeStandings(
  matches: MatchRow[],
  guysText: string,
  girlsText: string,
  bonuses: Record<string, StandingsBonus> = {},
  overrides: Record<string, StandingsOverride> = {},
) {
  const guysList = Array.from(new Set((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)));
  const girlsList = Array.from(new Set((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)));
  const guysSet = new Set(guysList.map(slug));
  const g = new Map<string, Bucket>(), h = new Map<string, Bucket>();
  const ensure = (map: Map<string, Bucket>, n: string) => {
    if (!map.has(n)) map.set(n, { name: n, W: 0, L: 0, PD: 0 });
    return map.get(n)!;
  };
  for (const n of guysList) ensure(g, n);
  for (const n of girlsList) ensure(h, n);
  for (const m of matches) {
    const s = parseScore(m.scoreText); if (!s) continue;
    const [a, b] = s;
    if (a === b) continue;
    const t1 = [m.t1p1, m.t1p2], t2 = [m.t2p1, m.t2p2];
    const diff = Math.abs(a - b);
    const t1Won = a > b;
    const apply = (name: string, won: boolean) => {
      const map = guysSet.has(slug(name)) ? g : h;
      const row = ensure(map, name);
      if (won) { row.W++; row.PD += diff; } else { row.L++; row.PD -= diff; }
    };
    for (const p of t1) apply(p, t1Won);
    for (const p of t2) apply(p, !t1Won);
  }
  for (const [name, bonus] of Object.entries(bonuses)) {
    const map = guysSet.has(slug(name)) ? g : h;
    if (!map.has(name)) continue;
    const row = map.get(name)!;
    row.W += bonus.w || 0;
    row.PD += bonus.pd || 0;
  }
  for (const [name, o] of Object.entries(overrides)) {
    const map = guysSet.has(slug(name)) ? g : h;
    if (!map.has(name)) continue;
    map.set(name, { name, W: o.W, L: o.L, PD: o.PD });
  }
  const sortRows = (arr: Bucket[]) => arr.sort((x, y) => y.W - x.W || y.PD - x.PD || x.name.localeCompare(y.name));
  return { guysRows: sortRows(Array.from(g.values())), girlsRows: sortRows(Array.from(h.values())) };
}

// Condensed, two-column-per-gender standings for reference on the Playoffs
// tab — same ranking as the full table, just one line per player.
export function StandingsCompact({
  matches,
  guysText,
  girlsText,
  bonuses = {},
  overrides = {},
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
  bonuses?: Record<string, StandingsBonus>;
  overrides?: Record<string, StandingsOverride>;
}) {
  const { guysRows, girlsRows } = useMemo(
    () => computeStandings(matches, guysText, girlsText, bonuses, overrides),
    [matches, guysText, girlsText, bonuses, overrides],
  );

  if (guysRows.length === 0 && girlsRows.length === 0) return null;

  const Column = ({ title, rows }: { title: string; rows: Bucket[] }) => (
    <div>
      <div className="text-[12px] font-semibold text-slate-700 mb-1">{title}</div>
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-baseline gap-1.5 text-[12px] py-0.5 border-b border-slate-100 last:border-0">
          <span className="tabular-nums font-semibold text-sky-800 w-4 shrink-0">{i + 1}.</span>
          <span className="truncate">{r.name}</span>
          <span className="ml-auto tabular-nums text-slate-500 shrink-0">
            {r.W}-{r.L} ({r.PD > 0 ? `+${r.PD}` : r.PD})
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[14px] font-semibold text-sky-800 mb-2">Standings (reference)</h3>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        <Column title="Guys" rows={guysRows} />
        <Column title="Girls" rows={girlsRows} />
      </div>
    </section>
  );
}

export function Leaderboard({
  matches,
  guysText,
  girlsText,
  scoreSettings = { playTo: 21, cap: null },
  bonuses = {},
  setBonuses,
  overrides = {},
  setOverrides,
  isAdmin = false,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
  scoreSettings?: ScoreSettings;
  // Grace wins/point-differential credited to a player missing rounds (e.g.
  // arriving late) — admin-editable via the Grace W/Grace PD columns below.
  bonuses?: Record<string, StandingsBonus>;
  setBonuses?: (f: (prev: Record<string, StandingsBonus>) => Record<string, StandingsBonus>) => void;
  // Directly-typed final W/L/PD for a player, replacing the computed value
  // (and any bonus) outright — for correcting or fully hand-setting a row.
  overrides?: Record<string, StandingsOverride>;
  setOverrides?: (f: (prev: Record<string, StandingsOverride>) => Record<string, StandingsOverride>) => void;
  isAdmin?: boolean;
}) {
  const { guysRows, girlsRows } = useMemo(
    () => computeStandings(matches, guysText, girlsText, bonuses, overrides),
    [matches, guysText, girlsText, bonuses, overrides],
  );

  const setBonus = (name: string, patch: Partial<StandingsBonus>) => {
    setBonuses?.(prev => {
      const cur = prev[name] ?? { w: 0, pd: 0 };
      const next = { ...cur, ...patch };
      const { [name]: _drop, ...rest } = prev;
      return (next.w === 0 && next.pd === 0) ? rest : { ...rest, [name]: next };
    });
  };

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<StandingsOverride>({ W: 0, L: 0, PD: 0 });
  const startEditRow = (r: Bucket) => {
    setEditingName(r.name);
    setEditBuffer(overrides[r.name] ?? { W: r.W, L: r.L, PD: r.PD });
  };
  const cancelEditRow = () => setEditingName(null);
  const saveEditRow = () => {
    if (!editingName) return;
    setOverrides?.(prev => ({ ...prev, [editingName]: editBuffer }));
    setEditingName(null);
  };
  const clearOverride = (name: string) => {
    setOverrides?.(prev => { const { [name]: _drop, ...rest } = prev; return rest; });
    if (editingName === name) setEditingName(null);
  };

  const Table = ({ title, rows }: { title: string; rows: Bucket[] }) => (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[15px] font-semibold text-sky-800 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 px-2">#</th>
              <th className="py-1 px-2">Player</th>
              <th className="py-1 px-2">W</th>
              <th className="py-1 px-2">L</th>
              <th className="py-1 px-2">PD</th>
              {isAdmin && <th className="py-1 px-2" title="Grace wins — credit added for rounds a player will miss">Grace W</th>}
              {isAdmin && <th className="py-1 px-2" title="Grace point differential — credit added for rounds a player will miss">Grace PD</th>}
              {isAdmin && <th className="py-1 px-2">Manual</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isEditing = editingName === r.name;
              const isOverridden = !!overrides[r.name];
              return (
                <tr key={r.name} className={`border-t ${isOverridden ? 'bg-violet-50/60' : ''}`}>
                  <td className="py-1 px-2 tabular-nums">{i + 1}</td>
                  <td className="py-1 px-2">
                    {r.name}
                    {isOverridden && !isEditing && (
                      <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 align-middle">manual</span>
                    )}
                  </td>
                  {isEditing ? (
                    <>
                      <td className="py-1 px-2">
                        <input type="number" className="w-12 border border-slate-300 rounded px-1 py-0.5 text-[12px] text-center"
                          value={editBuffer.W} onChange={(e) => setEditBuffer(b => ({ ...b, W: parseInt(e.target.value) || 0 }))} />
                      </td>
                      <td className="py-1 px-2">
                        <input type="number" className="w-12 border border-slate-300 rounded px-1 py-0.5 text-[12px] text-center"
                          value={editBuffer.L} onChange={(e) => setEditBuffer(b => ({ ...b, L: parseInt(e.target.value) || 0 }))} />
                      </td>
                      <td className="py-1 px-2">
                        <input type="number" className="w-14 border border-slate-300 rounded px-1 py-0.5 text-[12px] text-center"
                          value={editBuffer.PD} onChange={(e) => setEditBuffer(b => ({ ...b, PD: parseInt(e.target.value) || 0 }))} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 px-2 tabular-nums">{r.W}</td>
                      <td className="py-1 px-2 tabular-nums">{r.L}</td>
                      <td className="py-1 px-2 tabular-nums">{r.PD}</td>
                    </>
                  )}
                  {isAdmin && (
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        className="w-14 border border-slate-300 rounded px-1 py-0.5 text-[12px] text-center disabled:bg-slate-100 disabled:text-slate-400"
                        value={bonuses[r.name]?.w ?? 0}
                        onChange={(e) => setBonus(r.name, { w: parseInt(e.target.value) || 0 })}
                        disabled={isOverridden}
                        title={isOverridden ? 'Ignored while this player has a manual override' : ''}
                      />
                    </td>
                  )}
                  {isAdmin && (
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        className="w-14 border border-slate-300 rounded px-1 py-0.5 text-[12px] text-center disabled:bg-slate-100 disabled:text-slate-400"
                        value={bonuses[r.name]?.pd ?? 0}
                        onChange={(e) => setBonus(r.name, { pd: parseInt(e.target.value) || 0 })}
                        disabled={isOverridden}
                        title={isOverridden ? 'Ignored while this player has a manual override' : ''}
                      />
                    </td>
                  )}
                  {isAdmin && (
                    <td className="py-1 px-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <button className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] hover:bg-emerald-700" onClick={saveEditRow}>Save</button>
                          <button className="px-2 py-0.5 rounded border text-[11px]" onClick={cancelEditRow}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button className="px-2 py-0.5 rounded border text-slate-700 hover:bg-slate-50 text-[11px]" onClick={() => startEditRow(r)}>Edit</button>
                          {isOverridden && (
                            <button className="px-2 py-0.5 rounded border text-slate-500 hover:bg-slate-50 text-[11px]" onClick={() => clearOverride(r.name)}>Clear</button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section>
      <h2 className="text-[18px] font-bold text-sky-900 mb-1">Leaderboard (Doubles – Live)</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Play to {scoreSettings.playTo}{scoreSettings.cap ? `, cap ${scoreSettings.cap}` : ', no cap'}, win by 2. W/L/PD auto-update as you type scores.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Table title="Guys Standings" rows={guysRows} />
        <Table title="Girls Standings" rows={girlsRows} />
      </div>
    </section>
  );
}

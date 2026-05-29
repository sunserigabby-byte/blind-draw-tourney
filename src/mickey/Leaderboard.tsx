import React, { useMemo } from 'react';
import type { MickeyTeam, MickeyMatchRow, ScoreSettings } from '../types';
import { parseScore, slug, mickeyTeamLabel } from '../utils';

type TeamRow = { id: string; name: string; label: string; pool: number; W: number; L: number; PD: number; sets: number };
type UnitRow = {
  key: string;
  label: string;
  kind: 'pair' | 'free';
  teamName: string | null;
  pool: number | null;
  W: number;
  L: number;
  PD: number;
  sets: number;
  placed: boolean;
};

// Each pairs line = one pair (names split by & , / or +). Free agents = one name per line.
function parsePairs(text: string): string[][] {
  return (text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(/[&/+,]/).map(s => s.trim()).filter(Boolean))
    .filter(g => g.length > 0);
}
function parseFree(text: string): string[] {
  return (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

export function MickeyLeaderboard({
  matches,
  teams,
  pairsText,
  freeAgentsText,
  scoreSettings = { playTo: 21, cap: null },
}: {
  matches: MickeyMatchRow[];
  teams: MickeyTeam[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings?: ScoreSettings;
}) {
  const { poolsWithRows, unitRows } = useMemo(() => {
    // 1) Team records (per set)
    const teamStats = new Map<string, TeamRow>();
    for (const t of teams) {
      teamStats.set(t.id, { id: t.id, name: t.name, label: mickeyTeamLabel(t, pairsText), pool: t.pool, W: 0, L: 0, PD: 0, sets: 0 });
    }

    const applySet = (scoreText: string | undefined, aId: string, bId: string) => {
      const s = parseScore(scoreText);
      if (!s || s[0] === s[1]) return;
      const [x, y] = s;
      const diff = Math.abs(x - y);
      const aWon = x > y;
      const a = teamStats.get(aId);
      const b = teamStats.get(bId);
      if (a) { a.sets++; if (aWon) { a.W++; a.PD += diff; } else { a.L++; a.PD -= diff; } }
      if (b) { b.sets++; if (aWon) { b.L++; b.PD -= diff; } else { b.W++; b.PD += diff; } }
    };

    for (const m of matches) {
      applySet(m.mickeyScore, m.teamAId, m.teamBId);
      applySet(m.minnieScore, m.teamAId, m.teamBId);
    }

    // 2) Group teams by pool, ranked
    const byPool = new Map<number, TeamRow[]>();
    for (const r of teamStats.values()) {
      if (!byPool.has(r.pool)) byPool.set(r.pool, []);
      byPool.get(r.pool)!.push(r);
    }
    for (const list of byPool.values()) {
      list.sort((a, b) => b.W - a.W || b.PD - a.PD || a.name.localeCompare(b.name));
    }
    const poolsWithRows = [...byPool.entries()].sort((a, b) => a[0] - b[0]);

    // 3) Map each pair / free agent to the team it landed on → inherit that record
    const teamSlugSets = teams.map(t => ({ team: t, set: new Set(t.players.map(slug)) }));
    const findTeam = (members: string[]): MickeyTeam | null => {
      const exact = teamSlugSets.find(({ set }) => members.every(m => set.has(slug(m))));
      if (exact) return exact.team;
      const partial = teamSlugSets.find(({ set }) => set.has(slug(members[0])));
      return partial?.team ?? null;
    };

    const units: { kind: 'pair' | 'free'; members: string[] }[] = [
      ...parsePairs(pairsText).map(members => ({ kind: 'pair' as const, members })),
      ...parseFree(freeAgentsText).map(name => ({ kind: 'free' as const, members: [name] })),
    ];

    const unitRows: UnitRow[] = units.map((u, i) => {
      const team = findTeam(u.members);
      const rec = team ? teamStats.get(team.id) : undefined;
      return {
        key: `${u.kind}-${i}-${u.members.join('|')}`,
        label: u.kind === 'pair' ? u.members.join(' & ') : (u.members[0] ?? ''),
        kind: u.kind,
        teamName: team?.name ?? null,
        pool: team?.pool ?? null,
        W: rec?.W ?? 0,
        L: rec?.L ?? 0,
        PD: rec?.PD ?? 0,
        sets: rec?.sets ?? 0,
        placed: !!team,
      };
    });

    unitRows.sort((a, b) => {
      if (a.placed !== b.placed) return a.placed ? -1 : 1;
      return b.W - a.W || b.PD - a.PD || a.label.localeCompare(b.label);
    });

    return { poolsWithRows, unitRows };
  }, [matches, teams, pairsText, freeAgentsText]);

  if (teams.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[18px] font-bold text-sky-900 mb-1">Standings (Mickey &amp; Minnie – Live)</h2>
        <p className="text-[11px] text-slate-500">
          Play to {scoreSettings.playTo}{scoreSettings.cap ? `, cap ${scoreSettings.cap}` : ', no cap'}, win by 2.
          Wins counted per set; seeded by record, then point differential (PD).
        </p>
      </div>

      {/* Pool seeding cards */}
      <div>
        <h3 className="text-[13px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">Pool Seeding</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {poolsWithRows.map(([pool, rows]) => (
            <section key={pool} className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
              <h4 className="text-[15px] font-semibold text-sky-800 mb-2">Pool {pool}</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-1 px-2">#</th>
                      <th className="py-1 px-2">Team</th>
                      <th className="py-1 px-2">W</th>
                      <th className="py-1 px-2">L</th>
                      <th className="py-1 px-2">PD</th>
                      <th className="py-1 px-2">Sets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1 px-2 tabular-nums font-semibold text-sky-800">{i + 1}</td>
                        <td className="py-1 px-2">{r.label}</td>
                        <td className="py-1 px-2 tabular-nums">{r.W}</td>
                        <td className="py-1 px-2 tabular-nums">{r.L}</td>
                        <td className="py-1 px-2 tabular-nums">{r.PD}</td>
                        <td className="py-1 px-2 tabular-nums text-slate-400">{r.sets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Main leaderboard: per pair / free agent */}
      <div>
        <h3 className="text-[13px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">
          Main Leaderboard — by Pair / Free Agent
        </h3>
        <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
          <p className="text-[11px] text-slate-500 mb-2">
            Each pair and free agent carries the record of the team they were drawn onto — handy for re-seeding if you re-draw teams for playoffs.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1 px-2">#</th>
                  <th className="py-1 px-2">Pair / Free Agent</th>
                  <th className="py-1 px-2">Pool</th>
                  <th className="py-1 px-2">W</th>
                  <th className="py-1 px-2">L</th>
                  <th className="py-1 px-2">PD</th>
                </tr>
              </thead>
              <tbody>
                {unitRows.map((r, i) => (
                  <tr key={r.key} className={'border-t ' + (r.placed ? '' : 'opacity-50')}>
                    <td className="py-1 px-2 tabular-nums">{r.placed ? i + 1 : '–'}</td>
                    <td className="py-1 px-2">
                      <span className="mr-1.5">{r.label}</span>
                      <span className={
                        'text-[10px] px-1.5 py-0.5 rounded-full ' +
                        (r.kind === 'pair' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')
                      }>
                        {r.kind === 'pair' ? 'Pair' : 'Free agent'}
                      </span>
                    </td>
                    <td className="py-1 px-2 tabular-nums">{r.pool ?? '–'}</td>
                    <td className="py-1 px-2 tabular-nums">{r.W}</td>
                    <td className="py-1 px-2 tabular-nums">{r.L}</td>
                    <td className="py-1 px-2 tabular-nums">{r.PD}</td>
                  </tr>
                ))}
                {unitRows.length === 0 && (
                  <tr className="border-t">
                    <td colSpan={6} className="py-2 px-2 text-slate-400 text-[12px]">
                      Add pairs / free agents above to see them here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

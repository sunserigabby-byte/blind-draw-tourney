import React, { useMemo } from 'react';
import type { MickeyTeam, MickeyMatchRow, ScoreSettings } from '../types';
import { uniq, parseScore, isValidScore, mickeyTeamLabel } from '../utils';

// Default schedule baseline. Used to auto-compute each match's time slot
// within its pool. (Configurable inline at the top of the matches view.)
const DEFAULT_START_HOUR = 9;          // 9:00 AM
const DEFAULT_DURATION_MIN = 45;       // 45 min per match

function formatTime(hour24: number, minute: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

// Read/write one side of a combined "21-18" score string.
function getSide(score: string | undefined, side: 'a' | 'b'): string {
  const text = (score || '').trim();
  if (!text) return '';
  const m = text.match(/^(\d*)\s*[-–]\s*(\d*)$/);
  if (!m) return '';
  return (side === 'a' ? m[1] : m[2]) ?? '';
}
function setSide(score: string | undefined, side: 'a' | 'b', val: string): string {
  const a = side === 'a' ? val.trim() : getSide(score, 'a');
  const b = side === 'b' ? val.trim() : getSide(score, 'b');
  if (!a && !b) return '';
  return `${a}-${b}`;
}

function ScoreInput({
  value,
  onChange,
  isAdmin,
  winning,
  invalid,
  warn,
}: {
  value: string;
  onChange: (v: string) => void;
  isAdmin?: boolean;
  winning: boolean;
  invalid: boolean;
  warn: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={
        'w-12 text-center border rounded px-1 py-1 text-[13px] tabular-nums font-semibold ' +
        (winning ? 'bg-emerald-50 ' : '') +
        (warn ? 'border-amber-400 bg-amber-50' : invalid ? 'border-red-500 bg-red-50' : 'border-slate-300')
      }
      value={value}
      onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))}
      readOnly={!isAdmin}
    />
  );
}

function MatchupCard({
  m,
  idx,
  teamAName,
  teamBName,
  timeLabel,
  refLabel,
  scoreSettings,
  isAdmin,
  update,
}: {
  m: MickeyMatchRow;
  idx: number;
  teamAName: string;
  teamBName: string;
  timeLabel: string;
  refLabel: string | null;
  scoreSettings: ScoreSettings;
  isAdmin?: boolean;
  update: (id: string, patch: Partial<MickeyMatchRow>) => void;
}) {
  const mick = parseScore(m.mickeyScore);
  const min = parseScore(m.minnieScore);

  const mickScored = mick && mick[0] !== mick[1];
  const minScored = min && min[0] !== min[1];

  const mickValid = !m.mickeyScore || (mick ? isValidScore(mick[0], mick[1], scoreSettings) : false);
  const minValid = !m.minnieScore || (min ? isValidScore(min[0], min[1], scoreSettings) : false);

  const mickWarn = !!mickScored && !mickValid;
  const minWarn = !!minScored && !minValid;

  const mickAWin = !!mickScored && mick![0] > mick![1];
  const mickBWin = !!mickScored && mick![1] > mick![0];
  const minAWin = !!minScored && min![0] > min![1];
  const minBWin = !!minScored && min![1] > min![0];

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
      <div className="px-3 py-2 border-b bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
          <span>Match {idx + 1}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-semibold">
            Court {m.pool}
          </span>
        </div>
        <div className="text-[12px] text-slate-500 tabular-nums">{timeLabel}</div>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-slate-500 text-[10px] uppercase tracking-wide">
            <th className="font-normal text-left py-1.5 px-3">Team</th>
            <th className="font-normal text-center py-1.5 px-3 w-20">Mickey</th>
            <th className="font-normal text-center py-1.5 px-3 w-20">Minnie</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-2 px-3">{teamAName}</td>
            <td className={'py-2 px-3 text-center ' + (mickAWin ? 'bg-emerald-50' : '')}>
              <ScoreInput
                value={getSide(m.mickeyScore, 'a')}
                onChange={v => update(m.id, { mickeyScore: setSide(m.mickeyScore, 'a', v) })}
                isAdmin={isAdmin}
                winning={mickAWin}
                invalid={!mickValid}
                warn={mickWarn}
              />
            </td>
            <td className={'py-2 px-3 text-center ' + (minAWin ? 'bg-emerald-50' : '')}>
              <ScoreInput
                value={getSide(m.minnieScore, 'a')}
                onChange={v => update(m.id, { minnieScore: setSide(m.minnieScore, 'a', v) })}
                isAdmin={isAdmin}
                winning={minAWin}
                invalid={!minValid}
                warn={minWarn}
              />
            </td>
          </tr>
          <tr className="border-t">
            <td className="py-2 px-3">{teamBName}</td>
            <td className={'py-2 px-3 text-center ' + (mickBWin ? 'bg-emerald-50' : '')}>
              <ScoreInput
                value={getSide(m.mickeyScore, 'b')}
                onChange={v => update(m.id, { mickeyScore: setSide(m.mickeyScore, 'b', v) })}
                isAdmin={isAdmin}
                winning={mickBWin}
                invalid={!mickValid}
                warn={mickWarn}
              />
            </td>
            <td className={'py-2 px-3 text-center ' + (minBWin ? 'bg-emerald-50' : '')}>
              <ScoreInput
                value={getSide(m.minnieScore, 'b')}
                onChange={v => update(m.id, { minnieScore: setSide(m.minnieScore, 'b', v) })}
                isAdmin={isAdmin}
                winning={minBWin}
                invalid={!minValid}
                warn={minWarn}
              />
            </td>
          </tr>
        </tbody>
      </table>
      {refLabel && (
        <div className="px-3 py-1.5 border-t border-slate-200 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">Ref:</span> {refLabel}
        </div>
      )}
    </div>
  );
}

export function MickeyMatchesView({
  matches,
  setMatches,
  teams,
  pairsText = '',
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
}: {
  matches: MickeyMatchRow[];
  setMatches: (f: ((prev: MickeyMatchRow[]) => MickeyMatchRow[]) | MickeyMatchRow[]) => void;
  teams: MickeyTeam[];
  pairsText?: string;
  isAdmin?: boolean;
  scoreSettings?: ScoreSettings;
}) {
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, mickeyTeamLabel(t, pairsText));
    return (id: string) => m.get(id) ?? '(deleted team)';
  }, [teams, pairsText]);

  const teamsByPool = useMemo(() => {
    const map = new Map<number, MickeyTeam[]>();
    for (const t of teams) {
      if (!map.has(t.pool)) map.set(t.pool, []);
      map.get(t.pool)!.push(t);
    }
    return map;
  }, [teams]);

  const pools = useMemo(
    () => uniq(matches.map(m => m.pool)).sort((a, b) => a - b),
    [matches],
  );

  const update = (id: string, patch: Partial<MickeyMatchRow>) =>
    setMatches(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Pool Matchups &amp; Results</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {pools.length === 0 && (
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No matchups yet. Build your teams above, then click <span className="font-medium">Generate Pool Matchups</span>.
        </p>
      )}

      {pools.length > 0 && (
        <div className="mb-3 text-[11px] text-slate-500">
          Double round-robin — every team plays every other team twice in its pool. Times start at{' '}
          {formatTime(DEFAULT_START_HOUR, 0)} and step every {DEFAULT_DURATION_MIN} min. Refs auto-assigned
          to the team sitting out.
        </div>
      )}

      <div className="mt-2 space-y-6">
        {pools.map(pool => {
          const poolMatches = matches.filter(m => m.pool === pool);
          const poolTeams = teamsByPool.get(pool) ?? [];

          return (
            <div key={pool}>
              <h3 className="text-[15px] font-semibold text-sky-800 mb-2">Pool {pool}</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {poolMatches.map((m, idx) => {
                  // Auto-time: start + (idx × duration) minutes
                  const minutes = idx * DEFAULT_DURATION_MIN;
                  const hour24 = DEFAULT_START_HOUR + Math.floor(minutes / 60);
                  const minute = minutes % 60;
                  const timeLabel = formatTime(hour24, minute);

                  // Auto-ref: rotate through teams in this pool not playing.
                  const idle = poolTeams.filter(t => t.id !== m.teamAId && t.id !== m.teamBId);
                  const refTeam = idle.length > 0 ? idle[idx % idle.length] : null;
                  const refLabel = refTeam ? mickeyTeamLabel(refTeam, pairsText) : null;

                  return (
                    <MatchupCard
                      key={m.id}
                      m={m}
                      idx={idx}
                      teamAName={nameOf(m.teamAId)}
                      teamBName={nameOf(m.teamBId)}
                      timeLabel={timeLabel}
                      refLabel={refLabel}
                      scoreSettings={scoreSettings}
                      isAdmin={isAdmin}
                      update={update}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

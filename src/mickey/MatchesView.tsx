import React, { useMemo } from 'react';
import type { MickeyTeam, MickeyMatchRow, ScoreSettings } from '../types';
import { parseScore, isValidScore, mickeyTeamLabel } from '../utils';

// Default schedule baseline. Used to auto-compute each round's time slot.
const DEFAULT_START_HOUR = 9;          // 9:00 AM
const DEFAULT_DURATION_MIN = 45;       // 45 min per round of simultaneous matches

function formatTime(hour24: number, minute: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
}
function timeForSlot(slotIdx: number): string {
  const minutes = slotIdx * DEFAULT_DURATION_MIN;
  const hour24 = DEFAULT_START_HOUR + Math.floor(minutes / 60);
  return formatTime(hour24, minutes % 60);
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

// Greedy schedule: pack matches into time slots, up to N matches per slot,
// such that no team is in two simultaneous matches. Idle teams in a slot
// are available to ref.
type ScheduledMatch = { m: MickeyMatchRow; slot: number; court: number };
function buildSchedule(matches: MickeyMatchRow[], courtCount: number): ScheduledMatch[] {
  const cn = Math.max(1, Math.floor(courtCount) || 1);
  const remaining = matches.map(m => ({ m, scheduled: false }));
  const out: ScheduledMatch[] = [];
  let slot = 0;
  let safety = 0;
  while (remaining.some(r => !r.scheduled) && safety < 5000) {
    safety++;
    const teamsInSlot = new Set<string>();
    let court = 0;
    for (const r of remaining) {
      if (r.scheduled) continue;
      if (court >= cn) break;
      if (teamsInSlot.has(r.m.teamAId) || teamsInSlot.has(r.m.teamBId)) continue;
      out.push({ m: r.m, slot, court });
      teamsInSlot.add(r.m.teamAId);
      teamsInSlot.add(r.m.teamBId);
      r.scheduled = true;
      court++;
    }
    slot++;
  }
  return out;
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
  matchNumber,
  courtNumber,
  timeLabel,
  teamAName,
  teamBName,
  refLabel,
  scoreSettings,
  isAdmin,
  update,
}: {
  m: MickeyMatchRow;
  matchNumber: number;
  courtNumber: number;
  timeLabel: string;
  teamAName: string;
  teamBName: string;
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
          <span>Match {matchNumber}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-semibold">
            Court {courtNumber}
          </span>
          <span className="text-[10px] text-slate-500">Pool {m.pool}</span>
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
  courtCount,
  setCourtCount,
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
}: {
  matches: MickeyMatchRow[];
  setMatches: (f: ((prev: MickeyMatchRow[]) => MickeyMatchRow[]) | MickeyMatchRow[]) => void;
  teams: MickeyTeam[];
  pairsText?: string;
  courtCount: number;
  setCourtCount: (n: number) => void;
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

  const schedule = useMemo(() => buildSchedule(matches, courtCount), [matches, courtCount]);
  const slotGroups = useMemo(() => {
    const m = new Map<number, ScheduledMatch[]>();
    for (const s of schedule) {
      if (!m.has(s.slot)) m.set(s.slot, []);
      m.get(s.slot)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [schedule]);

  const update = (id: string, patch: Partial<MickeyMatchRow>) =>
    setMatches(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));

  // Global match numbering follows schedule order (slot ascending, then court).
  let runningMatchNumber = 0;

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-1 tracking-tight">Pool Matchups &amp; Results</h2>

      {/* Courts available control */}
      <div className="mt-3 mb-4 flex items-center gap-3 flex-wrap text-[12px] text-slate-600">
        <label className="font-medium text-slate-700">Courts available:</label>
        <input
          type="number"
          min={1}
          max={50}
          value={courtCount}
          onChange={e => setCourtCount(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-16 border border-slate-300 rounded px-2 py-1 text-center font-semibold"
          readOnly={!isAdmin}
          disabled={!isAdmin}
        />
        <span className="text-slate-500">
          {courtCount === 1
            ? 'one match per round; idle teams sit or ref.'
            : `up to ${courtCount} matches per round; idle teams sit or ref.`}
        </span>
      </div>

      {slotGroups.length === 0 && (
        <p className="text-[13px] text-slate-500 max-w-lg mx-auto">
          No matchups yet. Build your teams above, then click <span className="font-medium">Generate Pool Matchups</span>.
        </p>
      )}

      {slotGroups.length > 0 && (
        <div className="text-[11px] text-slate-500 mb-3">
          Double round-robin · times start at {timeForSlot(0)} and step every {DEFAULT_DURATION_MIN} min ·
          {' '}refs are auto-assigned from teams sitting out (if any).
        </div>
      )}

      <div className="space-y-5">
        {slotGroups.map(([slotIdx, slotMatches]) => {
          const sorted = slotMatches.slice().sort((a, b) => a.court - b.court);
          const playingIds = new Set<string>();
          for (const s of sorted) {
            playingIds.add(s.m.teamAId);
            playingIds.add(s.m.teamBId);
          }
          const idleTeamsAll = teams.filter(t => !playingIds.has(t.id));
          const time = timeForSlot(slotIdx);

          // For each match in the slot, prefer a ref from the SAME pool's idle teams.
          // If no same-pool idle team, fall back to any other idle team.
          const usedRefIds = new Set<string>();
          const pickRef = (poolNum: number): MickeyTeam | null => {
            const samePool = idleTeamsAll.filter(t => t.pool === poolNum && !usedRefIds.has(t.id));
            if (samePool.length > 0) {
              usedRefIds.add(samePool[0].id);
              return samePool[0];
            }
            const any = idleTeamsAll.filter(t => !usedRefIds.has(t.id));
            if (any.length > 0) {
              usedRefIds.add(any[0].id);
              return any[0];
            }
            return null;
          };

          return (
            <div key={slotIdx}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                <h3 className="text-[15px] font-semibold text-sky-800">
                  Round {slotIdx + 1}
                  <span className="ml-2 text-[12px] font-normal text-slate-500">{time}</span>
                </h3>
                {idleTeamsAll.length > 0 && (
                  <div className="text-[11px] text-slate-500">
                    Sitting: {idleTeamsAll.map(t => mickeyTeamLabel(t, pairsText)).join(' · ')}
                  </div>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {sorted.map(s => {
                  runningMatchNumber++;
                  const refTeam = pickRef(s.m.pool);
                  const refLabel = refTeam ? mickeyTeamLabel(refTeam, pairsText) : null;
                  return (
                    <MatchupCard
                      key={s.m.id}
                      m={s.m}
                      matchNumber={runningMatchNumber}
                      courtNumber={s.court + 1}
                      timeLabel={time}
                      teamAName={nameOf(s.m.teamAId)}
                      teamBName={nameOf(s.m.teamBId)}
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

      {teamsByPool.size === 0 && schedule.length === 0 && null}
    </section>
  );
}

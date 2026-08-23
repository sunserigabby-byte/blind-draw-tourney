import React, { useMemo } from 'react';
import type { RevcoMatchRow, ScoreSettings, RevcoBDRound } from '../types';
import { parseScore, isValidScore, mickeyTeamLabel } from '../utils';

function formatTime(hour24: number, minute: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
}
function timeForSlot(slotIdx: number, startHour: number, slotMinutes: number): string {
  const totalMin = slotIdx * slotMinutes;
  return formatTime(startHour + Math.floor(totalMin / 60), totalMin % 60);
}

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
  value, onChange, isAdmin, winning, invalid, warn,
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
  scoreSettings,
  isAdmin,
  update,
}: {
  m: RevcoMatchRow;
  matchNumber: number;
  courtNumber: number;
  timeLabel: string;
  teamAName: string;
  teamBName: string;
  scoreSettings: ScoreSettings;
  isAdmin?: boolean;
  update: (id: string, patch: Partial<RevcoMatchRow>) => void;
}) {
  const parsed = parseScore(m.scoreText);
  const scored = parsed && parsed[0] !== parsed[1];
  const valid = !m.scoreText || (parsed ? isValidScore(parsed[0], parsed[1], scoreSettings) : false);
  const warn = !!scored && !valid;
  const aWin = !!scored && !!valid && parsed![0] > parsed![1];
  const bWin = !!scored && !!valid && parsed![1] > parsed![0];

  const writeScore = (side: 'a' | 'b', val: string) => {
    update(m.id, { scoreText: setSide(m.scoreText, side, val) });
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
      <div className="px-3 py-2 border-b bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
          <span>Match {matchNumber}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-semibold">
            Court {courtNumber}
          </span>
        </div>
        <span className="text-[12px] text-slate-500 tabular-nums">{timeLabel}</span>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-slate-500 text-[10px] uppercase tracking-wide">
            <th className="font-normal text-left py-1.5 px-3">Team</th>
            <th className="font-normal text-center py-1.5 px-3 w-20">Score</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-2 px-3">{teamAName}</td>
            <td className={'py-2 px-3 text-center ' + (aWin ? 'bg-emerald-50' : '')}>
              <ScoreInput
                value={getSide(m.scoreText, 'a')}
                onChange={v => writeScore('a', v)}
                isAdmin={isAdmin}
                winning={aWin}
                invalid={!valid}
                warn={warn}
              />
            </td>
          </tr>
          <tr className="border-t">
            <td className="py-2 px-3">{teamBName}</td>
            <td className={'py-2 px-3 text-center ' + (bWin ? 'bg-emerald-50' : '')}>
              <ScoreInput
                value={getSide(m.scoreText, 'b')}
                onChange={v => writeScore('b', v)}
                isAdmin={isAdmin}
                winning={bWin}
                invalid={!valid}
                warn={warn}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function RevcoBDMatchesView({
  rounds,
  setRounds,
  pairsText = '',
  courtCount = 1,
  startHour = 9,
  slotMinutes = 45,
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
}: {
  rounds: RevcoBDRound[];
  setRounds: (f: ((prev: RevcoBDRound[]) => RevcoBDRound[]) | RevcoBDRound[]) => void;
  pairsText?: string;
  courtCount?: number;
  startHour?: number;
  slotMinutes?: number;
  isAdmin?: boolean;
  scoreSettings?: ScoreSettings;
}) {
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rounds) {
      for (const t of r.teams) m.set(t.id, mickeyTeamLabel(t, pairsText));
    }
    return (id: string) => m.get(id) ?? '(deleted team)';
  }, [rounds, pairsText]);

  const update = (matchId: string, patch: Partial<RevcoMatchRow>) =>
    setRounds(prev => prev.map(r => ({
      ...r,
      matches: r.matches.map(m => (m.id === matchId ? { ...m, ...patch } : m)),
    })));

  // Count how many rounds are fully scored for the summary header
  const totalRounds = rounds.length;
  const scoredRounds = rounds.filter(r =>
    r.matches.length > 0 &&
    r.matches.every(m => {
      const p = parseScore(m.scoreText);
      return p && p[0] !== p[1] && isValidScore(p[0], p[1], scoreSettings);
    })
  ).length;

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <h2 className="text-[20px] font-bold text-sky-800 tracking-tight">Round Matchups &amp; Results</h2>
        {totalRounds > 0 && (
          <span className={
            'text-[12px] font-semibold px-2.5 py-1 rounded-full ' +
            (scoredRounds === totalRounds
              ? 'bg-emerald-100 text-emerald-800'
              : scoredRounds > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-600')
          }>
            {scoredRounds}/{totalRounds} rounds complete
          </span>
        )}
      </div>

      {rounds.length === 0 && (
        <p className="text-[13px] text-slate-500 max-w-lg mx-auto">
          No rounds yet. Enter your roster and click <span className="font-medium">Generate Next Round</span> in the Teams sub-tab.
        </p>
      )}

      <div className="space-y-5 mt-2">
        {(() => {
          let globalSlotIdx = 0;
          const elements: React.ReactNode[] = [];
          for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
            const round = rounds[rIdx];
            const playingIds = new Set<string>();
            for (const m of round.matches) {
              playingIds.add(m.teamAId);
              playingIds.add(m.teamBId);
            }
            const sitting = round.teams.filter(t => !playingIds.has(t.id));

            // Count scored matches for this round
            const roundScored = round.matches.filter(m => {
              const p = parseScore(m.scoreText);
              return p && p[0] !== p[1] && isValidScore(p[0], p[1], scoreSettings);
            }).length;
            const roundTotal = round.matches.length;
            const roundComplete = roundTotal > 0 && roundScored === roundTotal;
            const roundPartial = roundScored > 0 && roundScored < roundTotal;

            const cn = Math.max(1, Math.floor(courtCount) || 1);
            const subSlots: typeof round.matches[] = [];
            for (let i = 0; i < round.matches.length; i += cn) {
              subSlots.push(round.matches.slice(i, i + cn));
            }
            if (subSlots.length === 0) subSlots.push([]);

            elements.push(
              <div key={round.id}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-semibold text-sky-800">
                      Round {round.number}
                      {subSlots.length === 1 && (
                        <span className="ml-2 text-[12px] font-normal text-slate-500">
                          {timeForSlot(globalSlotIdx, startHour, slotMinutes)}
                        </span>
                      )}
                    </h3>
                    {roundTotal > 0 && (
                      <span className={
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full ' +
                        (roundComplete
                          ? 'bg-emerald-100 text-emerald-700'
                          : roundPartial
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-500')
                      }>
                        {roundComplete ? '✓ done' : `${roundScored}/${roundTotal} scored`}
                      </span>
                    )}
                  </div>
                  {sitting.length > 0 && (
                    <div className="text-[11px] text-slate-500">
                      Sitting this round: {sitting.map(t => mickeyTeamLabel(t, pairsText)).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {subSlots.map((slotMatches, sIdx) => {
                    const slotTime = timeForSlot(globalSlotIdx, startHour, slotMinutes);
                    globalSlotIdx += 1;
                    return (
                      <div key={`${round.id}-slot-${sIdx}`}>
                        {subSlots.length > 1 && (
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                            Slot {sIdx + 1} of {subSlots.length} · {slotTime}
                          </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-3">
                          {slotMatches.map((m, idx) => {
                            const matchNumberWithinRound = sIdx * cn + idx + 1;
                            return (
                              <MatchupCard
                                key={m.id}
                                m={m}
                                matchNumber={matchNumberWithinRound}
                                courtNumber={idx + 1}
                                timeLabel={slotTime}
                                teamAName={nameOf(m.teamAId)}
                                teamBName={nameOf(m.teamBId)}
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
              </div>
            );
          }
          return elements;
        })()}
      </div>
    </section>
  );
}

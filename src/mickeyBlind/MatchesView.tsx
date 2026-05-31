import React, { useMemo } from 'react';
import type { MickeyTeam, MickeyMatchRow, ScoreSettings } from '../types';
import { parseScore, isValidScore, mickeyTeamLabel } from '../utils';
import type { MickeyBDRound } from './RoundManager';

const DEFAULT_START_HOUR = 9;
const DEFAULT_DURATION_MIN = 45;
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
  m: MickeyMatchRow;
  matchNumber: number;
  courtNumber: number;
  timeLabel: string;
  teamAName: string;
  teamBName: string;
  scoreSettings: ScoreSettings;
  isAdmin?: boolean;
  update: (id: string, patch: Partial<MickeyMatchRow>) => void;
}) {
  type FmtData = { fmt: 'MICKEY' | 'MINNIE'; label: string; text: string | undefined; valid: boolean; warn: boolean; aWin: boolean; bWin: boolean };
  const fmtData: FmtData[] = (['MICKEY', 'MINNIE'] as const).map(fmt => {
    const text = fmt === 'MICKEY' ? m.mickeyScore : m.minnieScore;
    const parsed = parseScore(text);
    const scored = parsed && parsed[0] !== parsed[1];
    const valid = !text || (parsed ? isValidScore(parsed[0], parsed[1], scoreSettings) : false);
    const warn = !!scored && !valid;
    const aWin = !!scored && parsed![0] > parsed![1];
    const bWin = !!scored && parsed![1] > parsed![0];
    return { fmt, label: fmt === 'MICKEY' ? 'Mickey' : 'Minnie', text, valid, warn, aWin, bWin };
  });

  const writeScore = (fmt: 'MICKEY' | 'MINNIE', side: 'a' | 'b', val: string) => {
    if (fmt === 'MICKEY') update(m.id, { mickeyScore: setSide(m.mickeyScore, side, val) });
    else update(m.id, { minnieScore: setSide(m.minnieScore, side, val) });
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
        <div className="flex items-center gap-2">
          <a
            href={`#score=${m.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-sky-700 hover:underline"
            title="Open this match in a focused live-scoring page"
          >
            Live score ↗
          </a>
          <span className="text-[12px] text-slate-500 tabular-nums">{timeLabel}</span>
        </div>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-slate-500 text-[10px] uppercase tracking-wide">
            <th className="font-normal text-left py-1.5 px-3">Team</th>
            {fmtData.map(d => (
              <th key={d.fmt} className="font-normal text-center py-1.5 px-3 w-20">{d.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-2 px-3">{teamAName}</td>
            {fmtData.map(d => (
              <td key={d.fmt} className={'py-2 px-3 text-center ' + (d.aWin ? 'bg-emerald-50' : '')}>
                <ScoreInput
                  value={getSide(d.text, 'a')}
                  onChange={v => writeScore(d.fmt, 'a', v)}
                  isAdmin={isAdmin}
                  winning={d.aWin}
                  invalid={!d.valid}
                  warn={d.warn}
                />
              </td>
            ))}
          </tr>
          <tr className="border-t">
            <td className="py-2 px-3">{teamBName}</td>
            {fmtData.map(d => (
              <td key={d.fmt} className={'py-2 px-3 text-center ' + (d.bWin ? 'bg-emerald-50' : '')}>
                <ScoreInput
                  value={getSide(d.text, 'b')}
                  onChange={v => writeScore(d.fmt, 'b', v)}
                  isAdmin={isAdmin}
                  winning={d.bWin}
                  invalid={!d.valid}
                  warn={d.warn}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function MickeyBDMatchesView({
  rounds,
  setRounds,
  pairsText = '',
  isAdmin,
  scoreSettings = { playTo: 21, cap: null },
}: {
  rounds: MickeyBDRound[];
  setRounds: (f: ((prev: MickeyBDRound[]) => MickeyBDRound[]) | MickeyBDRound[]) => void;
  pairsText?: string;
  isAdmin?: boolean;
  scoreSettings?: ScoreSettings;
}) {
  // Build name lookup across ALL rounds (a team belongs to exactly one round,
  // but ids are globally unique).
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rounds) {
      for (const t of r.teams) m.set(t.id, mickeyTeamLabel(t, pairsText));
    }
    return (id: string) => m.get(id) ?? '(deleted team)';
  }, [rounds, pairsText]);

  const update = (matchId: string, patch: Partial<MickeyMatchRow>) =>
    setRounds(prev => prev.map(r => ({
      ...r,
      matches: r.matches.map(m => (m.id === matchId ? { ...m, ...patch } : m)),
    })));

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Round Matchups &amp; Results</h2>

      {rounds.length === 0 && (
        <p className="text-[13px] text-slate-500 max-w-lg mx-auto">
          No rounds yet. Enter your roster and click <span className="font-medium">Generate Next Round</span> in the Teams sub-tab.
        </p>
      )}

      <div className="space-y-5 mt-2">
        {rounds.map((round, roundIdx) => {
          const time = timeForSlot(roundIdx);
          const playingIds = new Set<string>();
          for (const m of round.matches) {
            playingIds.add(m.teamAId);
            playingIds.add(m.teamBId);
          }
          const sitting = round.teams.filter(t => !playingIds.has(t.id));

          return (
            <div key={round.id}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                <h3 className="text-[15px] font-semibold text-sky-800">
                  Round {round.number}
                  <span className="ml-2 text-[12px] font-normal text-slate-500">{time}</span>
                </h3>
                {sitting.length > 0 && (
                  <div className="text-[11px] text-slate-500">
                    Sitting: {sitting.map(t => mickeyTeamLabel(t, pairsText)).join(' · ')}
                  </div>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {round.matches.map((m, idx) => (
                  <MatchupCard
                    key={m.id}
                    m={m}
                    matchNumber={idx + 1}
                    courtNumber={idx + 1}
                    timeLabel={time}
                    teamAName={nameOf(m.teamAId)}
                    teamBName={nameOf(m.teamBId)}
                    scoreSettings={scoreSettings}
                    isAdmin={isAdmin}
                    update={update}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

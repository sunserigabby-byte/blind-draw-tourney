import React, { useMemo, useState } from 'react';
import type { RevcoBDRound, RevcoRotPlayer, RevcoRotPlayoff, RevcoRotMatch, ScoreSettings } from '../types';
import { slug, parseMickeyPairsGendered, parseMickeyFreeGendered } from '../utils';
import { computeRevcoStandings, type RevcoOverrides } from './Leaderboard';
import { startPlayoff, nextRound, playerRecords, champions, roundComplete, matchWinner } from './rotating';

const GROUP_LABEL: Record<RevcoRotMatch['group'], string> = {
  W: 'Undefeated',
  L: 'One loss',
  MIX: 'Combined',
  F: 'Final',
};
const GROUP_STYLE: Record<RevcoRotMatch['group'], string> = {
  W: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  L: 'bg-amber-50 text-amber-800 ring-amber-200',
  MIX: 'bg-slate-100 text-slate-700 ring-slate-200',
  F: 'bg-purple-50 text-purple-700 ring-purple-200',
};

export function RevcoRotatingPlayoff({
  rounds,
  pairsText,
  freeAgentsText,
  scoreSettings,
  overrides = {},
  excluded = [],
  playoff,
  setPlayoff,
  isAdmin,
}: {
  rounds: RevcoBDRound[];
  pairsText: string;
  freeAgentsText: string;
  scoreSettings: ScoreSettings;
  overrides?: RevcoOverrides;
  excluded?: string[];
  playoff?: RevcoRotPlayoff;
  setPlayoff: (f: (prev: RevcoRotPlayoff | undefined) => RevcoRotPlayoff | undefined) => void;
  isAdmin?: boolean;
}) {
  const [confirm, setConfirm] = useState<'restart' | 'undo' | null>(null);

  // Starting players: everyone in pool-play standings except those not playing,
  // with their pool record (for ranking) and gender from the sign-up list.
  const startingPlayers = useMemo<RevcoRotPlayer[]>(() => {
    const genderOf = new Map<string, 'M' | 'F' | null>();
    for (const pair of parseMickeyPairsGendered(pairsText)) for (const p of pair) genderOf.set(slug(p.name), p.gender);
    for (const p of parseMickeyFreeGendered(freeAgentsText)) genderOf.set(slug(p.name), p.gender);
    const out = new Set(excluded.map(slug));
    return computeRevcoStandings(rounds, pairsText, freeAgentsText, scoreSettings, overrides)
      .flatMap(u => u.players.map(name => ({ name, gender: genderOf.get(slug(name)) ?? null, poolW: u.W, poolPD: u.PD })))
      .filter(p => !out.has(slug(p.name)));
  }, [rounds, pairsText, freeAgentsText, scoreSettings, overrides, excluded]);

  const records = useMemo(() => (playoff ? playerRecords(playoff) : null), [playoff]);
  const champs = playoff ? champions(playoff) : null;
  const last = playoff?.rounds[playoff.rounds.length - 1];
  const canGenerate = !!playoff && !!last && roundComplete(last) && !champs;

  const start = () => { setPlayoff(() => startPlayoff(startingPlayers)); setConfirm(null); };
  const generate = () => setPlayoff(prev => {
    if (!prev) return prev;
    const r = nextRound(prev);
    return r ? { ...prev, rounds: [...prev.rounds, r] } : prev;
  });
  const undo = () => { setPlayoff(prev => prev && ({ ...prev, rounds: prev.rounds.slice(0, -1) })); setConfirm(null); };
  const setScore = (matchId: string, score: string) => setPlayoff(prev => prev && ({
    ...prev,
    rounds: prev.rounds.map(r => ({ ...r, matches: r.matches.map(m => (m.id === matchId ? { ...m, score } : m)) })),
  }));

  const byLosses = (n: number) =>
    (playoff?.players ?? []).filter(p => (n === 2 ? (records?.get(p.name)?.L ?? 0) >= 2 : records?.get(p.name)?.L === n));

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-5 space-y-4">
      <div>
        <h2 className="text-[20px] font-bold text-sky-900 tracking-tight">Rotating Teams Playoff</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Double elimination by player, with new teams every round. Undefeated players play each other and
          one-loss players play each other; guys and girls are ranked separately (pool play + playoffs) and grouped
          top 2 guys + top 2 girls, next 2 + 2, and so on — skipping anyone you've already been teamed with.
          A 2nd loss and you're out. When 8 or fewer are left, they play one final; the winning team are champions.
        </p>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          {!playoff ? (
            <button
              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-[13px] disabled:opacity-40"
              disabled={startingPlayers.length < 8}
              onClick={start}
            >
              Start Playoff ({startingPlayers.length} players)
            </button>
          ) : (
            <>
              <button
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[13px] disabled:opacity-40"
                disabled={!canGenerate}
                onClick={generate}
                title={!canGenerate && !champs ? 'Enter every score in the current round first' : ''}
              >
                Generate Round {playoff.rounds.length + 1}
              </button>
              <button className="px-2.5 py-1.5 rounded-lg border text-slate-700 hover:bg-slate-50 text-[12px] disabled:opacity-40"
                disabled={playoff.rounds.length === 0} onClick={() => setConfirm('undo')}>
                Undo Last Round
              </button>
              <button className="px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-[12px]" onClick={() => setConfirm('restart')}>
                Restart Playoff
              </button>
            </>
          )}
          {!playoff && startingPlayers.length < 8 && (
            <span className="text-[11px] text-slate-500">Needs at least 8 players.</span>
          )}
        </div>
      )}

      {confirm && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-[12px]">
          <span className="text-amber-800">
            {confirm === 'restart'
              ? 'Restart the playoff? All playoff rounds and scores are cleared and Round 1 is re-drawn from current standings.'
              : `Remove Round ${playoff?.rounds.length}? Its teams and scores are cleared.`}
          </span>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded bg-amber-600 text-white text-[11px]" onClick={confirm === 'restart' ? start : undo}>
              {confirm === 'restart' ? 'Restart' : 'Remove'}
            </button>
            <button className="px-2 py-1 rounded border text-[11px]" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {champs && (
        <div className="rounded-xl bg-purple-50 ring-1 ring-purple-200 p-4 text-center">
          <div className="text-[12px] uppercase tracking-wide text-purple-700 font-semibold">Champions</div>
          <div className="text-[18px] font-bold text-purple-900 mt-1">{champs.join(' · ')}</div>
        </div>
      )}

      {playoff && (
        <div className="grid sm:grid-cols-3 gap-3 text-[12px]">
          {[
            { title: 'Undefeated', list: byLosses(0), style: 'text-emerald-700' },
            { title: 'One loss', list: byLosses(1), style: 'text-amber-700' },
            { title: 'Out', list: byLosses(2), style: 'text-slate-400' },
          ].map(col => (
            <div key={col.title} className="border border-slate-200 rounded-lg p-2">
              <div className={`font-semibold mb-1 ${col.style}`}>{col.title} ({col.list.length})</div>
              <div className="text-slate-600 leading-relaxed">
                {col.list.map(p => {
                  const r = records?.get(p.name);
                  return <div key={p.name}>{p.name} <span className="text-slate-400 tabular-nums">{r?.W ?? 0}-{r?.L ?? 0}</span></div>;
                })}
                {col.list.length === 0 && <span className="text-slate-300">—</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {playoff?.rounds.slice().reverse().map(round => {
        const isLatest = round.id === last?.id;
        return (
          <div key={round.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h3 className="text-[14px] font-semibold text-sky-800">
                {round.matches.some(m => m.group === 'F') ? 'Final' : `Round ${round.number}`}
              </h3>
              {round.sitting.length > 0 && (
                <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                  <span className="font-semibold">Sitting this round:</span> {round.sitting.join(', ')}
                </div>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              {round.matches.map((m, i) => {
                const w = matchWinner(m);
                return (
                  <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-2 text-[12px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Match {i + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${GROUP_STYLE[m.group]}`}>{GROUP_LABEL[m.group]}</span>
                    </div>
                    <div className={'rounded px-1.5 py-1 ' + (w === 'A' ? 'bg-emerald-50 font-semibold' : '')}>A: {m.teamA.join(', ')}</div>
                    <div className={'rounded px-1.5 py-1 ' + (w === 'B' ? 'bg-emerald-50 font-semibold' : '')}>B: {m.teamB.join(', ')}</div>
                    <input
                      className="w-24 border border-slate-300 rounded px-1.5 py-1 text-[12px]"
                      placeholder="A-B score"
                      value={m.score ?? ''}
                      onChange={e => setScore(m.id, e.target.value)}
                      readOnly={!isAdmin || !isLatest}
                      title={isAdmin && !isLatest ? 'Undo later rounds to change this score' : ''}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

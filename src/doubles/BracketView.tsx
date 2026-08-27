import React, { useMemo } from 'react';
import type { BracketMatch, PlayDiv } from '../types';
import { buildVisualColumns } from '../components/BracketView';
import { mickeyGamesWinner } from '../utils';

const ROW_H = 88;

function TeamLine({ t, active, label, sourceId, byId }: {
  t?: BracketMatch['team1'];
  active?: boolean;
  label: 'A' | 'B';
  sourceId?: string;
  byId: Map<string, BracketMatch>;
}) {
  const waiting = () => {
    if (!sourceId) return 'Waiting on previous match';
    const src = byId.get(sourceId);
    return src ? `Winner of R${src.round}, G${src.slot}` : 'Waiting on previous match';
  };
  return (
    <div className={'min-h-[30px] flex items-center gap-2 border-b border-slate-300 px-2 py-1 ' + (active ? 'bg-emerald-50' : 'bg-white')}>
      <span className="text-[9px] text-slate-400 w-3 shrink-0">{label}</span>
      {t ? (
        <>
          <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 text-[9px] rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 shrink-0">
            #{t.seed}
          </span>
          <span className="text-[12px] leading-tight whitespace-normal break-words" title={t.name}>{t.name}</span>
        </>
      ) : (
        <span className="text-[11px] italic text-slate-400 leading-tight">{waiting()}</span>
      )}
    </div>
  );
}

function DoublesBracketCard({
  m,
  byId,
  isAdmin,
  setGame,
  setScore,
}: {
  m: BracketMatch;
  byId: Map<string, BracketMatch>;
  isAdmin?: boolean;
  setGame: (id: string, idx: number, value: string) => void;
  setScore: (id: string, value: string) => void;
}) {
  const bestOf3 = m.gameFormat === 'bestOf3';
  const winnerSide = bestOf3 ? mickeyGamesWinner(m.games) : mickeyGamesWinner(undefined, m.score);
  const canScore = !!(m.team1 && m.team2) && m.score !== 'BYE';
  const games = m.games ?? [];

  return (
    <div className="relative min-w-[240px]">
      <div className="text-[10px] text-slate-500 mb-1 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-slate-700">{m.division}</span>
          <span>· R{m.round} · G{m.slot}</span>
          {bestOf3 && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-700 ring-1 ring-purple-200">Best of 3</span>}
        </span>
        {m.court !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200 text-[9px]">Court {m.court}</span>
        )}
      </div>

      <div className="border border-slate-300 rounded-sm bg-white overflow-hidden">
        <TeamLine t={m.team1} active={winnerSide === 'team1'} label="A" sourceId={m.team1SourceId} byId={byId} />
        <TeamLine t={m.team2} active={winnerSide === 'team2'} label="B" sourceId={m.team2SourceId} byId={byId} />
      </div>

      {m.score === 'BYE' ? (
        <div className="mt-1 px-1">
          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px]">BYE — auto-advanced</span>
        </div>
      ) : canScore ? (
        <div className="mt-1 px-1">
          {bestOf3 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {Array.from({ length: 3 }, (_, i) => (
                <input
                  key={i}
                  className="w-16 border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                  value={games[i] ?? ''}
                  onChange={e => setGame(m.id, i, e.target.value)}
                  placeholder={`Game ${i + 1}`}
                  readOnly={!isAdmin}
                />
              ))}
            </div>
          ) : (
            <input
              className="w-24 border border-slate-300 rounded px-1.5 py-1 text-[11px]"
              value={m.score ?? ''}
              onChange={e => setScore(m.id, e.target.value)}
              placeholder="score"
              readOnly={!isAdmin}
            />
          )}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-5 h-8">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-px bg-slate-300" />
      </div>
    </div>
  );
}

export function DoublesBracketView({
  brackets,
  setBrackets,
  isAdmin,
}: {
  brackets: BracketMatch[];
  setBrackets: (f: ((prev: BracketMatch[]) => BracketMatch[]) | BracketMatch[]) => void;
  isAdmin?: boolean;
}) {
  const divisions: PlayDiv[] = ['UPPER', 'LOWER', 'RR'];

  const byId = useMemo(() => new Map(brackets.map(m => [m.id, m] as const)), [brackets]);

  const updateMatch = (id: string, mutate: (m: BracketMatch) => void) =>
    setBrackets(prev => {
      const copy = prev.map(x => ({ ...x, games: x.games ? [...x.games] : x.games }));
      const map = new Map(copy.map(m => [m.id, m] as const));
      const m = map.get(id);
      if (!m) return copy;
      mutate(m);
      const w = m.gameFormat === 'bestOf3' ? mickeyGamesWinner(m.games) : mickeyGamesWinner(undefined, m.score);
      if (w) {
        const winner = w === 'team1' ? m.team1 : m.team2;
        const loser = w === 'team1' ? m.team2 : m.team1;
        if (winner && m.nextId && m.nextSide) {
          const p = map.get(m.nextId);
          if (p) { if (m.nextSide === 'team1') p.team1 = winner; else p.team2 = winner; }
        }
        if (loser && m.loserNextId && m.loserNextSide) {
          const q = map.get(m.loserNextId);
          if (q) { if (m.loserNextSide === 'team1') q.team1 = loser; else q.team2 = loser; }
        }
      }
      return copy;
    });

  const setGame = (id: string, idx: number, value: string) =>
    updateMatch(id, m => {
      const g = m.games ? [...m.games] : [];
      g[idx] = value;
      m.games = g;
    });

  const setScore = (id: string, value: string) =>
    updateMatch(id, m => { m.score = value; });

  // Applies to every match in that round (for that division) at once —
  // set in advance of the round starting.
  const setRoundFormat = (division: PlayDiv, round: number, fmt: 'single' | 'bestOf3') =>
    setBrackets(prev => prev.map(m =>
      (m.division === division && m.round === round) ? { ...m, gameFormat: fmt } : m));

  const anyCols = divisions.some(d => buildVisualColumns(brackets, d).cols.length > 0);
  if (!anyCols) return null;

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6">
      <h2 className="text-[20px] font-bold text-sky-900 mb-2 tracking-tight">Playoff Bracket</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        Pick one game or best-of-3 match play for each round before it starts. Winners auto-advance.
      </p>

      {divisions.map(div => {
        const cfg = buildVisualColumns(brackets, div);
        const cols = cfg.cols;
        if (!cols.length) return null;

        return (
          <div key={div} className="mb-8">
            <h3 className="font-semibold text-slate-700 mb-2 text-[14px]">
              {div === 'RR' ? 'Redemption Rally' : div}
            </h3>
            <div className="overflow-x-auto">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(240px, 1fr))` }}>
                {cols.map((col, colIdx) => {
                  const roundNum = col[0]?.round ?? colIdx + 1;
                  const roundFormat = col[0]?.gameFormat ?? 'single';
                  return (
                    <div key={colIdx} className="relative" style={{ minHeight: `${Math.max(cols[0]?.length || 1, 1) * ROW_H * 2}px` }}>
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-600">Round {roundNum}:</span>
                        <select
                          className="border border-slate-300 rounded px-1.5 py-0.5 text-[11px] bg-white"
                          value={roundFormat}
                          onChange={e => setRoundFormat(div, roundNum, e.target.value as 'single' | 'bestOf3')}
                          disabled={!isAdmin}
                        >
                          <option value="single">One Game</option>
                          <option value="bestOf3">Match Play (Best of 3)</option>
                        </select>
                      </div>
                      {col.map((m, i) => {
                        let top = i * ROW_H * 2;
                        if (colIdx > 0) {
                          const prevCol = cols[colIdx - 1] || [];
                          const srcIdxs = [
                            prevCol.findIndex(p => p.id === m.team1SourceId),
                            prevCol.findIndex(p => p.id === m.team2SourceId),
                          ].filter(idx => idx >= 0);
                          if (srcIdxs.length === 2) {
                            top = ((Math.min(...srcIdxs) + Math.max(...srcIdxs)) / 2) * ROW_H * 2;
                          } else if (srcIdxs.length === 1) {
                            top = srcIdxs[0] * ROW_H * 2;
                          }
                        }
                        return (
                          <div key={m.id} className="absolute left-0" style={{ top: top + 28 }}>
                            <DoublesBracketCard m={m} byId={byId} isAdmin={isAdmin} setGame={setGame} setScore={setScore} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

import React, { useMemo } from 'react';
import type { BracketMatch, Team, PlayDiv } from '../types';
import { buildVisualColumns } from '../components/BracketView';
import { mickeyGamesWinner } from '../utils';

const ROW_H = 88;

function TeamLine({ t, active, label, sourceId, byId, swapOptions, onSwap }: {
  t?: Team;
  active?: boolean;
  label: 'A' | 'B';
  sourceId?: string;
  byId: Map<string, BracketMatch>;
  // When provided, the team slot becomes a dropdown of teams in other
  // unplayed Round-1 matches; selecting one swaps the two.
  swapOptions?: Team[];
  onSwap?: (newTeamId: string) => void;
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
          {swapOptions && onSwap ? (
            <select
              className="text-[12px] leading-tight w-full bg-transparent border-0 px-0 py-0 cursor-pointer hover:underline"
              value={t.id}
              onChange={e => onSwap(e.target.value)}
              title="Swap this team with another unplayed R1 team"
            >
              {swapOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  #{opt.seed} {opt.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[12px] leading-tight whitespace-normal break-words" title={t.name}>{t.name}</span>
          )}
        </>
      ) : (
        <span className="text-[11px] italic text-slate-400 leading-tight">{waiting()}</span>
      )}
    </div>
  );
}

function MickeyBracketCard({
  m,
  byId,
  matchPlay,
  isAdmin,
  setGame,
  setFormat,
  swapOptions,
  swapTeams,
}: {
  m: BracketMatch;
  byId: Map<string, BracketMatch>;
  matchPlay: boolean;
  isAdmin?: boolean;
  setGame: (id: string, idx: number, value: string) => void;
  setFormat: (id: string, fmt: '' | 'MICKEY' | 'MINNIE') => void;
  swapOptions?: Team[]; // populated when this R1 match is swap-eligible
  swapTeams?: (currentId: string, newId: string) => void;
}) {
  const winnerSide = mickeyGamesWinner(m.games, m.score);
  const canScore = !!(m.team1 && m.team2) && m.score !== 'BYE';
  const slots = matchPlay ? 3 : 1;
  const placeholders = matchPlay ? ['21-?', '21-?', '15-?'] : ['to 25'];
  const games = m.games ?? [];

  return (
    <div className="relative min-w-[240px]">
      <div className="text-[10px] text-slate-500 mb-1 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-slate-700">{m.division}</span>
          <span>· R{m.round} · G{m.slot}</span>
          {m.redemption && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">RR</span>}
          {matchPlay && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-700 ring-1 ring-purple-200">Best of 3</span>}
        </span>
        {m.court !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200 text-[9px]">Court {m.court}</span>
        )}
      </div>

      <div className="border border-slate-300 rounded-sm bg-white overflow-hidden">
        <TeamLine
          t={m.team1}
          active={winnerSide === 'team1'}
          label="A"
          sourceId={m.team1SourceId}
          byId={byId}
          swapOptions={isAdmin && swapOptions && swapTeams ? swapOptions : undefined}
          onSwap={isAdmin && swapTeams && m.team1 ? (newId => swapTeams(m.team1!.id, newId)) : undefined}
        />
        <TeamLine
          t={m.team2}
          active={winnerSide === 'team2'}
          label="B"
          sourceId={m.team2SourceId}
          byId={byId}
          swapOptions={isAdmin && swapOptions && swapTeams ? swapOptions : undefined}
          onSwap={isAdmin && swapTeams && m.team2 ? (newId => swapTeams(m.team2!.id, newId)) : undefined}
        />
      </div>

      {m.score === 'BYE' ? (
        <div className="mt-1 px-1">
          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px]">BYE — auto-advanced</span>
        </div>
      ) : canScore ? (
        <div className="mt-1 px-1 space-y-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-slate-400">Format:</span>
            <select
              className="border border-slate-300 rounded px-1 py-0.5 text-[11px]"
              value={m.format ?? ''}
              onChange={e => setFormat(m.id, e.target.value as '' | 'MICKEY' | 'MINNIE')}
              disabled={!isAdmin}
            >
              <option value="">— pick —</option>
              <option value="MICKEY">Mickey (coed)</option>
              <option value="MINNIE">Minnie (revco)</option>
            </select>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: slots }, (_, i) => (
              <input
                key={i}
                className="w-16 border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                value={games[i] ?? ''}
                onChange={e => setGame(m.id, i, e.target.value)}
                placeholder={placeholders[i] ?? placeholders[placeholders.length - 1]}
                readOnly={!isAdmin}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-5 h-8">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-px bg-slate-300" />
      </div>
    </div>
  );
}

export function MickeyBracketView({
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
      const w = mickeyGamesWinner(m.games, m.score);
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

  const setFormat = (id: string, fmt: '' | 'MICKEY' | 'MINNIE') =>
    updateMatch(id, m => { m.format = fmt === '' ? undefined : fmt; });

  // A R1 match is swap-eligible if it hasn't started yet (no score, no
  // game entries, no BYE). Swap teams between two such matches in place
  // without touching downstream rounds or any scores.
  function isSwappable(m: BracketMatch): boolean {
    if (m.round !== 1) return false;
    if (m.score && m.score.length > 0) return false;
    if (m.games && m.games.some(g => g && g.trim().length > 0)) return false;
    return true;
  }

  const swapTeams = (currentId: string, newId: string) => {
    if (currentId === newId) return;
    setBrackets(prev => {
      const copy = prev.map(x => ({ ...x }));
      let curMatch: BracketMatch | undefined;
      let curSide: 'team1' | 'team2' | undefined;
      let newMatch: BracketMatch | undefined;
      let newSide: 'team1' | 'team2' | undefined;
      for (const m of copy) {
        if (!isSwappable(m)) continue;
        if (m.team1?.id === currentId) { curMatch = m; curSide = 'team1'; }
        if (m.team2?.id === currentId) { curMatch = m; curSide = 'team2'; }
        if (m.team1?.id === newId) { newMatch = m; newSide = 'team1'; }
        if (m.team2?.id === newId) { newMatch = m; newSide = 'team2'; }
      }
      if (curMatch && curSide && newMatch && newSide) {
        const a = curMatch[curSide];
        const b = newMatch[newSide];
        curMatch[curSide] = b;
        newMatch[newSide] = a;
      }
      return copy;
    });
  };

  const anyCols = divisions.some(d => buildVisualColumns(brackets, d).cols.length > 0);
  if (!anyCols) return null;

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6">
      <h2 className="text-[20px] font-bold text-sky-900 mb-2 tracking-tight">Playoff Brackets</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        Seeded by pool-play record. Rounds 1 &amp; 2 are a single game to 25; semifinal &amp; final are best of 3
        (21/21/15) — the winner is whoever takes most of the games you fill in. Winners auto-advance.
      </p>

      {divisions.map(div => {
        const cfg = buildVisualColumns(brackets, div);
        const cols = cfg.cols;
        if (!cols.length) return null;
        const rounds = cfg.rounds;

        // Teams currently sitting in swap-eligible R1 slots of this division.
        const swapPool: Team[] = [];
        for (const m of brackets) {
          if (m.division !== div) continue;
          if (!isSwappable(m)) continue;
          if (m.team1) swapPool.push(m.team1);
          if (m.team2) swapPool.push(m.team2);
        }

        return (
          <div key={div} className="mb-8">
            <h3 className="font-semibold text-slate-700 mb-2 text-[14px]">
              {div === 'RR' ? 'Redemption Rally' : div}
            </h3>
            {isAdmin && swapPool.length >= 2 && (
              <p className="text-[11px] text-slate-500 mb-2">
                Tip: click a team in any unplayed Round 1 match to pick a different unplayed team — they'll swap in place.
              </p>
            )}
            <div className="overflow-x-auto">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(240px, 1fr))` }}>
                {cols.map((col, colIdx) => (
                  <div key={colIdx} className="relative" style={{ minHeight: `${Math.max(cols[0]?.length || 1, 1) * ROW_H * 2}px` }}>
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
                      // Match play = semifinal + final of a non-RR bracket.
                      const matchPlay = div !== 'RR' && m.round >= rounds - 1;
                      const canSwap = isSwappable(m) && swapPool.length >= 2;
                      return (
                        <div key={m.id} className="absolute left-0" style={{ top }}>
                          <MickeyBracketCard
                            m={m}
                            byId={byId}
                            matchPlay={matchPlay}
                            isAdmin={isAdmin}
                            setGame={setGame}
                            setFormat={setFormat}
                            swapOptions={canSwap ? swapPool : undefined}
                            swapTeams={canSwap ? swapTeams : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

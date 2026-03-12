import React, { useMemo } from 'react';
import type { BracketMatch, Team, PlayDiv } from '../types';
import { courtFor, nextPow2, parseScore } from '../utils';

export function buildBracket(division: PlayDiv, teams: Team[]): BracketMatch[] {
  const N = teams.length; if (N === 0) return [];
  const size = nextPow2(N);
  function espnOrder(n: number): number[] {
    if (n === 1) return [1];
    if (n === 2) return [1, 2];
    const prev = espnOrder(n / 2);
    const out: number[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const a = prev[i];
      const b = prev[i + 1] ?? (n / 2);
      out.push(a, n + 1 - a, b, n + 1 - b);
    }
    return out;
  }
  const order = espnOrder(size);
  const idxBySeed = new Map<number, number>();
  order.forEach((seed, idx) => idxBySeed.set(seed, idx));

  const slots: (Team | undefined)[] = new Array(size).fill(undefined);
  const orderedTeams = teams.slice().sort((a, b) => a.seed - b.seed);
  for (const t of orderedTeams) {
    const i = idxBySeed.get(t.seed);
    if (i !== undefined) slots[i] = t;
  }

  const gapByes = Math.max(0, size - N);
  const byeSeeds = new Set<number>();
  for (let s = 1; s <= gapByes; s++) byeSeeds.add(s);

  const matches: BracketMatch[] = [];
  let round = 1;
  let current: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const m: BracketMatch = {
      id: `${division}-R${round}-${(i / 2) + 1}`,
      division,
      round,
      slot: (i / 2) + 1,
      team1: slots[i],
      team2: slots[i + 1],
      court: courtFor(division, round, (i / 2) + 1),
    };
    current.push(m);
  }
  matches.push(...current);

  while (current.length > 1) {
    const nextRound: BracketMatch[] = [];
    round++;
    for (let i = 0; i < current.length; i += 2) {
      const parent: BracketMatch = {
        id: `${division}-R${round}-${(i / 2) + 1}`,
        division,
        round,
        slot: (i / 2) + 1,
        court: courtFor(division, round, (i / 2) + 1),
      };
      const a = current[i], b = current[i + 1];
      if (a) { a.nextId = parent.id; a.nextSide = 'team1'; parent.team1SourceId = a.id; }
      if (b) { b.nextId = parent.id; b.nextSide = 'team2'; parent.team2SourceId = b.id; }
      nextRound.push(parent);
    }
    matches.push(...nextRound);
    current = nextRound;
  }

  const byId = new Map(matches.map(m => [m.id, m] as const));
  const advanceWinner = (m: BracketMatch, team: Team | undefined) => {
    if (!team || !m.nextId || !m.nextSide) return;
    const parent = byId.get(m.nextId); if (!parent) return;
    if (m.nextSide === 'team1') parent.team1 = team; else parent.team2 = team;
  };

  for (const m of matches.filter(x => x.round === 1)) {
    const t1 = m.team1, t2 = m.team2;
    if (t1 && !t2 && byeSeeds.has(t1.seed)) advanceWinner(m, t1);
    if (t2 && !t1 && byeSeeds.has(t2.seed)) advanceWinner(m, t2);
  }

  for (const m of matches.filter(x => x.round === 1)) {
    const onlyOne = (!!m.team1 && !m.team2) || (!m.team1 && !!m.team2);
    if (onlyOne) {
      m.score = 'BYE';
    }
  }

  return matches;
}

export function buildVisualColumns(brackets: BracketMatch[], division: PlayDiv) {
  const list = brackets.filter(b => b.division === division);
  if (list.length === 0) return { cols: [] as BracketMatch[][], rounds: 0, size: 0 };

  const maxRound = Math.max(1, ...list.map(b => b.round));
  const cols: BracketMatch[][] = [];

  for (let r = 1; r <= maxRound; r++) {
    let col = list.filter(b => b.round === r).sort((a, b) => a.slot - b.slot);

    if (r === 1) {
      col = col.filter(m => {
        const onlyOneTeam = (!!m.team1 && !m.team2) || (!m.team1 && !!m.team2);
        const isBye = m.score === 'BYE';
        return !(onlyOneTeam && isBye);
      });
    }

    cols.push(col);
  }

  return { cols, rounds: maxRound, size: (cols[0]?.length || 1) * 2 };
}

export function seedBadge(seed?: number) {
  if (!seed && seed !== 0) return null;
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 mr-1">
      #{seed}
    </span>
  );
}

function BracketCard({
  m,
  byId,
}: {
  m: BracketMatch;
  byId: Map<string, BracketMatch>;
}) {
  const parsed = (() => {
    if (!m.score) return null;
    const t = String(m.score).trim();
    const sep = t.includes('–') ? '–' : '-';
    const p = t.split(sep).map(s => s.trim());
    if (p.length !== 2) return null;
    const a = +p[0], b = +p[1];
    return (isFinite(a) && isFinite(b)) ? [a, b] as [number, number] : null;
  })();

  const winnerSide: 'team1' | 'team2' | null =
    parsed ? (parsed[0] > parsed[1] ? 'team1' : (parsed[0] < parsed[1] ? 'team2' : null)) : null;

  function winnerLabel(sourceId?: string) {
    if (!sourceId) return "Waiting on previous match";
    const src = byId.get(sourceId);
    if (!src) return "Waiting on previous match";
    return `Winner of Round ${src.round}, Game ${src.slot}`;
  }

  const TeamLine = ({
    t,
    active,
    label,
    sourceId,
  }: {
    t?: Team;
    active?: boolean;
    label: 'A' | 'B';
    sourceId?: string;
  }) => (
    <div
      className={
        "min-h-[34px] flex items-center gap-2 border-b border-slate-300 px-2 py-1 " +
        (active ? "bg-emerald-50" : "bg-white")
      }
    >
      <span className="text-[9px] text-slate-400 w-3 shrink-0">{label}</span>

      {t ? (
        <>
          <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 text-[9px] rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 shrink-0">
            #{t.seed}
          </span>
          <span className="text-[12px] leading-tight whitespace-normal break-words" title={t.name}>
            {t.name}
          </span>
        </>
      ) : (
        <span className="text-[11px] italic text-slate-400 leading-tight">
          {winnerLabel(sourceId)}
        </span>
      )}
    </div>
  );

  return (
    <div className="relative min-w-[240px] bg-transparent">
      <div className="text-[10px] text-slate-500 mb-1 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-slate-700">{m.division}</span>
          <span>· R{m.round} · G{m.slot}</span>
          {m.redemption && (
            <span className="ml-1 inline-block text-[9px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
              RR
            </span>
          )}
        </span>

        {m.court !== undefined && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200 text-[9px]">
            Court {m.court}
          </span>
        )}
      </div>

      <div className="border border-slate-300 rounded-sm bg-white overflow-hidden">
        <TeamLine
          t={m.team1}
          active={winnerSide === 'team1'}
          label="A"
          sourceId={m.team1SourceId}
        />
        <TeamLine
          t={m.team2}
          active={winnerSide === 'team2'}
          label="B"
          sourceId={m.team2SourceId}
        />
      </div>

      {m.score === 'BYE' ? (
        <div className="mt-1 px-1">
          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px]">
            BYE — auto-advanced
          </span>
        </div>
      ) : m.score !== undefined ? (
        <div className="mt-1 px-1 text-[10px] text-slate-600">
          <span className="text-slate-500">Score:</span> {m.score}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-5 h-8">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-px bg-slate-300" />
      </div>
    </div>
  );
}

export function BracketView({
  brackets,
  setBrackets,
}: {
  brackets: BracketMatch[];
  setBrackets: (f: (prev: BracketMatch[]) => BracketMatch[] | BracketMatch[]) => void;
}) {
  const divisions: PlayDiv[] = ['UPPER', 'LOWER', 'RR'];

  function parseScoreLoose(s?: string): [number, number] | null {
    if (!s) return null;
    const txt = String(s).trim();
    const sep = txt.includes('–') ? '–' : '-';
    const parts = txt.split(sep).map(p => p.trim());
    if (parts.length !== 2) return null;
    const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10);
    return (isFinite(a) && isFinite(b)) ? [a, b] : null;
  }

  const onScore = (id: string, score: string) => setBrackets(prev => {
    const copy = prev.map(x => ({ ...x }));
    const map = new Map(copy.map(m => [m.id, m] as const));
    const m = map.get(id); if (!m) return copy;
    m.score = score;
    const parsed = parseScoreLoose(score);
    if (parsed) {
      const [a, b] = parsed;
      const winner = a > b ? m.team1 : (a < b ? m.team2 : undefined);
      const loser = a > b ? m.team2 : (a < b ? m.team1 : undefined);
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

  const byId = useMemo(
    () => new Map(brackets.map(m => [m.id, m] as const)),
    [brackets]
  );

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6">
      <h2 className="text-[20px] font-bold text-sky-900 mb-2 tracking-tight">Playoff Brackets</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        ESPN-style seeding and BYEs. Quarterfinals → Semifinals → Final. Winners auto-advance. Redemption Rally is built from completed Round 1 / Round 2 losers in the current playoff mode.
      </p>
      {divisions.map(div => {
        const cfg = buildVisualColumns(brackets, div);
        const cols = cfg.cols;
        if (!cols.length) return null;
        return (
          <div key={div} className="mb-8">
            <h3 className="font-semibold text-slate-700 mb-2 text-[14px]">{div}</h3>
            <div className="overflow-x-auto">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(230px, 1fr))` }}
              >
                {cols.map((col, colIdx) => {
                  const rowHeight = 72;

                  return (
                    <div key={colIdx} className="relative" style={{ minHeight: `${Math.max(cols[0]?.length || 1, 1) * rowHeight * 2}px` }}>
                      {col.map((m, i) => {
                        let top = i * rowHeight * 2;

                        if (colIdx > 0) {
                          const prevCol = cols[colIdx - 1] || [];

                          const srcIdxs = [
                            prevCol.findIndex(prev => prev.id === m.team1SourceId),
                            prevCol.findIndex(prev => prev.id === m.team2SourceId),
                          ].filter(idx => idx >= 0);

                          if (srcIdxs.length === 2) {
                            const minIdx = Math.min(srcIdxs[0], srcIdxs[1]);
                            const maxIdx = Math.max(srcIdxs[0], srcIdxs[1]);
                            top = ((minIdx + maxIdx) / 2) * rowHeight * 2;
                          } else if (srcIdxs.length === 1) {
                            top = srcIdxs[0] * rowHeight * 2;
                          }
                        }

                        const canScore = !!(m.team1 && m.team2);

                        return (
                          <div
                            key={m.id}
                            className="absolute left-0"
                            style={{ top }}
                          >
                            <BracketCard m={m} byId={byId} />
                            {canScore && (
                              <div className="mt-1">
                                <input
                                  className="w-32 border rounded px-2 py-1 text-[12px]"
                                  value={m.score || ''}
                                  onChange={(e) => onScore(m.id, e.target.value)}
                                  placeholder="e.g., 25-22"
                                />
                              </div>
                            )}
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

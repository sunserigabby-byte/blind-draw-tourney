import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Sunny Sports Performance – Blind Draw Tourney (strong blue build)
 *
 * ✅ Guys/Girls text boxes with line numbers + duplicate highlighting + live counts
 * ✅ Strict no-repeat (partners/opponents) toggle inside Round Generator
 * ✅ Random round generation (1 guy + 1 girl / team) with imbalance handling:
 *    - Ultimate Revco = 2 guys (blue)
 *    - Power Puff = 2 girls (pink)
 * ✅ Matches view: collapsible by round, delete-with-confirm, score input, auto-winner tint
 * ✅ Live Leaderboard (Guys & Girls) with W/L/PD (pool rules: to 21+, win by 2, no cap)
 * ✅ Autosave (rosters, matches, brackets) to localStorage
 * ✅ Playoff Builder: split upper/lower, pair in buckets, seed by combined W+PD
 * ✅ Brackets: ESPN-style layout, BYEs in correct rounds, winners auto-advance
 * ✅ Redemption Rally (RR): R1/R2 losers from Upper+Lower; optional partner re-randomize
 * ✅ Stronger blue gradient background + polished cards
 *
 * Pool play:
 *   • One game to 21+
 *   • Win by 2
 *   • No cap
 *
 * Playoffs:
 *   • Standard rounds: to 25 (you decide win-by-2; app only needs winner)
 *   • Semis & Finals: match play (21, 21, 15) — enter final match result (e.g. 2-1)
 */

/* ========================= Types & helpers ========================= */

type MatchRow = {
  id: string;
  round: number;
  court: number;
  t1p1: string; t1p2: string;
  t2p1: string; t2p2: string;
  tag?: 'ULTIMATE_REVCO'|'POWER_PUFF'|null;
  scoreText?: string;
};

type PlayDiv = 'UPPER'|'LOWER'|'RR';

interface Team {
  id: string;
  name: string;
  members: [string, string];
  seed: number;
  division: PlayDiv;
}

interface BracketMatch {
  id: string;
  division: PlayDiv;
  round: number;
  slot: number;
  team1?: Team;
  team2?: Team;
  score?: string;
  nextId?: string;
  nextSide?: 'team1'|'team2';
  team1SourceId?: string;
  team2SourceId?: string;
  court?: number;
  loserNextId?: string;
  loserNextSide?: 'team1'|'team2';
  redemption?: boolean;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
const clampN = (n: number, min: number) =>
  isFinite(n) ? Math.max(min, Math.floor(n)) : min;

const shuffle = <T,>(arr: T[], seed?: number) => {
  const a = arr.slice();
  let r = seed ?? Math.floor(Math.random() * 1e9);
  const rand = () => (
    r = (r * 1664525 + 1013904223) % 4294967296,
    r / 4294967296
  );
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Court pools for playoffs
const UPPER_COURTS = [1, 2, 3, 4, 5];
const LOWER_COURTS = [6, 7, 8, 9, 10];
const courtFor = (division: PlayDiv, round: number, slot: number) => {
  const pool = division === 'UPPER' ? UPPER_COURTS : LOWER_COURTS; // RR uses LOWER by default
  return pool[(slot - 1) % pool.length];
};

// ===== Pool scoring helpers: one game to 21+, win by 2, no cap
function parseScore(text?: string): [number, number] | null {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(b)) return null;
  return [a, b];
}

function isValidPoolScore(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

/* ========================= Sunny Logo ========================= */

function SunnyLogo() {
  return (
    <div className="flex items-center gap-3 select-none">
      <svg
        width="36"
        height="36"
        viewBox="0 0 64 64"
        aria-hidden
        className="drop-shadow-sm"
      >
        <defs>
          <radialGradient id="sky" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#bae6fd" />
          </radialGradient>
          <radialGradient id="sunCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7cc" />
            <stop offset="100%" stopColor="#fde047" />
          </radialGradient>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(253,224,71,.45)" />
            <stop offset="100%" stopColor="rgba(253,224,71,0)" />
          </radialGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width="64"
          height="64"
          rx="14"
          fill="url(#sky)"
        />
        <circle cx="32" cy="32" r="16" fill="url(#glow)" />
        <circle
          cx="32"
          cy="32"
          r="12"
          fill="url(#sunCore)"
          stroke="#f59e0b"
          strokeWidth="1.25"
        />
        <g
          stroke="#fbbf24"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity=".95"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 12;
            const r1 = 18;
            const r2 = 24;
            const x1 = 32 + Math.cos(a) * r1;
            const y1 = 32 + Math.sin(a) * r1;
            const x2 = 32 + Math.cos(a) * r2;
            const y2 = 32 + Math.sin(a) * r2;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
              />
            );
          })}
        </g>
        <circle
          cx="32"
          cy="32"
          r="13.5"
          fill="none"
          stroke="#fde68a"
          strokeOpacity=".6"
          strokeWidth="1"
        />
      </svg>
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight text-sky-50 text-[15px] drop-shadow-sm">
          Sunny Sports Performance
        </div>
        <div className="text-[11px] text-slate-200">
          Blind Draw Tourney
        </div>
      </div>
    </div>
  );
}

/* ========================= LinedTextarea ========================= */

function LinedTextarea({
  label,
  value,
  onChange,
  placeholder,
  id,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  id: string;
}) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const scrollRef = useRef<number>(0);

  const lines = useMemo(
    () => (value ?? '').split(/\r?\n/),
    [value]
  );
  const trimmed = useMemo(
    () => lines.map((s) => s.trim()),
    [lines]
  );
  const normalized = useMemo(
    () => trimmed.map((s) => s.replace(/\s+/g, ' ').toLowerCase()),
    [trimmed]
  );
  const nonEmptyCount = useMemo(
    () => trimmed.filter(Boolean).length,
    [trimmed]
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of normalized) {
      if (!s) continue;
      m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }, [normalized]);

  const isDupLine = useMemo(
    () => normalized.map((s) => !!s && (counts.get(s) || 0) > 1),
    [normalized, counts]
  );
  const duplicateNames = useMemo(
    () => Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([n]) => n),
    [counts]
  );

  useEffect(() => {
    const ta = taRef.current;
    const gut = gutterRef.current;
    if (!ta || !gut) return;
    const sync = () => {
      gut.scrollTop = ta.scrollTop;
    };
    ta.addEventListener('scroll', sync, { passive: true });
    return () => ta.removeEventListener('scroll', sync as any);
  }, []);

  // Caret + scroll persistence to prevent jumpy typing
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (typeof scrollRef.current === 'number') {
      ta.scrollTop = scrollRef.current;
    }
    if (document.activeElement === ta) {
      try {
        ta.selectionStart = selRef.current.start;
        ta.selectionEnd = selRef.current.end;
      } catch {
        // ignore
      }
    }
  }, [value]);

  const hasDupes = duplicateNames.length > 0;

  return (
    <div className="block text-sm">
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-slate-100">
          {label} (one per line)
        </label>
        <span className="text-[11px] text-slate-200">
          People:{' '}
          <span className="font-semibold">
            {nonEmptyCount}
          </span>
        </span>
      </div>

      <div
        className={
          'relative border rounded-xl shadow-sm grid bg-slate-900/40 backdrop-blur ' +
          (hasDupes
            ? 'ring-1 ring-red-300 border-red-400'
            : 'border-slate-600/70')
        }
        style={{ gridTemplateColumns: 'auto 1fr' }}
      >
        {/* Line numbers */}
        <div
          ref={gutterRef}
          className="select-none text-right text-xs bg-slate-900/60 border-r border-slate-700 rounded-l-xl px-2 py-2 overflow-auto"
          style={{ maxHeight: '10rem' }}
          aria-hidden
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className={
                'leading-5 tabular-nums ' +
                (isDupLine[i]
                  ? 'bg-red-900/40 text-red-300 font-semibold'
                  : 'text-slate-500')
              }
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea with duplicate highlight overlay */}
        <div className="relative">
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none rounded-r-xl"
            aria-hidden
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className={
                  'h-5 ' +
                  (isDupLine[i]
                    ? 'bg-red-900/25'
                    : '')
                }
                style={{ lineHeight: '1.25rem' }}
              />
            ))}
          </div>
          <textarea
            id={id}
            ref={taRef}
            className="w-full h-40 px-2 py-2 rounded-r-xl focus:outline-none bg-transparent relative z-10 leading-5 text-slate-50 placeholder-slate-500"
            value={value}
            placeholder={placeholder || ''}
            onChange={(e) => {
              const ta = e.currentTarget;
              selRef.current = {
                start: ta.selectionStart ?? 0,
                end: ta.selectionEnd ?? 0,
              };
              scrollRef.current = ta.scrollTop;
              onChange(e);
            }}
            onSelect={(e) => {
              const ta = e.currentTarget as HTMLTextAreaElement;
              selRef.current = {
                start: ta.selectionStart ?? 0,
                end: ta.selectionEnd ?? 0,
              };
            }}
            onScroll={(e) => {
              scrollRef.current = (
                e.currentTarget as HTMLTextAreaElement
              ).scrollTop;
            }}
            style={{ resize: 'vertical', lineHeight: '1.25rem' }}
            aria-invalid={hasDupes}
            aria-errormessage={
              hasDupes ? `${id}-dups` : undefined
            }
          />
        </div>
      </div>

      {hasDupes && (
        <div
          id={`${id}-dups`}
          className="text-xs text-red-300 mt-1"
        >
          Duplicate names detected:{' '}
          <span className="font-medium">
            {duplicateNames.join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}

/* ========================= Matches View (pool) ========================= */

function MatchesView({
  matches,
  setMatches,
}: {
  matches: MatchRow[];
  setMatches: (
    f: (prev: MatchRow[]) => MatchRow[] | MatchRow[]
  ) => void;
}) {
  const rounds = useMemo(
    () => uniq(matches.map((m) => m.round)).sort((a, b) => a - b),
    [matches]
  );
  const [open, setOpen] = useState<Set<number>>(
    () =>
      new Set(
        rounds.length ? [rounds[rounds.length - 1]] : []
      )
  );
  const [confirmR, setConfirmR] = useState<number | null>(
    null
  );

  useEffect(() => {
    if (rounds.length) {
      setOpen(
        new Set([rounds[rounds.length - 1]])
      );
    }
  }, [matches.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (
    id: string,
    patch: Partial<MatchRow>
  ) =>
    setMatches((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      )
    );

  const requestDelete = (round: number) =>
    setConfirmR(round);

  const doDelete = (round: number) => {
    setMatches((prev) =>
      prev.filter((m) => m.round !== round)
    );
    setConfirmR(null);
  };

  return (
    <section className="bg-slate-900/50 backdrop-blur rounded-2xl shadow-lg ring-2 ring-sky-500/40 p-6 border border-sky-400/40">
      <h2 className="text-2xl font-bold text-sky-100 mb-1 tracking-tight">
        Matches & Results (Pool Play)
      </h2>
      <p className="text-[11px] text-slate-300 mb-3">
        One game to 21+, win by 2, no cap. Winners auto-tinted
        as you type valid scores.
      </p>
      <div className="w-20 h-1 bg-sky-400 mx-auto rounded-full mb-4" />

      {rounds.length === 0 && (
        <p className="text-sm text-slate-200/80 max-w-lg mx-auto">
          No matches yet. Use the Round Generator below to
          create pool rounds.
        </p>
      )}

      <div className="mt-2 space-y-3">
        {rounds.map((r) => (
          <div
            key={r}
            className="border border-slate-700/80 rounded-xl overflow-hidden shadow-sm bg-slate-900/60"
          >
            <div className="px-3 py-2 bg-slate-900/80 border-b border-slate-700 flex justify-between items-center">
              <button
                className="text-left font-medium text-slate-100"
                onClick={() => {
                  const n = new Set(open);
                  if (n.has(r)) n.delete(r);
                  else n.add(r);
                  setOpen(n);
                }}
              >
                Round {r}
                <span className="ml-2 text-xs text-slate-400">
                  {open.has(r)
                    ? 'Click to collapse'
                    : 'Click to expand'}
                </span>
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={() => requestDelete(r)}
                title="Delete this entire round"
              >
                Delete Round
              </button>
            </div>

            {confirmR === r && (
              <div className="px-3 py-2 bg-red-900/50 border-b border-red-700 flex items-center justify-between text-sm text-red-100">
                <span>
                  Delete Round {r}? This will remove all matches
                  and scores in this round.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                    onClick={() => doDelete(r)}
                  >
                    Confirm
                  </button>
                  <button
                    className="px-2 py-1 rounded border border-slate-500 text-slate-200"
                    onClick={() => setConfirmR(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open.has(r) && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-900/95 backdrop-blur">
                    <tr className="text-left text-slate-300">
                      <th className="py-1 px-2">Court</th>
                      <th className="py-1 px-2">Team 1</th>
                      <th className="py-1 px-2">Team 2</th>
                      <th className="py-1 px-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches
                      .filter((m) => m.round === r)
                      .sort(
                        (a, b) => a.court - b.court
                      )
                      .map((m, idx) => {
                        const parsed =
                          parseScore(m.scoreText);
                        const valid = parsed
                          ? isValidPoolScore(
                              parsed[0],
                              parsed[1]
                            )
                          : m.scoreText
                          ? false
                          : true;
                        const t1Win =
                          parsed && valid
                            ? parsed[0] > parsed[1]
                            : null;

                        return (
                          <tr
                            key={m.id}
                            className={
                              'border-t border-slate-800 ' +
                              (idx % 2
                                ? 'bg-slate-900/60 '
                                : 'bg-slate-900/40 ') +
                              (m.tag ===
                              'ULTIMATE_REVCO'
                                ? 'bg-blue-900/40 '
                                : m.tag ===
                                  'POWER_PUFF'
                                ? 'bg-pink-900/40 '
                                : '')
                            }
                          >
                            <td className="py-1 px-2 tabular-nums text-slate-200">
                              {m.court}
                            </td>

                            <td
                              className={
                                'py-1 px-2 ' +
                                (t1Win === true
                                  ? 'bg-emerald-900/40 text-emerald-200'
                                  : 'text-slate-100')
                              }
                            >
                              <div className="flex items-center gap-2">
                                {m.tag ===
                                  'ULTIMATE_REVCO' && (
                                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 ring-1 ring-blue-300/60">
                                    Ultimate Revco
                                  </span>
                                )}
                                {m.tag ===
                                  'POWER_PUFF' && (
                                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-500/30 text-pink-100 ring-1 ring-pink-300/60">
                                    Power Puff
                                  </span>
                                )}
                                <span>
                                  {m.t1p1} &amp; {m.t1p2}
                                </span>
                              </div>
                            </td>

                            <td
                              className={
                                'py-1 px-2 ' +
                                (t1Win === false
                                  ? 'bg-emerald-900/40 text-emerald-200'
                                  : 'text-slate-100')
                              }
                            >
                              {m.t2p1} &amp; {m.t2p2}
                            </td>

                            <td className="py-1 px-2">
                              <input
                                className={
                                  'w-40 border rounded px-2 py-1 bg-slate-950/70 text-slate-50 ' +
                                  (valid
                                    ? 'border-slate-600'
                                    : 'border-red-500 bg-red-950/70')
                                }
                                value={
                                  m.scoreText || ''
                                }
                                onChange={(e) =>
                                  update(
                                    m.id,
                                    {
                                      scoreText:
                                        e.target
                                          .value,
                                    }
                                  )
                                }
                                placeholder="e.g., 22-20"
                                title="Pool: enter a 21+ score, win by 2 (no cap)."
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ========================= Round Generator ========================= */

function RoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}: {
  guysText: string;
  girlsText: string;
  matches: MatchRow[];
  setMatches: (
    f: (prev: MatchRow[]) => MatchRow[] | MatchRow[]
  ) => void;
}) {
  const [strict, setStrict] = useState(true);
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);
  const [seedStr, setSeedStr] = useState('');

  const guys = useMemo(
    () =>
      uniq(
        (guysText || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [guysText]
  );
  const girls = useMemo(
    () =>
      uniq(
        (girlsText || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [girlsText]
  );

  const buildPartnerMap = (history: MatchRow[]) => {
    const mp = new Map<string, Set<string>>();
    for (const m of history) {
      const add = (a?: string, b?: string) => {
        if (!a || !b) return;
        const A = slug(a);
        const B = slug(b);
        if (!mp.has(A)) mp.set(A, new Set());
        if (!mp.has(B)) mp.set(B, new Set());
        mp.get(A)!.add(B);
        mp.get(B)!.add(A);
      };
      add(m.t1p1, m.t1p2);
      add(m.t2p1, m.t2p2);
    }
    return mp;
  };

  const buildOpponentMap = (history: MatchRow[]) => {
    const mp = new Map<string, Set<string>>();
    for (const m of history) {
      const t1 = [m.t1p1, m.t1p2];
      const t2 = [m.t2p1, m.t2p2];
      for (const a of t1)
        for (const b of t2) {
          if (!a || !b) continue;
          const A = slug(a);
          const B = slug(b);
          if (!mp.has(A)) mp.set(A, new Set());
          mp.get(A)!.add(B);
        }
      for (const a of t2)
        for (const b of t1) {
          if (!a || !b) continue;
          const A = slug(a);
          const B = slug(b);
          if (!mp.has(A)) mp.set(A, new Set());
          mp.get(A)!.add(B);
        }
    }
    return mp;
  };

  const canPair = (
    mp: Map<string, Set<string>>,
    a: string,
    b: string
  ) =>
    !strict ||
    !(mp.get(slug(a))?.has(slug(b)));

  const haventOpposed = (
    mp: Map<string, Set<string>>,
    a: string,
    b: string
  ) =>
    !strict ||
    !(mp.get(slug(a))?.has(slug(b)));

  function buildRound(
    roundIdx: number,
    history: MatchRow[]
  ): MatchRow[] {
    const seedNum = seedStr
      ? Number(seedStr)
      : undefined;

    const G = shuffle(guys, seedNum);
    const H = shuffle(
      girls,
      seedNum ? seedNum + 17 : undefined
    );

    const partnerMap = buildPartnerMap(history);
    const opponentMap = buildOpponentMap(history);

    const pairs: {
      team: [string, string];
      tag: MatchRow['tag'];
    }[] = [];

    const n = Math.min(G.length, H.length);

    // Pair 1 guy + 1 girl where possible
    for (let i = 0; i < n; i++) {
      const g = G[i];
      const h = H[i];
      if (canPair(partnerMap, g, h)) {
        pairs.push({
          team: [g, h],
          tag: null,
        });
        const a = slug(g);
        const b = slug(h);
        partnerMap
          .get(a)
          ?.add(b) ||
          partnerMap.set(a, new Set([b]));
        partnerMap
          .get(b)
          ?.add(a) ||
          partnerMap.set(b, new Set([a]));
      } else {
        // Try swap search
        let placed = false;
        for (let j = i + 1; j < n; j++) {
          if (
            canPair(partnerMap, g, H[j])
          ) {
            const tmp = H[i];
            H[i] = H[j];
            H[j] = tmp;
            pairs.push({
              team: [g, H[i]],
              tag: null,
            });
            placed = true;
            const a = slug(g);
            const b = slug(H[i]);
            partnerMap
              .get(a)
              ?.add(b) ||
              partnerMap.set(
                a,
                new Set([b])
              );
            partnerMap
              .get(b)
              ?.add(a) ||
              partnerMap.set(
                b,
                new Set([a])
              );
            break;
          }
        }
        if (!placed) {
          pairs.push({
            team: [g, h],
            tag: null,
          });
          const a = slug(g);
          const b = slug(h);
          partnerMap
            .get(a)
            ?.add(b) ||
            partnerMap.set(
              a,
              new Set([b])
            );
          partnerMap
            .get(b)
            ?.add(a) ||
            partnerMap.set(
              b,
              new Set([a])
            );
        }
      }
    }

    const extraGuys = G.slice(n);
    const extraGirls = H.slice(n);

    if (extraGuys.length >= 2) {
      pairs.push({
        team: [extraGuys[0], extraGuys[1]],
        tag: 'ULTIMATE_REVCO',
      });
    }
    if (extraGirls.length >= 2) {
      pairs.push({
        team: [extraGirls[0], extraGirls[1]],
        tag: 'POWER_PUFF',
      });
    }

    // Pair teams into matches (2 teams per court)
    const teamList = pairs.slice();
    const made: MatchRow[] = [];
    let court = startCourt;

    while (teamList.length >= 2) {
      const a = teamList.shift()!;
      let idx = 0;
      let found = false;
      for (let i = 0; i < teamList.length; i++) {
        const b = teamList[i];
        const ok =
          haventOpposed(
            opponentMap,
            a.team[0],
            b.team[0]
          ) &&
          haventOpposed(
            opponentMap,
            a.team[0],
            b.team[1]
          ) &&
          haventOpposed(
            opponentMap,
            a.team[1],
            b.team[0]
          ) &&
          haventOpposed(
            opponentMap,
            a.team[1],
            b.team[1]
          );
        if (ok) {
          idx = i;
          found = true;
          break;
        }
      }
      const b = teamList.splice(
        found ? idx : 0,
        1
      )[0];

      // update opponent map
      [a.team[0], a.team[1]].forEach(
        (A) =>
          [b.team[0], b.team[1]].forEach(
            (B) => {
              const SA = slug(A);
              const SB = slug(B);
              opponentMap
                .get(SA)
                ?.add(SB) ||
                opponentMap.set(
                  SA,
                  new Set([SB])
                );
            }
          )
      );
      [b.team[0], b.team[1]].forEach(
        (A) =>
          [a.team[0], a.team[1]].forEach(
            (B) => {
              const SA = slug(A);
              const SB = slug(B);
              opponentMap
                .get(SA)
                ?.add(SB) ||
                opponentMap.set(
                  SA,
                  new Set([SB])
                );
            }
          )
      );

      made.push({
        id: `${roundIdx}-${court}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        round: roundIdx,
        court: court++,
        t1p1: a.team[0],
        t1p2: a.team[1],
        t2p1: b.team[0],
        t2p2: b.team[1],
        tag: a.tag || b.tag || null,
        scoreText: '',
      });
    }

    return made;
  }

  function onGenerate() {
    const n = clampN(roundsToGen, 1);
    const out: MatchRow[] = [];
    let history = matches.slice();
    const currentMax =
      history.reduce(
        (mx, m) =>
          Math.max(mx, m.round),
        0
      ) || 0;

    for (let i = 1; i <= n; i++) {
      const roundIdx = currentMax + i;
      const one = buildRound(
        roundIdx,
        history
      );
      out.push(...one);
      history = history.concat(one);
    }

    setMatches((prev) =>
      (Array.isArray(prev) ? prev : []).concat(
        out
      )
    );
  }

  return (
    <section className="bg-slate-900/60 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-500/40 p-4 border border-slate-700">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold text-sky-100">
          Round Generator
        </h3>
        <div className="flex items-center gap-3 text-xs md:text-sm text-slate-100">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) =>
                setStrict(e.target.checked)
              }
            />
            Strict no-repeat
          </label>
          <label className="flex items-center gap-1">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={(e) =>
                setRoundsToGen(
                  clampN(
                    +e.target.value || 1,
                    1
                  )
                )
              }
              className="w-14 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
            />
          </label>
          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={(e) =>
                setStartCourt(
                  clampN(
                    +e.target.value || 1,
                    1
                  )
                )
              }
              className="w-14 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
            />
          </label>
          <label className="flex items-center gap-1">
            Seed
            <input
              type="text"
              value={seedStr}
              onChange={(e) =>
                setSeedStr(e.target.value)
              }
              placeholder="optional"
              className="w-20 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
            />
          </label>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 shadow-sm active:scale-[.99]"
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>
      <p className="text-[10px] md:text-xs text-slate-300 mt-2">
        Blue = Ultimate Revco (2 guys). Pink = Power Puff
        (2 girls). Strict mode avoids repeat partners and
        opponents across rounds. Each court gets exactly 2
        teams.
      </p>
    </section>
  );
}

/* ========================= Leaderboard ========================= */

function Leaderboard({
  matches,
  guysText,
  girlsText,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
}) {
  const guysList = useMemo(
    () =>
      Array.from(
        new Set(
          (guysText || '')
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
    [guysText]
  );
  const girlsList = useMemo(
    () =>
      Array.from(
        new Set(
          (girlsText || '')
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
    [girlsText]
  );
  const guysSet = useMemo(
    () => new Set(guysList.map(slug)),
    [guysList]
  );
  const girlsSet = useMemo(
    () => new Set(girlsList.map(slug)),
    [girlsList]
  );

  type Bucket = {
    name: string;
    W: number;
    L: number;
    PD: number;
  };

  const ensure = (
    map: Map<string, Bucket>,
    n: string
  ) => {
    if (!map.has(n))
      map.set(n, {
        name: n,
        W: 0,
        L: 0,
        PD: 0,
      });
    return map.get(n)!;
  };

  const { guysRows, girlsRows } = useMemo(() => {
    const g = new Map<string, Bucket>();
    const h = new Map<string, Bucket>();

    for (const n of guysList) ensure(g, n);
    for (const n of girlsList) ensure(h, n);

    for (const m of matches) {
      const s = parseScore(m.scoreText);
      if (!s) continue;
      const [a, b] = s;
      if (!isValidPoolScore(a, b)) continue;

      const t1 = [m.t1p1, m.t1p2];
      const t2 = [m.t2p1, m.t2p2];
      const diff = Math.abs(a - b);
      const t1Won = a > b;

      const apply = (
        name: string,
        won: boolean
      ) => {
        const key = name;
        const isGuy = guysSet.has(
          slug(name)
        );
        const isGirl = girlsSet.has(
          slug(name)
        );
        const map = isGuy
          ? g
          : isGirl
          ? h
          : g;
        const row = ensure(map, key);
        if (won) {
          row.W++;
          row.PD += diff;
        } else {
          row.L++;
          row.PD -= diff;
        }
      };

      for (const p of t1) apply(p, t1Won);
      for (const p of t2) apply(p, !t1Won);
    }

    const sortRows = (arr: Bucket[]) =>
      arr.sort(
        (x, y) =>
          y.W - x.W ||
          y.PD - x.PD ||
          x.name.localeCompare(y.name)
      );

    return {
      guysRows: sortRows(
        Array.from(g.values())
      ),
      girlsRows: sortRows(
        Array.from(h.values())
      ),
    };
  }, [
    matches,
    guysList,
    girlsList,
    guysSet,
    girlsSet,
  ]);

  const Table = ({
    title,
    rows,
  }: {
    title: string;
    rows: Bucket[];
  }) => (
    <section className="bg-slate-900/70 backdrop-blur rounded-2xl shadow-md ring-1 ring-sky-500/40 p-4 border border-slate-700">
      <h3 className="text-lg font-semibold text-sky-100 mb-2">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-300">
              <th className="py-1 px-2">
                #
              </th>
              <th className="py-1 px-2">
                Player
              </th>
              <th className="py-1 px-2">
                W
              </th>
              <th className="py-1 px-2">
                L
              </th>
              <th className="py-1 px-2">
                PD
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.name}
                className="border-t border-slate-800 text-slate-100"
              >
                <td className="py-1 px-2 tabular-nums">
                  {i + 1}
                </td>
                <td className="py-1 px-2">
                  {r.name}
                </td>
                <td className="py-1 px-2 tabular-nums">
                  {r.W}
                </td>
                <td className="py-1 px-2 tabular-nums">
                  {r.L}
                </td>
                <td className="py-1 px-2 tabular-nums">
                  {r.PD}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section>
      <h2 className="text-xl font-bold text-sky-100 mb-1">
        Leaderboard (Live)
      </h2>
      <p className="text-[11px] text-slate-300 mb-3">
        Pool standings only. Playoffs & RR use team
        seeding based on combined W + PD.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Table
          title="Guys Standings"
          rows={guysRows}
        />
        <Table
          title="Girls Standings"
          rows={girlsRows}
        />
      </div>
    </section>
  );
}

/* ========================= Playoff helpers ========================= */

function computeStandings(
  matches: MatchRow[],
  guysText: string,
  girlsText: string
) {
  const guysList = Array.from(
    new Set(
      (guysText || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const girlsList = Array.from(
    new Set(
      (girlsText || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const guysSet = new Set(
    guysList.map(slug)
  );
  const girlsSet = new Set(
    girlsList.map(slug)
  );

  type Bucket = {
    name: string;
    W: number;
    L: number;
    PD: number;
  };

  const g = new Map<string, Bucket>();
  const h = new Map<string, Bucket>();

  const ensure = (
    map: Map<string, Bucket>,
    n: string
  ) => {
    if (!map.has(n))
      map.set(n, {
        name: n,
        W: 0,
        L: 0,
        PD: 0,
      });
    return map.get(n)!;
  };

  for (const n of guysList) ensure(g, n);
  for (const n of girlsList) ensure(h, n);

  for (const m of matches) {
    const s = parseScore(m.scoreText);
    if (!s) continue;
    const [a, b] = s;
    if (!isValidPoolScore(a, b)) continue;

    const t1 = [m.t1p1, m.t1p2];
    const t2 = [m.t2p1, m.t2p2];
    const diff = Math.abs(a - b);
    const t1Won = a > b;

    const apply = (
      name: string,
      won: boolean
    ) => {
      const map = guysSet.has(
        slug(name)
      )
        ? g
        : h;
      const row = ensure(map, name);
      if (won) {
        row.W++;
        row.PD += diff;
      } else {
        row.L++;
        row.PD -= diff;
      }
    };

    for (const p of t1) apply(p, t1Won);
    for (const p of t2) apply(p, !t1Won);
  }

  const sortRows = (arr: Bucket[]) =>
    arr.sort(
      (x, y) =>
        y.W - x.W ||
        y.PD - x.PD ||
        x.name.localeCompare(y.name)
    );

  return {
    guysRows: sortRows(
      Array.from(g.values())
    ),
    girlsRows: sortRows(
      Array.from(h.values())
    ),
  };
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function buildBracket(
  division: PlayDiv,
  teams: Team[],
  topSeedByeCount: number = 0
): BracketMatch[] {
  const N = teams.length;
  if (N === 0) return [];
  const size = nextPow2(N);

  function espnOrder(n: number): number[] {
    if (n === 1) return [1];
    if (n === 2) return [1, 2];
    const prev = espnOrder(n / 2);
    const out: number[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const a = prev[i];
      const b = prev[i + 1] ?? n / 2;
      out.push(a, n + 1 - a, b, n + 1 - b);
    }
    return out;
  }

  const order = espnOrder(size);
  const idxBySeed = new Map<number, number>();
  order.forEach((seed, idx) =>
    idxBySeed.set(seed, idx)
  );

  const slots: (Team | undefined)[] =
    new Array(size).fill(undefined);

  const orderedTeams = teams
    .slice()
    .sort((a, b) => a.seed - b.seed);
  for (const t of orderedTeams) {
    const i = idxBySeed.get(t.seed);
    if (i !== undefined) slots[i] = t;
  }

  const gapByes = Math.max(0, size - N);
  const wantByes = Math.min(
    Math.max(gapByes, Math.floor(topSeedByeCount)),
    5,
    size
  );
  const byeSeeds = new Set<number>();
  for (let s = 1; s <= wantByes; s++) {
    byeSeeds.add(s);
  }

  const matches: BracketMatch[] = [];
  let round = 1;
  let current: BracketMatch[] = [];

  for (let i = 0; i < size; i += 2) {
    const m: BracketMatch = {
      id: `${division}-R${round}-${i / 2 + 1}`,
      division,
      round,
      slot: i / 2 + 1,
      team1: slots[i],
      team2: slots[i + 1],
      court: courtFor(
        division,
        round,
        i / 2 + 1
      ),
    };
    current.push(m);
  }
  matches.push(...current);

  while (current.length > 1) {
    const nextRound: BracketMatch[] = [];
    round++;
    for (let i = 0; i < current.length; i += 2) {
      const parent: BracketMatch = {
        id: `${division}-R${round}-${i / 2 + 1}`,
        division,
        round,
        slot: i / 2 + 1,
        court: courtFor(
          division,
          round,
          i / 2 + 1
        ),
      };
      const a = current[i];
      const b = current[i + 1];
      if (a) {
        a.nextId = parent.id;
        a.nextSide = 'team1';
        parent.team1SourceId = a.id;
      }
      if (b) {
        b.nextId = parent.id;
        b.nextSide = 'team2';
        parent.team2SourceId = b.id;
      }
      nextRound.push(parent);
    }
    matches.push(...nextRound);
    current = nextRound;
  }

  const byId = new Map(
    matches.map((m) => [m.id, m] as const)
  );

  const advanceWinner = (
    m: BracketMatch,
    team?: Team
  ) => {
    if (!team || !m.nextId || !m.nextSide)
      return;
    const parent = byId.get(m.nextId);
    if (!parent) return;
    if (m.nextSide === 'team1')
      parent.team1 = team;
    else parent.team2 = team;
  };

  // Auto-advance pure BYE for top seeds in R1
  for (const m of matches.filter(
    (x) => x.round === 1
  )) {
    const t1 = m.team1;
    const t2 = m.team2;
    if (t1 && !t2 && byeSeeds.has(t1.seed))
      advanceWinner(m, t1);
    if (t2 && !t1 && byeSeeds.has(t2.seed))
      advanceWinner(m, t2);
  }

  // Mark pure BYE leaves as hidden (score "BYE")
  for (const m of matches.filter(
    (x) => x.round === 1
  )) {
    const onlyOne =
      (!!m.team1 && !m.team2) ||
      (!m.team1 && !!m.team2);
    if (onlyOne) {
      m.score = 'BYE';
      m.team1 = undefined;
      m.team2 = undefined;
    }
  }

  return matches;
}

function buildVisualColumns(
  brackets: BracketMatch[],
  division: PlayDiv
) {
  const list = brackets.filter(
    (b) => b.division === division
  );
  if (!list.length)
    return {
      cols: [] as BracketMatch[][],
      rounds: 0,
      size: 0,
    };
  const maxRound = Math.max(
    1,
    ...list.map((b) => b.round)
  );
  const cols: BracketMatch[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    let col = list
      .filter((b) => b.round === r)
      .sort((a, b) => a.slot - b.slot);
    if (r === 1) {
      col = col.filter(
        (m) =>
          !(
            m.team1 === undefined &&
            m.team2 === undefined &&
            (m.score || '')
              .toUpperCase() === 'BYE'
          )
      );
    }
    cols.push(col);
  }
  return {
    cols,
    rounds: maxRound,
    size: (cols[0]?.length || 1) * 2,
  };
}

function seedBadge(seed?: number) {
  if (!seed && seed !== 0) return null;
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 mr-1">
      #{seed}
    </span>
  );
}

/* ========================= Bracket View ========================= */

function BracketCard({ m }: { m: BracketMatch }) {
  const parsed = (() => {
    if (!m.score) return null;
    const t = String(m.score).trim();
    const sep = t.includes('–') ? '–' : '-';
    const p = t.split(sep).map((s) => s.trim());
    if (p.length !== 2) return null;
    const a = +p[0];
    const b = +p[1];
    return isFinite(a) && isFinite(b)
      ? ([a, b] as [number, number])
      : null;
  })();

  const winnerSide: 'team1' | 'team2' | null =
    parsed
      ? parsed[0] > parsed[1]
        ? 'team1'
        : parsed[0] < parsed[1]
        ? 'team2'
        : null
      : null;

  const TeamLine = ({
    t,
    active,
  }: {
    t?: Team;
    active?: boolean;
  }) =>
    t ? (
      <div
        className={
          'flex items-center justify-between gap-1 rounded px-1.5 py-1 ' +
          (active
            ? 'bg-emerald-50 ring-1 ring-emerald-200'
            : '')
        }
      >
        <div className="flex items-center gap-1 min-w-0">
          {seedBadge(t.seed)}
          <span
            className="truncate"
            title={t.name}
          >
            {t.name}
          </span>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-1 text-slate-400">
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          BYE
        </span>
        <em>Top seed advances</em>
      </div>
    );

  return (
    <div className="relative min-w-[260px] rounded-xl border bg-white shadow-md p-3">
      <div className="text-[11px] text-slate-500 mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-slate-700">
            {m.division}
          </span>
          <span>
            · R{m.round} · M{m.slot}
          </span>
          {m.redemption && (
            <span className="ml-1 inline-block text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
              RR
            </span>
          )}
        </span>
        {m.court !== undefined && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200">
            Court {m.court}
          </span>
        )}
      </div>
      <div className="text-sm space-y-1">
        <TeamLine
          t={m.team1}
          active={winnerSide === 'team1'}
        />
        <div className="h-px bg-slate-200" />
        <TeamLine
          t={m.team2}
          active={winnerSide === 'team2'}
        />
      </div>
      {m.score !== undefined &&
        m.score.trim() && (
          <div className="mt-1 text-xs text-slate-600">
            <span className="text-slate-500">
              Result:
            </span>{' '}
            {m.score}
          </div>
        )}
      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-6 h-10">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-px bg-slate-300" />
      </div>
    </div>
  );
}

function BracketView({
  brackets,
  setBrackets,
}: {
  brackets: BracketMatch[];
  setBrackets: (
    f:
      | ((
          prev: BracketMatch[]
        ) => BracketMatch[] | BracketMatch[])
      | BracketMatch[]
  ) => void;
}) {
  const divisions: PlayDiv[] = [
    'UPPER',
    'LOWER',
    'RR',
  ];

  function parseScoreLoose(
    s?: string
  ): [number, number] | null {
    if (!s) return null;
    const txt = String(s).trim();
    const sep = txt.includes('–') ? '–' : '-';
    const parts = txt
      .split(sep)
      .map((p) => p.trim());
    if (parts.length !== 2) return null;
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    return isFinite(a) && isFinite(b)
      ? ([a, b] as [number, number])
      : null;
  }

  const onScore = (
    id: string,
    score: string
  ) =>
    setBrackets((prev) => {
      const copy = prev.map((x) => ({
        ...x,
      }));
      const map = new Map(
        copy.map(
          (m) => [m.id, m] as const
        )
      );
      const m = map.get(id);
      if (!m) return copy;
      m.score = score;

      const parsed =
        parseScoreLoose(score);
      if (parsed) {
        const [a, b] = parsed;
        const winner =
          a > b
            ? m.team1
            : a < b
            ? m.team2
            : undefined;
        const loser =
          a > b
            ? m.team2
            : a < b
            ? m.team1
            : undefined;

        if (
          winner &&
          m.nextId &&
          m.nextSide
        ) {
          const p = map.get(m.nextId);
          if (p) {
            if (
              m.nextSide === 'team1'
            )
              p.team1 = winner;
            else p.team2 = winner;
          }
        }
        if (
          loser &&
          m.loserNextId &&
          m.loserNextSide
        ) {
          const q = map.get(
            m.loserNextId
          );
          if (q) {
            if (
              m.loserNextSide ===
              'team1'
            )
              q.team1 = loser;
            else q.team2 = loser;
          }
        }
      }
      return copy;
    });

  return (
    <section className="bg-slate-900/70 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-500/40 p-6 border border-slate-700">
      <h2 className="text-2xl font-bold text-sky-100 mb-2 tracking-tight">
        Playoff Brackets
      </h2>
      <p className="text-[10px] md:text-xs text-slate-300 mb-4 max-w-2xl">
        Standard playoff rounds are usually played to{' '}
        <strong>25</strong>. Semi-finals & Finals are{' '}
        <strong>match play (21, 21, 15)</strong> — enter the
        final result (e.g. <code>25-22</code> or{' '}
        <code>2-1</code>) and the bracket will auto-advance
        winners. RR combines early-round losers.
      </p>

      {divisions.map((div) => {
        const { cols } =
          buildVisualColumns(
            brackets,
            div
          );
        if (!cols.length) return null;

        return (
          <div
            key={div}
            className="mb-8"
          >
            <h3 className="font-semibold text-sky-100 mb-2">
              {div === 'UPPER'
                ? 'Upper Bracket'
                : div === 'LOWER'
                ? 'Lower Bracket'
                : 'Redemption Rally'}
            </h3>
            <div className="overflow-x-auto">
              <div
                className="grid gap-6"
                style={{
                  gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))`,
                }}
              >
                {cols.map(
                  (col, colIdx) => {
                    const unit = 14;
                    return (
                      <div
                        key={colIdx}
                        className="flex flex-col"
                      >
                        {col.map(
                          (m, i) => {
                            const topGap =
                              i === 0
                                ? unit *
                                  (Math.pow(
                                    2,
                                    colIdx
                                  ) -
                                    1)
                                : unit *
                                  (Math.pow(
                                    2,
                                    colIdx +
                                      1
                                  ) -
                                    1);
                            const canScore =
                              !!(
                                m.team1 &&
                                m.team2
                              );
                            return (
                              <div
                                key={
                                  m.id
                                }
                                style={{
                                  marginTop:
                                    topGap,
                                }}
                              >
                                <BracketCard
                                  m={
                                    m
                                  }
                                />
                                {canScore && (
                                  <div className="mt-1">
                                    <input
                                      className="w-32 border rounded px-2 py-1 text-xs bg-slate-900/80 text-slate-100 border-slate-500"
                                      value={
                                        m.score ||
                                        ''
                                      }
                                      onChange={(
                                        e
                                      ) =>
                                        onScore(
                                          m.id,
                                          e
                                            .target
                                            .value
                                        )
                                      }
                                      placeholder="25-22 or 2-1"
                                      title="Playoffs: enter final score or set score summary; higher first number advances."
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ========================= Playoff Builder ========================= */

function PlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
  setBrackets: (
    f:
      | ((
          prev: BracketMatch[]
        ) => BracketMatch[] | BracketMatch[])
      | BracketMatch[]
  ) => void;
}) {
  const { guysRows, girlsRows } = useMemo(
    () =>
      computeStandings(
        matches,
        guysText,
        girlsText
      ),
    [matches, guysText, girlsText]
  );

  const [upperK, setUpperK] =
    useState<number>(
      Math.ceil(
        Math.max(1, guysRows.length) / 2
      )
    );
  const [seedRandom, setSeedRandom] =
    useState<boolean>(true);
  const [groupSize, setGroupSize] =
    useState<number>(4);
  const [byeUpper, setByeUpper] =
    useState<number>(0);
  const [byeLower, setByeLower] =
    useState<number>(0);
  const [rrRandomize, setRrRandomize] =
    useState<boolean>(false);

  function build(
    div: PlayDiv,
    guySlice: { start: number; end: number },
    girlSlice: { start: number; end: number }
  ): Team[] {
    const g = guysRows.slice(
      guySlice.start,
      guySlice.end
    );
    const h = girlsRows.slice(
      girlSlice.start,
      girlSlice.end
    );
    const gStats = new Map(
      guysRows.map(
        (r) => [r.name, r] as const
      )
    );
    const hStats = new Map(
      girlsRows.map(
        (r) => [r.name, r] as const
      )
    );

    const teams: Team[] = [];
    const K = Math.min(
      g.length,
      h.length
    );
    const winSize = Math.max(
      2,
      groupSize
    );

    for (
      let base = 0;
      base < K;
      base += winSize
    ) {
      const end = Math.min(
        base + winSize,
        K
      );
      const girlsWindow = h.slice(
        base,
        end
      );
      const girlsShuffled = seedRandom
        ? shuffle(girlsWindow)
        : girlsWindow;
      for (
        let j = base;
        j < end;
        j++
      ) {
        const guy = g[j];
        const girl =
          girlsShuffled[
            j - base
          ];
        if (!guy || !girl)
          continue;
        const name = `${guy.name} & ${girl.name}`;
        teams.push({
          id: `${div}-tmp-${j + 1}-${slug(
            name
          )}`,
          name,
          members: [
            guy.name,
            girl.name,
          ],
          seed: j + 1,
          division: div,
        });
      }
    }

    const score = (t: Team) => {
      const [a, b] = t.members;
      const aS =
        gStats.get(a) ||
        hStats.get(a) || {
          W: 0,
          PD: 0,
        };
      const bS =
        gStats.get(b) ||
        hStats.get(b) || {
          W: 0,
          PD: 0,
        };
      return {
        W: (aS.W || 0) + (bS.W || 0),
        PD:
          (aS.PD || 0) +
          (bS.PD || 0),
      };
    };

    teams.sort((A, B) => {
      const sA = score(A);
      const sB = score(B);
      return (
        sB.W - sA.W ||
        sB.PD - sA.PD ||
        A.name.localeCompare(B.name)
      );
    });

    teams.forEach((t, i) => {
      t.seed = i + 1;
      t.id = `${div}-${t.seed}-${slug(
        t.name
      )}`;
    });

    return teams;
  }

  function onBuild() {
    const upperTeams = build(
      'UPPER',
      {
        start: 0,
        end: upperK,
      },
      {
        start: 0,
        end: upperK,
      }
    );
    const lowerTeams = build(
      'LOWER',
      {
        start: upperK,
        end: guysRows.length,
      },
      {
        start: upperK,
        end: girlsRows.length,
      }
    );

    const upperMain = buildBracket(
      'UPPER',
      upperTeams,
      byeUpper
    );
    const lowerMain = buildBracket(
      'LOWER',
      lowerTeams,
      byeLower
    );

    setBrackets([
      ...upperMain,
      ...lowerMain,
    ]);
  }

  function buildCombinedRR() {
    setBrackets((prev) => {
      const main = prev.filter(
        (b) =>
          b.division ===
            'UPPER' ||
          b.division ===
            'LOWER'
      );
      const rrPruned = prev.filter(
        (b) => b.division !== 'RR'
      );

      const losers: Team[] = [];

      const decided = main.filter(
        (m) =>
          (m.round === 1 ||
            m.round === 2) &&
          m.team1 &&
          m.team2 &&
          typeof m.score ===
            'string' &&
          m.score.trim()
      );

      for (const m of decided) {
        const parsed =
          parseScoreLooseForRR(
            m.score
          );
        if (!parsed) continue;
        const [a, b] = parsed;
        const winner =
          a > b
            ? m.team1
            : a < b
            ? m.team2
            : undefined;
        const loser =
          a > b
            ? m.team2
            : a < b
            ? m.team1
            : undefined;
        if (loser) {
          losers.push({
            id: `RR-carry-${losers.length + 1}`,
            name: loser.name,
            members:
              loser.members,
            seed:
              losers.length +
              1,
            division: 'RR',
          });
        }
        if (
          winner &&
          m.nextId &&
          m.nextSide
        ) {
          const parent = main.find(
            (x) =>
              x.id === m.nextId
          );
          if (parent) {
            if (
              m.nextSide ===
              'team1'
            )
              parent.team1 =
                winner;
            else
              parent.team2 =
                winner;
          }
        }
      }

      let rrTeams: Team[] = [];

      if (rrRandomize) {
        const pool =
          losers.flatMap(
            (t) =>
              t.members
          );
        const names = uniq(
          pool
        ).filter(Boolean);
        const shuffled =
          shuffle(names);
        for (
          let i = 0;
          i < shuffled.length;
          i += 2
        ) {
          const a =
            shuffled[i];
          const b =
            shuffled[
              i + 1
            ];
          if (!a || !b)
            break;
          const nm = `${a} & ${b}`;
          rrTeams.push({
            id: `RR-${i / 2 + 1}-${slug(
              nm
            )}`,
            name: nm,
            members: [a, b],
            seed:
              i / 2 + 1,
            division: 'RR',
          });
        }
      } else {
        rrTeams = losers;
      }

      const rrBracket =
        buildBracket(
          'RR',
          rrTeams,
          0
        );
      return [
        ...rrPruned,
        ...rrBracket,
      ];
    });
  }

  function parseScoreLooseForRR(
    s?: string
  ): [number, number] | null {
    if (!s) return null;
    const txt = String(s).trim();
    const sep = txt.includes('–') ? '–' : '-';
    const parts = txt
      .split(sep)
      .map((p) => p.trim());
    if (parts.length !== 2) return null;
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    return isFinite(a) && isFinite(b)
      ? ([a, b] as [number, number])
      : null;
  }

  return (
    <section className="bg-slate-900/70 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-500/40 p-4 border border-slate-700">
      <h3 className="text-lg font-semibold text-sky-100 mb-2">
        Playoff Setup & Redemption Rally
      </h3>
      <div className="grid md:grid-cols-2 gap-3 text-xs md:text-sm text-slate-100">
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            Upper size (per gender)
            <input
              className="w-20 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
              type="number"
              min={1}
              value={upperK}
              onChange={(e) =>
                setUpperK(
                  clampN(
                    +e.target.value ||
                      1,
                    1
                  )
                )
              }
            />
          </label>
          <label className="flex items-center gap-2">
            Pairing window
            <input
              className="w-20 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
              type="number"
              min={2}
              value={groupSize}
              onChange={(e) =>
                setGroupSize(
                  clampN(
                    +e.target.value ||
                      2,
                    2
                  )
                )
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={seedRandom}
              onChange={(e) =>
                setSeedRandom(
                  e.target.checked
                )
              }
            />
            Randomize within window
          </label>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            Top BYEs (Upper)
            <input
              className="w-20 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
              type="number"
              min={0}
              value={byeUpper}
              onChange={(e) =>
                setByeUpper(
                  clampN(
                    +e.target.value ||
                      0,
                    0
                  )
                )
              }
            />
          </label>
          <label className="flex items-center gap-2">
            Top BYEs (Lower)
            <input
              className="w-20 border rounded px-2 py-1 bg-slate-950/80 border-slate-600 text-slate-50"
              type="number"
              min={0}
              value={byeLower}
              onChange={(e) =>
                setByeLower(
                  clampN(
                    +e.target.value ||
                      0,
                    0
                  )
                )
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rrRandomize}
              onChange={(e) =>
                setRrRandomize(
                  e.target.checked
                )
              }
            />
            RR: allow partner
            re-randomize
          </label>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 shadow-sm"
          onClick={onBuild}
        >
          Build Upper & Lower
        </button>
        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 shadow-sm"
          onClick={buildCombinedRR}
        >
          Build Redemption Rally
        </button>
      </div>
      <p className="text-[10px] md:text-xs text-slate-300 mt-2 max-w-xl">
        Upper/Lower teams: paired from standings, seeded
        by combined W then PD. BYEs can be granted to top
        seeds. RR pulls losers from early playoff rounds and
        can reshuffle partners.
      </p>
    </section>
  );
}

/* ========================= App ========================= */

export default function BlindDrawTourneyApp() {
  const [guysText, setGuysText] =
    useState<string>('');
  const [girlsText, setGirlsText] =
    useState<string>('');
  const [matches, setMatches] =
    useState<MatchRow[]>([]);
  const [brackets, setBrackets] =
    useState<BracketMatch[]>([]);

  // Autosave load
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(
          'sunnysports.autosave'
        );
      if (!raw) return;
      const data = JSON.parse(raw);
      if (
        typeof data.guysText === 'string'
      )
        setGuysText(
          data.guysText
        );
      if (
        typeof data.girlsText ===
        'string'
      )
        setGirlsText(
          data.girlsText
        );
      if (Array.isArray(data.matches))
        setMatches(
          data.matches
        );
      if (
        Array.isArray(
          data.brackets
        )
      )
        setBrackets(
          data.brackets
        );
    } catch {
      // ignore
    }
  }, []);

  // Autosave store
  useEffect(() => {
    const snapshot = JSON.stringify({
      guysText,
      girlsText,
      matches,
      brackets,
    });
    localStorage.setItem(
      'sunnysports.autosave',
      snapshot
    );
  }, [
    guysText,
    girlsText,
    matches,
    brackets,
  ]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-900 via-sky-800 to-sky-900 text-slate-100 antialiased">
      <header className="sticky top-0 z-10 bg-slate-950/70 backdrop-blur border-b border-sky-700/60 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <SunnyLogo />
          <div className="flex items-center gap-3 text-[10px] text-slate-300">
            <span>
              build{' '}
              2025-11-06_04
            </span>
            <button
              className="px-2 py-1 border border-slate-600 rounded-md hover:bg-slate-900/70 text-slate-200"
              onClick={() => {
                localStorage.removeItem(
                  'sunnysports.autosave'
                );
                location.reload();
              }}
            >
              Reset App
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Leaderboard */}
        <Leaderboard
          matches={matches}
          guysText={guysText}
          girlsText={girlsText}
        />

        {/* Matches (pool) */}
        <MatchesView
          matches={matches}
          setMatches={setMatches}
        />

        {/* Generator */}
        <RoundGenerator
          guysText={guysText}
          girlsText={girlsText}
          matches={matches}
          setMatches={setMatches}
        />

        {/* Rosters */}
        <section className="bg-slate-900/70 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-500/40 p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-sky-100 mb-2">
            Player Rosters
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <LinedTextarea
              id="guys"
              label="Guys"
              value={guysText}
              onChange={(e) =>
                setGuysText(
                  e.target.value
                )
              }
              placeholder="One name per line"
            />
            <LinedTextarea
              id="girls"
              label="Girls"
              value={girlsText}
              onChange={(e) =>
                setGirlsText(
                  e.target.value
                )
              }
              placeholder="One name per line"
            />
          </div>
        </section>

        {/* Playoffs + Brackets */}
        <PlayoffBuilder
          matches={matches}
          guysText={guysText}
          girlsText={girlsText}
          setBrackets={setBrackets}
        />
        <BracketView
          brackets={brackets}
          setBrackets={setBrackets}
        />

        {/* Data & backup */}
        <section className="bg-slate-950/60 rounded-xl p-3 text-[10px] text-slate-300 border border-slate-700/80">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Autosave is on (local to this
              browser). Use{' '}
              <strong>
                Reset App
              </strong>{' '}
              in the header to clear.
            </span>
            <span className="text-slate-500">
              (Export/Import removed per
              request to keep UI clean.)
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

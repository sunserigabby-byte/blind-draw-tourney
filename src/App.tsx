import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Sunny Sports Performance – Blind Draw Tourney
 *
 * ✅ Guys/Girls rosters with line numbers, duplicate highlighting, live counts
 * ✅ Round Generator:
 *    - Mixed teams (1 guy + 1 girl)
 *    - Handles Ultimate Revco (2 guys) & Power Puff (2 girls) when uneven
 *    - Strict mode: avoids repeat partners & opponents if possible
 *    - Exactly 2 teams per court
 * ✅ Matches:
 *    - Collapsible by round
 *    - Delete round with confirm
 *    - Score input (21+, win by 2, no cap)
 *    - Auto-winner highlight
 * ✅ Leaderboard:
 *    - Separate Guys / Girls tables
 *    - Sorted by W → PD → manual tiebreak (lower = better) → name
 * ✅ Playoffs:
 *    - Build Upper / Lower from standings
 *    - Teams seeded by combined W+PD of partners (uses adjusted standings)
 *    - BYEs placed correctly; only real matches shown in R1
 * ✅ Brackets:
 *    - ESPN-style columns, connectors
 *    - “Winner R#-M#” placeholders (no BYE boxes)
 *    - Score entry auto-advances winners
 * ✅ Autosave to localStorage
 */

type MatchRow = {
  id: string;
  round: number;
  court: number;
  t1p1: string;
  t1p2: string;
  t2p1: string;
  t2p2: string;
  tag?: "ULTIMATE_REVCO" | "POWER_PUFF" | null;
  scoreText?: string;
};

type PlayDiv = "UPPER" | "LOWER" | "RR";

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
  nextSide?: "team1" | "team2";
  team1SourceId?: string;
  team2SourceId?: string;
  court?: number;
  loserNextId?: string;
  loserNextSide?: "team1" | "team2";
  redemption?: boolean;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
const clampN = (n: number, min: number) =>
  isFinite(n) ? Math.max(min, Math.floor(n)) : min;

const shuffle = <T,>(arr: T[], seed?: number) => {
  const a = arr.slice();
  let r = seed ?? Math.floor(Math.random() * 1e9);
  const rand = () =>
    (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const UPPER_COURTS = [1, 2, 3, 4, 5];
const LOWER_COURTS = [6, 7, 8, 9, 10];

const courtFor = (division: PlayDiv, round: number, slot: number) => {
  const pool = division === "UPPER" ? UPPER_COURTS : LOWER_COURTS; // RR uses LOWER by default
  return pool[(slot - 1) % pool.length];
};

// ===== Pool scoring helpers: to 21+, win by 2, no cap =====

function parseScore(text?: string): [number, number] | null {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(b)) return null;
  return [a, b];
}

function isValidPoolScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

/* ========================= Sunny Logo ========================= */

function SunnyLogo() {
  return (
    <div className="flex items-center gap-3 select-none">
      <svg
        width="40"
        height="40"
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
        </defs>
        <rect
          x="0"
          y="0"
          width="64"
          height="64"
          rx="14"
          fill="url(#sky)"
        />
        <circle
          cx="32"
          cy="32"
          r="12"
          fill="url(#sunCore)"
          stroke="#f59e0b"
          strokeWidth="1.3"
        />
        <g
          stroke="#fbbf24"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.95"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 12;
            const r1 = 18,
              r2 = 24;
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
      </svg>
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight text-sky-900 text-[17px]">
          Sunny Sports Performance
        </div>
        <div className="text-[12px] text-slate-600">
          Blind Draw Tourney Control
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
  const selRef = useRef({ start: 0, end: 0 });
  const scrollRef = useRef(0);

  const lines = useMemo(
    () => (value ?? "").split(/\r?\n/),
    [value]
  );
  const trimmed = useMemo(
    () => lines.map((s) => s.trim()),
    [lines]
  );
  const normalized = useMemo(
    () => trimmed.map((s) => s.replace(/\s+/g, " ").toLowerCase()),
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
    () =>
      normalized.map(
        (s) => !!s && (counts.get(s) || 0) > 1
      ),
    [normalized, counts]
  );

  const duplicateNames = useMemo(
    () =>
      Array.from(counts.entries())
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
    ta.addEventListener("scroll", sync, {
      passive: true,
    });
    return () =>
      ta.removeEventListener(
        "scroll",
        sync as any
      );
  }, []);

  // Restore caret & scroll to prevent jump while typing
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.scrollTop = scrollRef.current;
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
        <label
          htmlFor={id}
          className="font-medium text-sky-900"
        >
          {label} (one per line)
        </label>
        <span className="text-[11px] text-slate-700">
          Count:{" "}
          <span className="font-semibold">
            {nonEmptyCount}
          </span>
        </span>
      </div>
      <div
        className={`relative border rounded-2xl shadow-sm grid ${
          hasDupes
            ? "ring-1 ring-red-300 border-red-400"
            : "border-sky-200"
        }`}
        style={{ gridTemplateColumns: "auto 1fr" }}
      >
        {/* Line numbers */}
        <div
          ref={gutterRef}
          className="select-none text-right text-xs bg-sky-50 border-r border-sky-100 rounded-l-2xl px-2 py-2 overflow-auto"
          style={{ maxHeight: "10rem" }}
          aria-hidden
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className={`leading-5 tabular-nums ${
                isDupLine[i]
                  ? "bg-red-50 text-red-600 font-semibold"
                  : "text-slate-400"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea + dup highlight */}
        <div className="relative">
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none rounded-r-2xl"
            aria-hidden
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className={`h-5 ${
                  isDupLine[i]
                    ? "bg-red-50"
                    : ""
                }`}
                style={{
                  lineHeight: "1.25rem",
                }}
              />
            ))}
          </div>
          <textarea
            id={id}
            ref={taRef}
            className="w-full h-40 px-2 py-2 rounded-r-2xl focus:outline-none bg-transparent relative z-10 leading-5 text-slate-900"
            value={value}
            placeholder={placeholder || ""}
            onChange={(e) => {
              const ta = e.currentTarget;
              selRef.current = {
                start:
                  ta.selectionStart ?? 0,
                end:
                  ta.selectionEnd ?? 0,
              };
              scrollRef.current =
                ta.scrollTop;
              onChange(e);
            }}
            onSelect={(e) => {
              const ta =
                e.currentTarget;
              selRef.current = {
                start:
                  ta.selectionStart ??
                  0,
                end:
                  ta.selectionEnd ??
                  0,
              };
            }}
            onScroll={(e) => {
              scrollRef.current = (
                e.currentTarget as HTMLTextAreaElement
              ).scrollTop;
            }}
            style={{
              resize: "vertical",
              lineHeight: "1.25rem",
            }}
            aria-invalid={hasDupes}
            aria-errormessage={
              hasDupes
                ? `${id}-dups`
                : undefined
            }
          />
        </div>
      </div>
      {hasDupes && (
        <div
          id={`${id}-dups`}
          className="text-xs text-red-600 mt-1"
        >
          Duplicate names:
          <span className="font-medium">
            {" "}
            {duplicateNames.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

/* ========================= Matches View ========================= */

function MatchesView({
  matches,
  setMatches,
}: {
  matches: MatchRow[];
  setMatches: (
    f:
      | ((
          prev: MatchRow[]
        ) => MatchRow[] | MatchRow[])
      | MatchRow[]
  ) => void;
}) {
  const rounds = useMemo(
    () =>
      uniq(matches.map((m) => m.round)).sort(
        (a, b) => a - b
      ),
    [matches]
  );
  const [open, setOpen] =
    useState<Set<number>>(
      () =>
        new Set(
          rounds.length
            ? [rounds[rounds.length - 1]]
            : []
        )
    );
  const [confirmR, setConfirmR] =
    useState<number | null>(null);

  useEffect(() => {
    if (rounds.length) {
      setOpen(
        new Set([
          rounds[rounds.length - 1],
        ])
      );
    }
  }, [matches.length]); // eslint-disable-line

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
      prev.filter(
        (m) => m.round !== round
      )
    );
    setConfirmR(null);
  };

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-300 p-5">
      <h2 className="text-2xl font-bold text-sky-800 mb-1 tracking-tight">
        Matches &amp; Results
      </h2>
      <p className="text-xs text-slate-600 mb-3">
        Enter scores as{" "}
        <strong>21-19</strong>,{" "}
        <strong>25-23</strong>, etc. One game,
        must win by 2 (no cap). Winners are
        auto-highlighted.
      </p>

      {rounds.length === 0 && (
        <p className="text-sm text-slate-600">
          No matches yet. Use{" "}
          <strong>Round Generator</strong> to
          create pairings.
        </p>
      )}

      <div className="space-y-3">
        {rounds.map((r) => (
          <div
            key={r}
            className="border border-sky-100 rounded-2xl overflow-hidden shadow-sm bg-white"
          >
            <div className="px-3 py-2 bg-sky-50/90 border-b border-sky-100 flex justify-between items-center">
              <button
                className="text-left font-semibold text-sky-800"
                onClick={() => {
                  const n =
                    new Set(open);
                  if (n.has(r))
                    n.delete(r);
                  else n.add(r);
                  setOpen(n);
                }}
              >
                Round {r}{" "}
                <span className="ml-2 text-[10px] text-slate-600">
                  {open.has(r)
                    ? "Click to collapse"
                    : "Click to expand"}
                </span>
              </button>
              <button
                className="text-[10px] px-2 py-1 rounded-full bg-red-600 text-white hover:bg-red-700"
                onClick={() =>
                  requestDelete(r)
                }
              >
                Delete Round
              </button>
            </div>

            {confirmR === r && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-xs">
                <span className="text-red-700">
                  Delete Round {r} and all its
                  scores?
                </span>
                <div className="flex gap-2">
                  <button
                    className="px-2 py-1 rounded bg-red-600 text-white text-[10px]"
                    onClick={() =>
                      doDelete(r)
                    }
                  >
                    Confirm
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-[10px]"
                    onClick={() =>
                      setConfirmR(null)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open.has(r) && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/95">
                    <tr className="text-left text-sky-800">
                      <th className="py-1 px-2">
                        Court
                      </th>
                      <th className="py-1 px-2">
                        Team 1
                      </th>
                      <th className="py-1 px-2">
                        Team 2
                      </th>
                      <th className="py-1 px-2">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches
                      .filter(
                        (m) =>
                          m.round === r
                      )
                      .sort(
                        (a, b) =>
                          a.court -
                          b.court
                      )
                      .map(
                        (
                          m,
                          idx
                        ) => {
                          const parsed =
                            parseScore(
                              m.scoreText
                            );
                          const valid =
                            parsed
                              ? isValidPoolScore(
                                  parsed[0],
                                  parsed[1]
                                )
                              : m.scoreText
                              ? false
                              : true;
                          const t1Win =
                            parsed &&
                            valid
                              ? parsed[0] >
                                parsed[1]
                              : null;

                          return (
                            <tr
                              key={
                                m.id
                              }
                              className={
                                "border-t border-slate-100 " +
                                (idx %
                                2
                                  ? "bg-slate-50/40 "
                                  : "bg-white ") +
                                (m.tag ===
                                "ULTIMATE_REVCO"
                                  ? "bg-blue-50/60 "
                                  : m.tag ===
                                    "POWER_PUFF"
                                  ? "bg-pink-50/60 "
                                  : "")
                              }
                            >
                              <td className="py-1 px-2 tabular-nums text-slate-800">
                                {
                                  m.court
                                }
                              </td>
                              <td
                                className={
                                  "py-1 px-2 text-slate-900"
                                }
                              >
                                <div className="flex items-center gap-2">
                                  {m.tag ===
                                    "ULTIMATE_REVCO" && (
                                    <span className="inline-block text-[9px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 ring-1 ring-blue-200">
                                      Ultimate
                                      Revco
                                    </span>
                                  )}
                                  {m.tag ===
                                    "POWER_PUFF" && (
                                    <span className="inline-block text-[9px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 ring-1 ring-pink-200">
                                      Power
                                      Puff
                                    </span>
                                  )}
                                  <span
                                    className={
                                      t1Win ===
                                      true
                                        ? "font-semibold text-emerald-700"
                                        : ""
                                    }
                                  >
                                    {
                                      m.t1p1
                                    }{" "}
                                    &amp;{" "}
                                    {
                                      m.t1p2
                                    }
                                  </span>
                                </div>
                              </td>
                              <td className="py-1 px-2 text-slate-900">
                                <span
                                  className={
                                    t1Win ===
                                    false
                                      ? "font-semibold text-emerald-700"
                                      : ""
                                  }
                                >
                                  {
                                    m.t2p1
                                  }{" "}
                                  &amp;{" "}
                                  {
                                    m.t2p2
                                  }
                                </span>
                              </td>
                              <td className="py-1 px-2">
                                <input
                                  className={`w-32 border rounded px-2 py-1 text-sm ${
                                    valid
                                      ? "border-slate-300"
                                      : "border-red-500 bg-red-50"
                                  }`}
                                  value={
                                    m.scoreText ||
                                    ""
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    update(
                                      m.id,
                                      {
                                        scoreText:
                                          e
                                            .target
                                            .value,
                                      }
                                    )
                                  }
                                  placeholder="e.g., 22-20"
                                  title="One game to 21+, must win by 2 (no cap)"
                                />
                              </td>
                            </tr>
                          );
                        }
                      )}
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
    f:
      | ((
          prev: MatchRow[]
        ) => MatchRow[] | MatchRow[])
      | MatchRow[]
  ) => void;
}) {
  const [strict, setStrict] =
    useState(true);
  const [roundsToGen, setRoundsToGen] =
    useState(1);
  const [startCourt, setStartCourt] =
    useState(1);
  const [seedStr, setSeedStr] =
    useState("");

  const guys = useMemo(
    () =>
      uniq(
        (guysText || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [guysText]
  );
  const girls = useMemo(
    () =>
      uniq(
        (girlsText || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [girlsText]
  );

  const buildPartnerMap = (
    history: MatchRow[]
  ) => {
    const mp = new Map<
      string,
      Set<string>
    >();
    for (const m of history) {
      const add = (
        a?: string,
        b?: string
      ) => {
        if (!a || !b) return;
        const A = slug(a);
        const B = slug(b);
        if (!mp.has(A))
          mp.set(A, new Set());
        if (!mp.has(B))
          mp.set(B, new Set());
        mp.get(A)!.add(B);
        mp.get(B)!.add(A);
      };
      add(m.t1p1, m.t1p2);
      add(m.t2p1, m.t2p2);
    }
    return mp;
  };

  const buildOpponentMap = (
    history: MatchRow[]
  ) => {
    const mp = new Map<
      string,
      Set<string>
    >();
    for (const m of history) {
      const t1 = [
        m.t1p1,
        m.t1p2,
      ];
      const t2 = [
        m.t2p1,
        m.t2p2,
      ];
      for (const a of t1)
        for (const b of t2) {
          if (!a || !b)
            continue;
          const A = slug(a);
          const B = slug(b);
          if (!mp.has(A))
            mp.set(A, new Set());
          mp.get(A)!.add(B);
        }
      for (const a of t2)
        for (const b of t1) {
          if (!a || !b)
            continue;
          const A = slug(a);
          const B = slug(b);
          if (!mp.has(A))
            mp.set(A, new Set());
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
    !strict
      ? true
      : !mp
          .get(slug(a))
          ?.has(slug(b));

  const haventOpposed = (
    mp: Map<string, Set<string>>,
    a: string,
    b: string
  ) =>
    !strict
      ? true
      : !mp
          .get(slug(a))
          ?.has(slug(b));

  function buildRound(
    roundIdx: number,
    history: MatchRow[]
  ) {
    const seedNum = seedStr
      ? Number(seedStr)
      : undefined;
    const G = shuffle(
      guys,
      seedNum
    );
    const H = shuffle(
      girls,
      seedNum
        ? seedNum + 17
        : undefined
    );

    const partnerMap =
      buildPartnerMap(history);
    const opponentMap =
      buildOpponentMap(history);

    const pairs: {
      team: [string, string];
      tag: MatchRow["tag"];
    }[] = [];
    const n = Math.min(
      G.length,
      H.length
    );

    // mixed pairs
    for (let i = 0; i < n; i++) {
      const g = G[i];
      const h = H[i];
      if (
        canPair(
          partnerMap,
          g,
          h
        )
      ) {
        pairs.push({
          team: [g, h],
          tag: null,
        });
        const a = slug(g);
        const b = slug(h);
        if (!partnerMap.has(a))
          partnerMap.set(
            a,
            new Set()
          );
        if (!partnerMap.has(b))
          partnerMap.set(
            b,
            new Set()
          );
        partnerMap
          .get(a)!
          .add(b);
        partnerMap
          .get(b)!
          .add(a);
      } else {
        let placed =
          false;
        for (
          let j = i + 1;
          j < n;
          j++
        ) {
          if (
            canPair(
              partnerMap,
              g,
              H[j]
            )
          ) {
            const tmp =
              H[i];
            H[i] = H[j];
            H[j] = tmp;
            pairs.push({
              team: [
                g,
                H[i],
              ],
              tag: null,
            });
            const a =
              slug(g);
            const b =
              slug(H[i]);
            if (
              !partnerMap.has(a)
            )
              partnerMap.set(
                a,
                new Set()
              );
            if (
              !partnerMap.has(b)
            )
              partnerMap.set(
                b,
                new Set()
              );
            partnerMap
              .get(a)!
              .add(b);
            partnerMap
              .get(b)!
              .add(a);
            placed =
              true;
            break;
          }
        }
        if (!placed) {
          pairs.push({
            team: [g, h],
            tag: null,
          });
          const a =
            slug(g);
          const b =
            slug(h);
          if (
            !partnerMap.has(a)
          )
            partnerMap.set(
              a,
              new Set()
            );
          if (
            !partnerMap.has(b)
          )
            partnerMap.set(
              b,
              new Set()
            );
          partnerMap
            .get(a)!
            .add(b);
          partnerMap
            .get(b)!
            .add(a);
        }
      }
    }

    // Ultimate Revco / Power Puff if extra
    const extraGuys =
      G.slice(n);
    const extraGirls =
      H.slice(n);
    if (
      extraGuys.length >= 2
    ) {
      pairs.push({
        team: [
          extraGuys[0],
          extraGuys[1],
        ],
        tag: "ULTIMATE_REVCO",
      });
    }
    if (
      extraGirls.length >= 2
    ) {
      pairs.push({
        team: [
          extraGirls[0],
          extraGirls[1],
        ],
        tag: "POWER_PUFF",
      });
    }

    // Place teams into matches: 2 teams per court
    const teamList =
      pairs.slice();
    const made: MatchRow[] = [];
    let court =
      startCourt;

    while (
      teamList.length >= 2
    ) {
      const a =
        teamList.shift()!;
      let idx = 0;
      let found =
        false;
      for (
        let i = 0;
        i < teamList.length;
        i++
      ) {
        const b =
          teamList[i];
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
      const b =
        teamList.splice(
          found ? idx : 0,
          1
        )[0];

      // update opponent map within this round
      [a.team[0], a.team[1]].forEach(
        (A) =>
          [b.team[0], b.team[1]].forEach(
            (B) => {
              const SA =
                slug(A);
              const SB =
                slug(B);
              if (
                !opponentMap.has(
                  SA
                )
              )
                opponentMap.set(
                  SA,
                  new Set()
                );
              opponentMap
                .get(SA)!
                .add(SB);
            }
          )
      );
      [b.team[0], b.team[1]].forEach(
        (A) =>
          [a.team[0], a.team[1]].forEach(
            (B) => {
              const SA =
                slug(A);
              const SB =
                slug(B);
              if (
                !opponentMap.has(
                  SA
                )
              )
                opponentMap.set(
                  SA,
                  new Set()
                );
              opponentMap
                .get(SA)!
                .add(SB);
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
        tag:
          a.tag ||
          b.tag ||
          null,
        scoreText: "",
      });
    }

    return made;
  }

  function onGenerate() {
    const n = clampN(
      roundsToGen,
      1
    );
    const out: MatchRow[] = [];
    let history =
      matches.slice();
    const currentMax =
      history.reduce(
        (mx, m) =>
          Math.max(
            mx,
            m.round
          ),
        0
      ) || 0;

    for (let i = 1; i <= n; i++) {
      const roundIdx =
        currentMax + i;
      const one =
        buildRound(
          roundIdx,
          history
        );
      out.push(...one);
      history =
        history.concat(one);
    }

    setMatches(
      (prev) =>
        (Array.isArray(
          prev
        )
          ? prev
          : []
        ).concat(out)
    );
  }

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-300 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xl font-semibold text-sky-800">
          Round Generator
        </h3>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <label className="flex items-center gap-1 text-slate-800">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) =>
                setStrict(
                  e.target
                    .checked
                )
              }
            />
            Strict no-repeat
          </label>
          <label className="flex items-center gap-1 text-slate-800">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={(e) =>
                setRoundsToGen(
                  clampN(
                    +e.target
                      .value ||
                      1,
                    1
                  )
                )
              }
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1 text-slate-800">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={(e) =>
                setStartCourt(
                  clampN(
                    +e.target
                      .value ||
                      1,
                    1
                  )
                )
              }
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1 text-slate-800">
            Seed
            <input
              type="text"
              value={seedStr}
              onChange={(e) =>
                setSeedStr(
                  e.target.value
                )
              }
              placeholder="optional"
              className="w-24 border rounded px-2 py-1"
            />
          </label>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-600 mt-2">
        Blue badge =
        <strong> Ultimate Revco</strong>{" "}
        (2 guys). Pink badge =
        <strong> Power Puff</strong>{" "}
        (2 girls). Strict mode tries to
        avoid repeat partners and
        opponents. Courts are filled with
        exactly two teams.
      </p>
    </section>
  );
}

/* ========================= Leaderboard (with manual tiebreak) ========================= */

function Leaderboard({
  matches,
  guysText,
  girlsText,
  tieAdjust,
}: {
  matches: MatchRow[];
  guysText: string;
  girlsText: string;
  tieAdjust: Record<string, number>;
}) {
  const guysList = useMemo(
    () =>
      Array.from(
        new Set(
          (guysText || "")
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
          (girlsText || "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
    [girlsText]
  );
  const guysSet = useMemo(
    () =>
      new Set(
        guysList.map(slug)
      ),
    [guysList]
  );
  const girlsSet = useMemo(
    () =>
      new Set(
        girlsList.map(slug)
      ),
    [girlsList]
  );

  type Bucket = {
    name: string;
    W: number;
    L: number;
    PD: number;
  };

  const baseMap = () =>
    new Map<string, Bucket>();

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

  const {
    guysRows,
    girlsRows,
  } = useMemo(() => {
    const g = baseMap();
    const h = baseMap();

    // everyone appears
    for (const n of guysList)
      ensure(g, n);
    for (const n of girlsList)
      ensure(h, n);

    // tally from valid scores
    for (const m of matches) {
      const s =
        parseScore(
          m.scoreText
        );
      if (!s) continue;
      const [a, b] = s;
      if (
        !isValidPoolScore(
          a,
          b
        )
      )
        continue;

      const t1 = [
        m.t1p1,
        m.t1p2,
      ];
      const t2 = [
        m.t2p1,
        m.t2p2,
      ];
      const diff =
        Math.abs(a - b);
      const t1Won =
        a > b;

      const apply = (
        name: string,
        won: boolean
      ) => {
        const isGuy =
          guysSet.has(
            slug(name)
          );
        const isGirl =
          girlsSet.has(
            slug(name)
          );
        const map = isGuy
          ? g
          : isGirl
          ? h
          : g;
        const row =
          ensure(
            map,
            name
          );
        if (won) {
          row.W++;
          row.PD += diff;
        } else {
          row.L++;
          row.PD -= diff;
        }
      };

      for (const p of t1)
        apply(p, t1Won);
      for (const p of t2)
        apply(p, !t1Won);
    }

    const sortRows = (
      arr: Bucket[]
    ) =>
      arr.sort(
        (x, y) =>
          y.W - x.W ||
          y.PD - x.PD ||
          (tieAdjust[x.name] ??
            0) -
            (tieAdjust[y.name] ??
              0) ||
          x.name.localeCompare(
            y.name
          )
      );

    return {
      guysRows: sortRows(
        Array.from(
          g.values()
        )
      ),
      girlsRows: sortRows(
        Array.from(
          h.values()
        )
      ),
    };
  }, [
    matches,
    guysList,
    girlsList,
    guysSet,
    girlsSet,
    tieAdjust,
  ]);

  const Table = ({
    title,
    rows,
  }: {
    title: string;
    rows: Bucket[];
  }) => (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-md ring-1 ring-sky-300 p-4">
      <h3 className="text-lg font-semibold text-sky-800 mb-1">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-sky-700">
              <th className="py-1 px-2">
                Seed
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
            {rows.map(
              (
                r,
                i
              ) => (
                <tr
                  key={
                    r.name
                  }
                  className="border-t border-slate-100"
                >
                  <td className="py-1 px-2 tabular-nums text-slate-900">
                    {i + 1}
                  </td>
                  <td className="py-1 px-2 text-slate-900">
                    {r.name}
                  </td>
                  <td className="py-1 px-2 tabular-nums text-slate-900">
                    {
                      r.W
                    }
                  </td>
                  <td className="py-1 px-2 tabular-nums text-slate-900">
                    {
                      r.L
                    }
                  </td>
                  <td className="py-1 px-2 tabular-nums text-slate-900">
                    {
                      r.PD
                    }
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section>
      <h2 className="text-2xl font-bold text-sky-800 mb-1">
        Leaderboard (Live Seeding)
      </h2>
      <p className="text-xs text-slate-600 mb-3">
        Sorted by{" "}
        <strong>
          Wins → PD → manual
          tiebreak → name
        </strong>
        . Use manual
        tiebreaks in
        Playoff Setup (for
        rock-paper-scissors
        etc.). Updates as you
        score matches.
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

/* ========================= Standings helper for playoffs ========================= */

function computeStandings(
  matches: MatchRow[],
  guysText: string,
  girlsText: string
) {
  const guysList = Array.from(
    new Set(
      (guysText || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const girlsList = Array.from(
    new Set(
      (girlsText || "")
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

  const g = new Map<
    string,
    Bucket
  >();
  const h = new Map<
    string,
    Bucket
  >();
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

  for (const n of guysList)
    ensure(g, n);
  for (const n of girlsList)
    ensure(h, n);

  for (const m of matches) {
    const s =
      parseScore(
        m.scoreText
      );
    if (!s) continue;
    const [a, b] = s;
    if (
      !isValidPoolScore(
        a,
        b
      )
    )
      continue;

    const t1 = [
      m.t1p1,
      m.t1p2,
    ];
    const t2 = [
      m.t2p1,
      m.t2p2,
    ];
    const diff =
      Math.abs(a - b);
    const t1Won =
      a > b;

    const apply = (
      name: string,
      won: boolean
    ) => {
      const map =
        guysSet.has(
          slug(name)
        )
          ? g
          : h;
      const row =
        ensure(
          map,
          name
        );
      if (won) {
        row.W++;
        row.PD += diff;
      } else {
        row.L++;
        row.PD -= diff;
      }
    };

    for (const p of t1)
      apply(p, t1Won);
    for (const p of t2)
      apply(p, !t1Won);
  }

  const sortRows = (
    arr: Bucket[]
  ) =>
    arr.sort(
      (x, y) =>
        y.W - x.W ||
        y.PD - x.PD ||
        x.name.localeCompare(
          y.name
        )
    );

  return {
    guysRows: sortRows(
      Array.from(
        g.values()
      )
    ),
    girlsRows: sortRows(
      Array.from(
        h.values()
      )
    ),
  };
}

/* ========================= Bracket builder (only real games in R1) ========================= */

function nextPow2(n: number) {
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

  const sorted = teams
    .slice()
    .sort(
      (a, b) =>
        a.seed - b.seed ||
        a.name.localeCompare(
          b.name
        )
    );

  const naturalSize =
    nextPow2(N);
  const maxExtra =
    naturalSize - N;
  const numByes = Math.max(
    0,
    Math.min(
      topSeedByeCount,
      maxExtra
    )
  );
  const size =
    N + numByes || 1;

  function espnOrder(
    n: number
  ): number[] {
    if (n === 1) return [1];
    if (n === 2) return [1, 2];
    const half = n / 2;
    const prev = espnOrder(half);
    const out: number[] = [];
    for (
      let i = 0;
      i < prev.length;
      i++
    ) {
      const s = prev[i];
      out.push(
        s,
        n + 1 - s
      );
    }
    return out.slice(
      0,
      n
    );
  }

  const order =
    espnOrder(size);
  const idxBySeed =
    new Map<
      number,
      number
    >();
  order.forEach(
    (seed, idx) =>
      idxBySeed.set(
        seed,
        idx
      )
  );

  const bySeed = new Map(
    sorted.map((t) => [
      t.seed,
      t,
    ] as const)
  );
  const slots: (Team | undefined)[] =
    new Array(size).fill(
      undefined
    );

  for (
    let s = 1;
    s <= N;
    s++
  ) {
    const pos =
      idxBySeed.get(s);
    const team =
      bySeed.get(s);
    if (
      pos !== undefined &&
      team
    ) {
      slots[pos] = team;
    }
  }

  type Entry =
    | Team
    | {
        matchId: string;
      };

  const matches: BracketMatch[] =
    [];

  let round = 1;
  let nextEntries: Entry[] =
    [];
  let slotCounter = 1;

  // Round 1: only real games (2 real teams)
  for (
    let i = 0;
    i < size;
    i += 2
  ) {
    const t1 =
      slots[i];
    const t2 =
      slots[i + 1];

    if (t1 && t2) {
      const id = `${division}-R${round}-${slotCounter}`;
      const m: BracketMatch = {
        id,
        division,
        round,
        slot: slotCounter,
        team1: t1,
        team2: t2,
        court: courtFor(
          division,
          round,
          slotCounter
        ),
      };
      matches.push(m);
      nextEntries.push({
        matchId: id,
      });
      slotCounter++;
    } else {
      const adv =
        t1 || t2;
      if (adv)
        nextEntries.push(
          adv
        );
    }
  }

  if (nextEntries.length <= 1)
    return matches;

  // Later rounds: pair entries into matches
  while (
    nextEntries.length >
    1
  ) {
    round++;
    const current =
      nextEntries;
    nextEntries = [];
    slotCounter = 1;

    for (
      let i = 0;
      i < current.length;
      i += 2
    ) {
      const left =
        current[i];
      const right =
        current[i + 1];

      if (!left && !right)
        continue;

      const id = `${division}-R${round}-${slotCounter}`;
      const parent: BracketMatch =
        {
          id,
          division,
          round,
          slot: slotCounter,
          court: courtFor(
            division,
            round,
            slotCounter
          ),
        };

      if (left) {
        if ("matchId" in left) {
          const child =
            matches.find(
              (m) =>
                m.id ===
                left.matchId
            );
          if (
            child
          ) {
            child.nextId = id;
            child.nextSide =
              "team1";
            parent.team1SourceId =
              child.id;
          }
        } else {
          parent.team1 =
            left as Team;
        }
      }

      if (right) {
        if ("matchId" in right) {
          const child =
            matches.find(
              (m) =>
                m.id ===
                right.matchId
            );
          if (
            child
          ) {
            child.nextId = id;
            child.nextSide =
              "team2";
            parent.team2SourceId =
              child.id;
          }
        } else {
          parent.team2 =
            right as Team;
        }
      }

      matches.push(parent);
      nextEntries.push({
        matchId: id,
      });
      slotCounter++;
    }
  }

  return matches;
}

/* ========================= Bracket visualization helpers ========================= */

function buildVisualColumns(
  brackets: BracketMatch[],
  division: PlayDiv
) {
  const list =
    brackets.filter(
      (b) =>
        b.division ===
        division
    );
  if (!list.length)
    return {
      cols: [],
      rounds: 0,
    };
  const maxRound = Math.max(
    ...list.map(
      (b) => b.round
    )
  );
  const cols: BracketMatch[][] =
    [];
  for (
    let r = 1;
    r <= maxRound;
    r++
  ) {
    const col = list
      .filter(
        (b) =>
          b.round === r
      )
      .sort(
        (a, b) =>
          a.slot -
          b.slot
      );
    cols.push(col);
  }
  return {
    cols,
    rounds: maxRound,
  };
}

function seedBadge(
  seed?: number
) {
  if (
    seed === undefined
  )
    return null;
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 mr-1">
      #{seed}
    </span>
  );
}

function BracketCard({
  match,
  labelFromSources,
}: {
  match: BracketMatch;
  labelFromSources?: string;
}) {
  const parsed =
    (() => {
      if (!match.score)
        return null;
      const txt =
        String(
          match.score
        ).trim();
      const sep =
        txt.includes("–")
          ? "–"
          : "-";
      const parts =
        txt
          .split(sep)
          .map((p) =>
            p.trim()
          );
      if (
        parts.length !==
        2
      )
        return null;
      const a =
        parseInt(
          parts[0],
          10
        );
      const b =
        parseInt(
          parts[1],
          10
        );
      if (
        !isFinite(a) ||
        !isFinite(b)
      )
        return null;
      return [a, b] as [
        number,
        number
      ];
    })();

  const winnerSide: "team1" | "team2" | null =
    parsed
      ? parsed[0] >
        parsed[1]
        ? "team1"
        : parsed[0] <
          parsed[1]
        ? "team2"
        : null
      : null;

  const TeamLine = ({
    team,
    isWinner,
    placeholder,
  }: {
    team?: Team;
    isWinner?: boolean;
    placeholder?: string;
  }) => {
    if (team) {
      return (
        <div
          className={
            "flex items-center justify-between gap-1 rounded px-1.5 py-1 " +
            (isWinner
              ? "bg-emerald-50 ring-1 ring-emerald-200"
              : "bg-white")
          }
        >
          <div className="flex items-center gap-1 min-w-0">
            {seedBadge(
              team.seed
            )}
            <span
              className="truncate text-slate-900"
              title={
                team.name
              }
            >
              {
                team.name
              }
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-slate-400">
        {placeholder || ""}
      </div>
    );
  };

  const ph1 =
    !match.team1 &&
    labelFromSources
      ? labelFromSources
      : undefined;
  const ph2 =
    !match.team2 &&
    labelFromSources
      ? labelFromSources
      : undefined;

  return (
    <div className="relative min-w-[260px] rounded-xl border border-sky-200 bg-white shadow-sm p-3">
      <div className="text-[10px] text-slate-500 mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <span className="font-semibold text-sky-800">
            {match.division}
          </span>
          <span>
            R
            {match.round}·M
            {match.slot}
          </span>
        </span>
        {typeof match.court ===
          "number" && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200">
            Court{" "}
            {
              match.court
            }
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs">
        <TeamLine
          team={
            match.team1
          }
          isWinner={
            winnerSide ===
            "team1"
          }
          placeholder={
            ph1
          }
        />
        <div className="h-px bg-slate-200" />
        <TeamLine
          team={
            match.team2
          }
          isWinner={
            winnerSide ===
            "team2"
          }
          placeholder={
            ph2
          }
        />
      </div>
      {match.score && (
        <div className="mt-1 text-[10px] text-slate-600">
          Score:{" "}
          {
            match.score
          }
        </div>
      )}
      {/* simple connector */}
      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-6 h-8">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-px bg-slate-300" />
      </div>
    </div>
  );
}

/* ========================= Bracket View ========================= */

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
    "UPPER",
    "LOWER",
    "RR",
  ];

  function parseScoreLoose(
    s?: string
  ): [number, number] | null {
    if (!s) return null;
    const txt =
      String(s).trim();
    const sep =
      txt.includes("–")
        ? "–"
        : "-";
    const parts =
      txt
        .split(sep)
        .map((p) =>
          p.trim()
        );
    if (
      parts.length !==
      2
    )
      return null;
    const a =
      parseInt(
        parts[0],
        10
      );
    const b =
      parseInt(
        parts[1],
        10
      );
    if (
      !isFinite(a) ||
      !isFinite(b)
    )
      return null;
    return [a, b];
  }

  const onScore = (
    id: string,
    score: string
  ) =>
    setBrackets((prev) => {
      const copy =
        prev.map(
          (x) => ({
            ...x,
          })
        );
      const map =
        new Map(
          copy.map(
            (m) => [
              m.id,
              m,
            ] as const
          )
        );
      const m =
        map.get(id);
      if (!m) return copy;
      m.score = score;

      const parsed =
        parseScoreLoose(
          score
        );
      if (parsed) {
        const [a, b] =
          parsed;
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
          const p =
            map.get(
              m.nextId
            );
          if (p) {
            if (
              m.nextSide ===
              "team1"
            )
              p.team1 =
                winner;
            else
              p.team2 =
                winner;
          }
        }
        if (
          loser &&
          m.loserNextId &&
          m.loserNextSide
        ) {
          const q =
            map.get(
              m.loserNextId
            );
          if (q) {
            if (
              m.loserNextSide ===
              "team1"
            )
              q.team1 =
                loser;
            else
              q.team2 =
                loser;
          }
        }
      }

      return copy;
    });

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-300 p-5">
      <h2 className="text-2xl font-bold text-sky-800 mb-1">
        Playoff Brackets
      </h2>
      <p className="text-xs text-slate-600 mb-4">
        ESPN-style layout. Only real
        Round 1 games are shown (BYE seeds
        appear in later rounds). Enter
        scores to auto-advance winners.
      </p>
      {divisions.map(
        (div) => {
          const {
            cols,
          } =
            buildVisualColumns(
              brackets,
              div
            );
          if (
            !cols.length
          )
            return null;
          return (
            <div
              key={div}
              className="mb-8"
            >
              <h3 className="font-semibold text-sky-800 mb-2">
                {div} Bracket
              </h3>
              <div className="overflow-x-auto">
                <div
                  className="grid gap-6"
                  style={{
                    gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))`,
                  }}
                >
                  {cols.map(
                    (
                      col,
                      colIdx
                    ) => {
                      const unit =
                        14;
                      return (
                        <div
                          key={
                            colIdx
                          }
                          className="flex flex-col"
                        >
                          {col.map(
                            (
                              m,
                              i
                            ) => {
                              const topGap =
                                i ===
                                0
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

                              // If no team yet but sources exist, show "Winner R#-M#"
                              const labelFromSources =
                                !m.team1 &&
                                !m.team2 &&
                                (m.team1SourceId ||
                                  m.team2SourceId)
                                  ? "Winner of previous match"
                                  : undefined;

                              const canScore =
                                !!(m.team1 &&
                                  m.team2);

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
                                    match={
                                      m
                                    }
                                    labelFromSources={
                                      labelFromSources
                                    }
                                  />
                                  {canScore && (
                                    <div className="mt-1">
                                      <input
                                        className="w-32 border rounded px-2 py-1 text-xs"
                                        value={
                                          m.score ||
                                          ""
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
                                        placeholder="e.g., 25-21"
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
        }
      )}
    </section>
  );
}

/* ========================= Playoff Builder (uses manual tiebreaks) ========================= */

function PlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
  tieAdjust,
  setTieAdjust,
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
  tieAdjust: Record<string, number>;
  setTieAdjust: React.Dispatch<
    React.SetStateAction<
      Record<string, number>
    >
  >;
}) {
  const base =
    useMemo(
      () =>
        computeStandings(
          matches,
          guysText,
          girlsText
        ),
      [
        matches,
        guysText,
        girlsText,
      ]
    );
  const baseGuys =
    base.guysRows;
  const baseGirls =
    base.girlsRows;

  // adjusted rows (tieAdjust applied)
  const guysRows =
    useMemo(() => {
      const arr =
        baseGuys.slice();
      arr.sort(
        (a, b) =>
          b.W - a.W ||
          b.PD - a.PD ||
          (tieAdjust[a.name] ??
            0) -
            (tieAdjust[b.name] ??
              0) ||
          a.name.localeCompare(
            b.name
          )
      );
      return arr;
    }, [
      baseGuys,
      tieAdjust,
    ]);

  const girlsRows =
    useMemo(() => {
      const arr =
        baseGirls.slice();
      arr.sort(
        (a, b) =>
          b.W - a.W ||
          b.PD - a.PD ||
          (tieAdjust[a.name] ??
            0) -
            (tieAdjust[b.name] ??
              0) ||
          a.name.localeCompare(
            b.name
          )
      );
      return arr;
    }, [
      baseGirls,
      tieAdjust,
    ]);

  const [upperK, setUpperK] =
    useState<number>(
      Math.ceil(
        Math.max(
          1,
          baseGuys.length
        ) / 2
      )
    );
  const [seedRandom,
    setSeedRandom] =
    useState(true);
  const [groupSize,
    setGroupSize] =
    useState(4);
  const [byeUpper,
    setByeUpper] =
    useState(0);
  const [byeLower,
    setByeLower] =
    useState(0);
  const [rrRandomize,
    setRrRandomize] =
    useState(false);

  function findTieGroups(
    rows: {
      name: string;
      W: number;
      PD: number;
    }[]
  ) {
    const byKey =
      new Map<
        string,
        string[]
      >();
    for (const r of rows) {
      const key = `${r.W}|${r.PD}`;
      const list =
        byKey.get(
          key
        ) || [];
      list.push(r.name);
      byKey.set(
        key,
        list
      );
    }
    const groups: string[][] =
      [];
    for (const [, list] of byKey) {
      if (
        list.length >
        1
      ) {
        groups.push(
          list.sort(
            (a, b) =>
              a.localeCompare(
                b
              )
          )
        );
      }
    }
    return groups;
  }

  const guyTieGroups =
    useMemo(
      () =>
        findTieGroups(
          baseGuys
        ),
      [baseGuys]
    );
  const girlTieGroups =
    useMemo(
      () =>
        findTieGroups(
          baseGirls
        ),
      [baseGirls]
    );

  function build(
    div: PlayDiv,
    guySlice: {
      start: number;
      end: number;
    },
    girlSlice: {
      start: number;
      end: number;
    }
  ) {
    const g =
      guysRows.slice(
        guySlice.start,
        guySlice.end
      );
    const h =
      girlsRows.slice(
        girlSlice.start,
        girlSlice.end
      );

    const gStats =
      new Map(
        baseGuys.map(
          (r) => [
            r.name,
            r,
          ] as const
        )
      );
    const hStats =
      new Map(
        baseGirls.map(
          (r) => [
            r.name,
            r,
          ] as const
        )
      );

    const teams: Team[] =
      [];
    const K = Math.min(
      g.length,
      h.length
    );

    for (
      let baseIdx = 0;
      baseIdx < K;
      baseIdx += Math.max(
        2,
        groupSize
      )
    ) {
      const end =
        Math.min(
          baseIdx +
            Math.max(
              2,
              groupSize
            ),
          K
        );
      const girlsWindow =
        h.slice(
          baseIdx,
          end
        );
      const girlsShuffled =
        seedRandom
          ? shuffle(
              girlsWindow
            )
          : girlsWindow;
      for (
        let j =
          baseIdx;
        j < end;
        j++
      ) {
        const guy = g[j];
        const girl =
          girlsShuffled[
            j -
              baseIdx
          ];
        if (
          !guy ||
          !girl
        )
          continue;
        const name = `${guy.name} & ${girl.name}`;
        teams.push({
          id: `${div}-tmp-${
            j + 1
          }-${slug(
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

    const score = (
      t: Team
    ) => {
      const [a, b] =
        t.members;
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
        W:
          (aS.W || 0) +
          (bS.W || 0),
        PD:
          (aS.PD || 0) +
          (bS.PD || 0),
      };
    };

    teams.sort(
      (A, B) => {
        const sA =
          score(A);
        const sB =
          score(B);
        return (
          sB.W -
            sA.W ||
          sB.PD -
            sA.PD ||
          A.name.localeCompare(
            B.name
          )
        );
      }
    );

    teams.forEach(
      (t, i) => {
        t.seed = i + 1;
        t.id = `${div}-${
          t.seed
        }-${slug(
          t.name
        )}`;
      }
    );

    return teams;
  }

  function onBuild() {
    const upperTeams =
      build(
        "UPPER",
        {
          start: 0,
          end: upperK,
        },
        {
          start: 0,
          end: upperK,
        }
      );
    const lowerTeams =
      build(
        "LOWER",
        {
          start: upperK,
          end: guysRows.length,
        },
        {
          start: upperK,
          end: girlsRows.length,
        }
      );
    const upperMain =
      buildBracket(
        "UPPER",
        upperTeams,
        byeUpper
      );
    const lowerMain =
      buildBracket(
        "LOWER",
        lowerTeams,
        byeLower
      );
    setBrackets(
      () => [
        ...upperMain,
        ...lowerMain,
      ]
    );
  }

  function buildCombinedRR() {
    setBrackets((prev) => {
      const main =
        prev.filter(
          (b) =>
            b.division ===
              "UPPER" ||
            b.division ===
              "LOWER"
        );
      const rrPruned =
        prev.filter(
          (b) =>
            b.division !==
            "RR"
        );

      const losers: Team[] =
        [];

      const decided =
        main.filter(
          (m) =>
            (m.round ===
              1 ||
              m.round ===
                2) &&
            m.team1 &&
            m.team2 &&
            typeof m.score ===
              "string" &&
            m.score.trim()
        );

      for (const m of decided) {
        const parsed =
          parseScore(
            m.score
          );
        if (!parsed)
          continue;
        const [a, b] =
          parsed;
        const winner =
          a > b
            ? m.team1
            : m.team2;
        const loser =
          a > b
            ? m.team2
            : m.team1;
        if (loser) {
          losers.push({
            id: `RR-carry-${
              losers.length +
              1
            }`,
            name:
              loser.name,
            members:
              loser.members,
            seed:
              losers.length +
              1,
            division:
              "RR",
          });
        }
        if (
          winner &&
          m.nextId &&
          m.nextSide
        ) {
          const parent =
            main.find(
              (x) =>
                x.id ===
                m.nextId
            );
          if (
            parent
          ) {
            if (
              m.nextSide ===
              "team1"
            )
              parent.team1 =
                winner;
            else
              parent.team2 =
                winner;
          }
        }
      }

      let rrTeams: Team[] =
        [];
      if (
        rrRandomize
      ) {
        const pool =
          losers.flatMap(
            (t) =>
              t.members
          );
        const names =
          uniq(
            pool
          ).filter(
            Boolean
          );
        const shuffled =
          shuffle(
            names
          );
        for (
          let i = 0;
          i <
          shuffled.length;
          i += 2
        ) {
          const a =
            shuffled[
              i
            ];
          const b =
            shuffled[
              i + 1
            ];
          if (!a || !b)
            break;
          const name = `${a} & ${b}`;
          rrTeams.push({
            id: `RR-${
              i / 2 +
              1
            }-${slug(
              name
            )}`,
            name,
            members: [
              a,
              b,
            ],
            seed:
              i / 2 +
              1,
            division:
              "RR",
          });
        }
      } else {
        rrTeams =
          losers;
      }

      const rrBracket =
        buildBracket(
          "RR",
          rrTeams,
          0
        );
      return [
        ...rrPruned,
        ...rrBracket,
      ];
    });
  }

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-300 p-4 md:p-5">
      <h3 className="text-xl font-semibold text-sky-800 mb-2">
        Playoff Setup
      </h3>

      {(guyTieGroups.length >
        0 ||
        girlTieGroups.length >
          0) && (
        <div className="mb-3 p-2.5 bg-sky-50 border border-sky-100 rounded-xl text-[11px] text-slate-700">
          <div className="font-semibold text-sky-800 mb-1">
            Manual Tiebreaks
            (for equal W &amp;
            PD)
          </div>
          <p className="mb-1">
            If players are
            still tied on
            record and point
            differential, enter
            a small tiebreak
            number.{" "}
            <strong>
              Lower
              number =
              higher seed
            </strong>
            . Use your
            rock-paper-scissors
            result or any
            agreed tiebreak.
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            {guyTieGroups.length >
              0 && (
              <div>
                <div className="font-semibold text-[10px] text-sky-700 mb-0.5">
                  Guys ties
                </div>
                {guyTieGroups.map(
                  (
                    group,
                    i
                  ) => (
                    <div
                      key={
                        i
                      }
                      className="flex flex-wrap gap-1 mb-1"
                    >
                      {group.map(
                        (
                          name
                        ) => (
                          <label
                            key={
                              name
                            }
                            className="flex items-center gap-1 bg-white/90 border border-sky-100 rounded px-1.5 py-0.5"
                          >
                            <span className="truncate max-w-[90px]">
                              {
                                name
                              }
                            </span>
                            <input
                              type="number"
                              className="w-10 border border-slate-200 rounded px-1 py-0.5 text-[10px]"
                              value={
                                tieAdjust[
                                  name
                                ] ??
                                ""
                              }
                              onChange={(
                                e
                              ) =>
                                setTieAdjust(
                                  (
                                    prev
                                  ) => ({
                                    ...prev,
                                    [name]:
                                      e
                                        .target
                                        .value
                                        ? Number(
                                            e
                                              .target
                                              .value
                                          )
                                        : 0,
                                  })
                                )
                              }
                              placeholder="0"
                              title="Lower = better seed"
                            />
                          </label>
                        )
                      )}
                    </div>
                  )
                )}
              </div>
            )}
            {girlTieGroups.length >
              0 && (
              <div>
                <div className="font-semibold text-[10px] text-sky-700 mb-0.5">
                  Girls ties
                </div>
                {girlTieGroups.map(
                  (
                    group,
                    i
                  ) => (
                    <div
                      key={
                        i
                      }
                      className="flex flex-wrap gap-1 mb-1"
                    >
                      {group.map(
                        (
                          name
                        ) => (
                          <label
                            key={
                              name
                            }
                            className="flex items-center gap-1 bg-white/90 border border-sky-100 rounded px-1.5 py-0.5"
                          >
                            <span className="truncate max-w-[90px]">
                              {
                                name
                              }
                            </span>
                            <input
                              type="number"
                              className="w-10 border border-slate-200 rounded px-1 py-0.5 text-[10px]"
                              value={
                                tieAdjust[
                                  name
                                ] ??
                                ""
                              }
                              onChange={(
                                e
                              ) =>
                                setTieAdjust(
                                  (
                                    prev
                                  ) => ({
                                    ...prev,
                                    [name]:
                                      e
                                        .target
                                        .value
                                        ? Number(
                                            e
                                              .target
                                              .value
                                          )
                                        : 0,
                                  })
                                )
                              }
                              placeholder="0"
                              title="Lower = better seed"
                            />
                          </label>
                        )
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            Upper size (per
            gender)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={1}
              value={upperK}
              onChange={(e) =>
                setUpperK(
                  clampN(
                    +e.target
                      .value ||
                      1,
                    1
                  )
                )
              }
            />
          </label>
          <label className="flex items-center gap-2">
            Pairing window
            (group shuffle)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={2}
              value={groupSize}
              onChange={(e) =>
                setGroupSize(
                  clampN(
                    +e.target
                      .value ||
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
              checked={
                seedRandom
              }
              onChange={(e) =>
                setSeedRandom(
                  e.target
                    .checked
                )
              }
            />
            Randomize within
            window
          </label>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            Top BYEs (Upper)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={0}
              value={
                byeUpper
              }
              onChange={(e) =>
                setByeUpper(
                  clampN(
                    +e.target
                      .value ||
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
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={0}
              value={
                byeLower
              }
              onChange={(e) =>
                setByeLower(
                  clampN(
                    +e.target
                      .value ||
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
              checked={
                rrRandomize
              }
              onChange={(e) =>
                setRrRandomize(
                  e.target
                    .checked
                )
              }
            />
            RR: allow partner
            re-randomize
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          onClick={onBuild}
        >
          Build Upper &amp;
          Lower
        </button>
        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
          onClick={
            buildCombinedRR
          }
        >
          Build Redemption
          Rally
        </button>
      </div>

      <p className="text-xs text-slate-600 mt-2">
        Seeding uses{" "}
        <strong>
          Wins →
          PD →
          manual tiebreak
        </strong>{" "}
        from above.
        Teams are formed from
        those ordered lists
        and seeded by combined
        W+PD of both partners.
      </p>
    </section>
  );
}

/* ========================= Root App ========================= */

export default function BlindDrawTourneyApp() {
  const [guysText, setGuysText] =
    useState("");
  const [girlsText, setGirlsText] =
    useState("");
  const [matches, setMatches] =
    useState<MatchRow[]>([]);
  const [brackets, setBrackets] =
    useState<BracketMatch[]>([]);
  const [tieAdjust, setTieAdjust] =
    useState<Record<
      string,
      number
    >>({});

  // Load from autosave
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(
          "sunnysports.autosave"
        );
      if (!raw) return;
      const data =
        JSON.parse(raw);
      if (
        typeof data.guysText ===
        "string"
      )
        setGuysText(
          data.guysText
        );
      if (
        typeof data.girlsText ===
        "string"
      )
        setGirlsText(
          data.girlsText
        );
      if (
        Array.isArray(
          data.matches
        )
      )
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
      if (
        data.tieAdjust &&
        typeof data.tieAdjust ===
          "object"
      )
        setTieAdjust(
          data.tieAdjust
        );
    } catch {
      // ignore
    }
  }, []);

  // Save to autosave
  useEffect(() => {
    const snapshot =
      JSON.stringify({
        guysText,
        girlsText,
        matches,
        brackets,
        tieAdjust,
      });
    localStorage.setItem(
      "sunnysports.autosave",
      snapshot
    );
  }, [
    guysText,
    girlsText,
    matches,
    brackets,
    tieAdjust,
  ]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-100 via-sky-200 to-sky-300 text-slate-800 antialiased">
      <header className="sticky top-0 z-20 bg-sky-900/95 text-sky-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <SunnyLogo />
          <div className="text-right">
            <div className="text-[12px] font-semibold">
              Tournament Control Panel
            </div>
            <div className="text-[10px] text-sky-200">
              Live blind draw · pool
              play · playoffs ·
              redemption rally
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Leaderboard */}
        <Leaderboard
          matches={matches}
          guysText={guysText}
          girlsText={girlsText}
          tieAdjust={tieAdjust}
        />

        {/* Matches */}
        <MatchesView
          matches={matches}
          setMatches={
            setMatches
          }
        />

        {/* Generator */}
        <RoundGenerator
          guysText={guysText}
          girlsText={girlsText}
          matches={matches}
          setMatches={
            setMatches
          }
        />

        {/* Players */}
        <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-300 p-4">
          <h2 className="text-xl font-semibold text-sky-800 mb-2">
            Players
          </h2>
          <p className="text-xs text-slate-600 mb-2">
            Paste your rosters here.
            Duplicates highlight in
            red. These drive round
            generation, standings,
            and playoff seeding.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <LinedTextarea
              id="guys"
              label="Guys"
              value={guysText}
              onChange={(e) =>
                setGuysText(
                  e.target
                    .value
                )
              }
            />
            <LinedTextarea
              id="girls"
              label="Girls"
              value={girlsText}
              onChange={(e) =>
                setGirlsText(
                  e.target
                    .value
                )
              }
            />
          </div>
        </section>

        {/* Playoffs */}
        <PlayoffBuilder
          matches={matches}
          guysText={guysText}
          girlsText={girlsText}
          setBrackets={
            setBrackets
          }
          tieAdjust={
            tieAdjust
          }
          setTieAdjust={
            setTieAdjust
          }
        />
        <BracketView
          brackets={
            brackets
          }
          setBrackets={
            setBrackets
          }
        />

        {/* Data & reset */}
        <section className="bg-white/85 rounded-xl p-3 text-[10px] text-slate-600 border border-sky-200">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-2 py-1 border border-red-300 text-red-600 rounded-md hover:bg-red-50"
              onClick={() => {
                if (
                  confirm(
                    "Clear all data and reset the app?"
                  )
                ) {
                  localStorage.removeItem(
                    "sunnysports.autosave"
                  );
                  location.reload();
                }
              }}
            >
              Reset App &amp;
              Clear Autosave
            </button>
            <span>
              Autosave is always
              on in this browser.
              For now, use one
              main device or
              copy state if
              needed.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

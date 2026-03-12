import React, { useMemo, useState } from 'react';
import type { QuadsMatchRow, BracketMatch, PlayDiv, Team } from '../types';
import { slug, clampN, shuffle } from '../utils';
import { buildBracket } from '../components/BracketView';
import { computeQuadsStandingsFull, QuadsPlayerRow } from './Leaderboard';

function buildQuadsPlayoffTeams(pool: QuadsPlayerRow[], _unused: boolean): Team[] {
  const teams: Team[] = [];
  const guys = pool.filter(p => p.gender === 'M');
  const girls = pool.filter(p => p.gender === 'F');
  const K = Math.min(Math.floor(guys.length / 2), Math.floor(girls.length / 2));

  for (let i = 0; i < K; i++) {
    const members = [
      guys[i * 2]?.name || '',
      guys[i * 2 + 1]?.name || '',
      girls[i * 2]?.name || '',
      girls[i * 2 + 1]?.name || '',
    ].filter(Boolean);

    const name = members.join(' / ') || `Team ${i + 1}`;
    teams.push({
      id: `Q-tmp-${i + 1}-${slug(name)}`,
      name,
      members,
      seed: i + 1,
      division: 'UPPER',
    });
  }

  return teams;
}

export function QuadsPlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
}: {
  matches: QuadsMatchRow[];
  guysText: string;
  girlsText: string;
  setBrackets: (f: (prev: BracketMatch[]) => BracketMatch[] | BracketMatch[]) => void;
}) {
  const { guysRows, girlsRows, allRows } = useMemo(
    () => computeQuadsStandingsFull(matches, guysText, girlsText),
    [matches, guysText, girlsText]
  );

  type Mode = "COMBINED" | "SPLIT";
  const [mode, setMode] = useState<Mode>("COMBINED");
  const [totalPlayers, setTotalPlayers] = useState<number>(16);
  const [perGender, setPerGender] = useState<number>(4);
  const [seedRandom, setSeedRandom] = useState<boolean>(true);

  const [selectedPool, setSelectedPool] = useState<QuadsPlayerRow[]>([]);
  const [editTeams, setEditTeams] = useState<{ id: string; members: string[] }[]>([]);

  const buildPool = (): QuadsPlayerRow[] => {
    if (mode === "COMBINED") {
      const n = clampN(totalPlayers, 4);
      const limited = Math.min(n, allRows.length);
      return allRows.slice(0, limited);
    } else {
      const k = clampN(perGender, 1);
      const guysSel = guysRows.slice(0, k).map((r) => ({ ...r, gender: "M" as const }));
      const girlsSel = girlsRows.slice(0, k).map((r) => ({ ...r, gender: "F" as const }));
      return [...guysSel, ...girlsSel];
    }
  };

  const onGenerateTeams = () => {
    let pool = buildPool();

    if (pool.length < 4) {
      alert("Not enough players to build a quads bracket.");
      return;
    }

    if (seedRandom) {
      pool = shuffle(pool);
    }

    const teams = buildQuadsPlayoffTeams(pool, false);
    if (!teams.length) return;

    const editable = teams.map((t) => ({
      id: t.id,
      members: [...t.members, "", "", "", ""].slice(0, 4),
    }));

    setSelectedPool(pool);
    setEditTeams(editable);
  };

  const onBuildBracketFromTeams = () => {
    if (!editTeams.length) {
      alert("Generate teams first, then build the bracket.");
      return;
    }

    const incomplete = editTeams.some(
      (t) => t.members.filter((m) => m && m.trim()).length !== 4
    );
    if (incomplete) {
      alert("Every quads team must have 4 players before building the bracket.");
      return;
    }

    const statMap = new Map<string, { W: number; PD: number }>();
    guysRows.forEach((r) => statMap.set(r.name, { W: r.W, PD: r.PD }));
    girlsRows.forEach((r) => statMap.set(r.name, { W: r.W, PD: r.PD }));

    const scored = editTeams.map((t, idx) => {
      const members = t.members.map((m) => m.trim()).filter(Boolean);
      const W = members.reduce((s, n) => s + (statMap.get(n)?.W ?? 0), 0);
      const PD = members.reduce((s, n) => s + (statMap.get(n)?.PD ?? 0), 0);
      const name = members.join(" / ") || `Team ${idx + 1}`;

      return {
        team: {
          id: `Q-temp-${idx}`,
          name,
          members,
          seed: 0,
          division: "UPPER" as PlayDiv,
        } as Team,
        W,
        PD,
      };
    });

    scored.sort(
      (a, b) =>
        b.W - a.W ||
        b.PD - a.PD ||
        a.team.name.localeCompare(b.team.name)
    );

    scored.forEach((entry, i) => {
      entry.team.seed = i + 1;
      entry.team.id = `Q-${entry.team.seed}-${slug(entry.team.name)}`;
    });

    const finalTeams = scored.map((s) => s.team);
    const bracket = buildBracket("UPPER", finalTeams);
    setBrackets(() => bracket);
  };

  const clearTeams = () => {
    setSelectedPool([]);
    setEditTeams([]);
  };

  const handleMemberChange = (teamIdx: number, slotIdx: number, value: string) => {
    setEditTeams((prev) =>
      prev.map((t, i) =>
        i === teamIdx
          ? {
            ...t,
            members: t.members.map((m, j) => (j === slotIdx ? value : m)),
          }
          : t
      )
    );
  };

  const poolNames = selectedPool.map((p) => p.name);

  const allChosenNames = editTeams.flatMap((t) => t.members.filter(Boolean));
  const dupNames = Array.from(
    new Set(
      allChosenNames.filter((name, idx) => allChosenNames.indexOf(name) !== idx)
    )
  );

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h2 className="text-[16px] font-semibold text-sky-800 mb-2">
        Playoff Builder (Quads)
      </h2>

      <p className="text-[11px] text-slate-500 mb-3">
        Build quads playoff teams from standings, then edit teams before creating the bracket.
      </p>

      <div className="grid md:grid-cols-2 gap-4 text-[12px]">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">Selection mode</span>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "COMBINED"}
                onChange={() => setMode("COMBINED")}
              />
              <span>
                Combined leaderboard – top{" "}
                <input
                  type="number"
                  min={4}
                  step={4}
                  className="w-16 border rounded px-1 py-0.5 mx-1"
                  value={totalPlayers}
                  onChange={(e) => setTotalPlayers(clampN(+e.target.value || 4, 4))}
                />
                players
              </span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "SPLIT"}
                onChange={() => setMode("SPLIT")}
              />
              <span>
                Top{" "}
                <input
                  type="number"
                  min={1}
                  className="w-12 border rounded px-1 py-0.5 mx-1"
                  value={perGender}
                  onChange={(e) => setPerGender(clampN(+e.target.value || 1, 1))}
                />{" "}
                guys + top {perGender} girls
              </span>
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={seedRandom}
              onChange={(e) => setSeedRandom(e.target.checked)}
            />
            Randomize selected pool first
          </label>

          <div className="flex items-center gap-2 mt-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-[13px]"
              onClick={onGenerateTeams}
            >
              Generate Teams
            </button>

            {editTeams.length > 0 && (
              <button
                className="px-2 py-1 rounded border text-[11px]"
                onClick={clearTeams}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6 text-[11px] text-slate-600">
          <div>
            <span className="font-semibold">Quads standings snapshot:</span>
            <div className="mt-1">Guys: <span className="font-medium">{guysRows.length}</span></div>
            <div>Girls: <span className="font-medium">{girlsRows.length}</span></div>
            <div>Combined: <span className="font-medium">{allRows.length}</span></div>
          </div>
        </div>
      </div>

      {selectedPool.length > 0 && (
        <div className="mt-4 border-t pt-3 text-[11px] text-slate-600">
          <div className="font-semibold mb-1">
            Selected playoff players ({selectedPool.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedPool.map((p) => (
              <span
                key={p.name}
                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200"
              >
                {p.name}{" "}
                <span className="text-[10px] text-slate-500">
                  ({p.gender} · {p.W}-{p.L} · PD {p.PD})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {editTeams.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[12px] font-semibold text-slate-700">
              Edit quads teams before building bracket
            </div>
            <button
              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm text-[12px]"
              onClick={onBuildBracketFromTeams}
            >
              Build Bracket
            </button>
          </div>

          {dupNames.length > 0 && (
            <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Warning: duplicate players on teams — {dupNames.join(", ")}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3 text-[12px]">
            {editTeams.map((team, tIdx) => (
              <div
                key={team.id || tIdx}
                className="border rounded-lg p-2 bg-slate-50/60"
              >
                <div className="font-semibold text-slate-700 mb-1">
                  Team {tIdx + 1}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {team.members.map((member, mIdx) => (
                    <div key={mIdx} className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500">
                        Player {mIdx + 1}
                      </span>
                      <select
                        className="border rounded px-1 py-1 text-[12px] bg-white"
                        value={member}
                        onChange={(e) =>
                          handleMemberChange(tIdx, mIdx, e.target.value)
                        }
                      >
                        <option value="">— choose —</option>
                        {poolNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

import React, { useMemo, useState } from 'react';
import type { KobGameRow, PlayerStats } from '../types';
import { slug, uniq, isScoredGame, computeStandings } from '../utils';
import { generateRoundRobinSchedule, totalPartnerships } from './roundRobin';

// ── Finals game builder using round-robin engine ────────────────────────────

function buildFinalsGames(
  finalists: string[],
  label: KobGameRow['finalsLabel'],
  poolNum: number,
  court: number,
  gamesPerPlayer: number | 'all',
  courts: number,
): KobGameRow[] {
  const n = finalists.length;
  if (n < 4) return [];

  const maxCourts = Math.floor(n / 4);
  const actualCourts = Math.min(courts, maxCourts);
  const activePerRound = actualCourts * 4;

  // Calculate rounds needed
  const targetRounds = gamesPerPlayer === 'all'
    ? ('all' as const)
    : Math.ceil((gamesPerPlayer * n) / activePerRound);

  const { rounds } = generateRoundRobinSchedule(n, targetRounds, true, actualCourts);

  const games: KobGameRow[] = [];
  const ts = Date.now();
  let gameNum = 0;

  for (const round of rounds) {
    for (const g of round.games) {
      gameNum++;
      const sitOut: string | string[] | undefined =
        round.sitters.length === 0 ? undefined :
        round.sitters.length === 1 ? finalists[round.sitters[0]] :
        round.sitters.map(i => finalists[i]);

      games.push({
        id: `finals-${poolNum}-g${gameNum}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
        pool: poolNum,
        game: gameNum,
        t1: [finalists[g.t1[0]], finalists[g.t1[1]]] as [string, string],
        t2: [finalists[g.t2[0]], finalists[g.t2[1]]] as [string, string],
        court: court + g.courtOffset,
        scoreText: '',
        isFinals: true,
        finalsLabel: label,
        ...(g.courtOffset === 0 && sitOut !== undefined ? { sitOut } : {}),
      });
    }
  }

  return games;
}

// ── Bracket panel ─────────────────────────────────────────────────────────────

function BracketPanel({
  title,
  tier,
  accentClass,
  borderClass,
  finalists,
  existingGames,
  defaultCourt,
  isAdmin,
  onGenerate,
  onClear,
}: {
  title: string;
  tier: 'gold' | 'silver';
  accentClass: string;
  borderClass: string;
  finalists: PlayerStats[];
  existingGames: KobGameRow[];
  defaultCourt: number;
  isAdmin?: boolean;
  onGenerate: (finalists: string[], court: number, gamesPerPlayer: number | 'all', courts: number) => void;
  onClear: () => void;
}) {
  const [court, setCourt] = useState(defaultCourt);
  const [gamesMode, setGamesMode] = useState<'all' | 'custom'>('all');
  const [gamesStr, setGamesStr] = useState('4');
  const [courtsStr, setCourtsStr] = useState('1');

  const hasFinals = existingGames.length > 0;
  const scoredCount = existingGames.filter(g => isScoredGame(g.scoreText)).length;
  const allScored = hasFinals && scoredCount === existingGames.length;

  const playerCount = finalists.length;
  const finalistNames = finalists.map(s => s.name);
  const ready = playerCount >= 4;

  const maxCourts = Math.floor(playerCount / 4);
  const courts = Math.max(1, Math.min(maxCourts || 1, parseInt(courtsStr) || 1));
  const gamesPerPlayer = gamesMode === 'all' ? ('all' as const) : Math.max(1, parseInt(gamesStr) || 1);

  // Preview calculations
  const activePerRound = courts * 4;
  const sittersPerRound = playerCount - activePerRound;
  const totalPoss = totalPartnerships(playerCount);
  const previewRounds = gamesPerPlayer === 'all'
    ? null // can't easily calculate without running the algorithm
    : Math.ceil((gamesPerPlayer * playerCount) / activePerRound);
  const previewTotalGames = previewRounds ? previewRounds * courts : null;

  // Check if games divide evenly
  const isExact = previewRounds
    ? (previewRounds * activePerRound) === ((typeof gamesPerPlayer === 'number' ? gamesPerPlayer : 0) * playerCount)
    : true;

  return (
    <div className={`border-2 ${borderClass} rounded-xl p-4`}>
      <div className={`font-bold text-[14px] mb-1 ${accentClass}`}>{title}</div>

      {hasFinals ? (
        <div className="space-y-2">
          <div className={`text-[12px] font-medium ${allScored ? 'text-emerald-700' : 'text-slate-600'}`}>
            {allScored ? '✓ Complete' : `${scoredCount}/${existingGames.length} games scored`}
          </div>
          <div className="text-[11px] text-slate-500">
            Finalists: {Array.from(new Set(existingGames.flatMap(g => [...g.t1, ...g.t2]))).join(', ')}
          </div>
          {isAdmin && (
            <button
              className="text-[11px] px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Clear ${title} and regenerate?`)) onClear();
              }}
            >
              Regenerate
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!ready ? (
            <p className="text-[12px] text-slate-400 italic">
              Not enough players with pool play results ({finalists.length} available, need at least 4).
            </p>
          ) : (
            <>
              {/* Controls row */}
              <div className="flex items-center gap-3 flex-wrap text-[12px]">
                <span className="text-slate-600 font-medium">{playerCount} players</span>

                <div className="flex gap-1 bg-slate-50 border rounded-lg p-0.5">
                  <button
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      gamesMode === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => setGamesMode('all')}
                  >
                    Play with everyone
                  </button>
                  <button
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      gamesMode === 'custom' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => setGamesMode('custom')}
                  >
                    Choose games
                  </button>
                </div>

                {gamesMode === 'custom' && (
                  <label className="flex items-center gap-1.5">
                    <span className="text-slate-600 font-medium">Games/player:</span>
                    <input
                      type="number" min={1}
                      value={gamesStr}
                      onChange={e => setGamesStr(e.target.value)}
                      className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
                    />
                  </label>
                )}

                <label className="flex items-center gap-1.5">
                  <span className="text-slate-600 font-medium">Courts:</span>
                  <input
                    type="number" min={1} max={maxCourts}
                    value={courtsStr}
                    onChange={e => setCourtsStr(e.target.value)}
                    className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
                  />
                </label>

                <label className="flex items-center gap-1">
                  <span className="text-slate-600 font-medium text-[11px]">Start ct:</span>
                  <input
                    type="number" min={1} value={court}
                    onChange={e => setCourt(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 border rounded px-2 py-1 text-[12px]"
                    disabled={!isAdmin}
                  />
                </label>
              </div>

              {/* Preview summary */}
              <div className="text-[11px] text-slate-500">
                {playerCount} players · {courts} court{courts !== 1 ? 's' : ''}
                {sittersPerRound > 0 && ` · ${sittersPerRound} sit/round`}
                {previewRounds && ` · ${previewRounds} rounds · ${previewTotalGames} total games`}
                {gamesMode === 'custom' && previewRounds && (
                  isExact
                    ? ` · ${gamesPerPlayer} games each`
                    : ` · ${gamesPerPlayer}–${(gamesPerPlayer as number) + 1} games each`
                )}
                {gamesMode === 'all' && ` · ${totalPoss} partnerships to cover`}
              </div>

              {/* Player list (read-only — ranked by standings) */}
              <div className="space-y-0.5">
                {finalistNames.map((name, i) => {
                  const s = finalists[i];
                  const pd = s.PF - s.PA;
                  return (
                    <div
                      key={name}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-[12px] ${
                        tier === 'gold' ? 'bg-amber-50' : 'bg-slate-100'
                      }`}
                    >
                      <span className="w-5 text-slate-400 tabular-nums text-right shrink-0">{i + 1}.</span>
                      <span className="font-medium flex-1">{name}</span>
                      <span className="text-slate-500 tabular-nums text-[11px]">{s.W}W {s.L}L</span>
                      <span className={`tabular-nums text-[11px] ${pd > 0 ? 'text-emerald-600' : pd < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {pd > 0 ? '+' : ''}{pd}
                      </span>
                    </div>
                  );
                })}
              </div>

              {isAdmin && (
                <button
                  className={`px-3 py-1.5 rounded-lg shadow-sm text-[12px] font-semibold disabled:opacity-40 text-white ${
                    tier === 'gold' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-500 hover:bg-slate-600'
                  }`}
                  onClick={() => onGenerate(finalistNames, court, gamesPerPlayer, courts)}
                  disabled={!ready}
                >
                  Generate {title}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Per-gender section (Gold + Silver) ────────────────────────────────────────

function GenderSection({
  genderLabel,
  isKob,
  poolGames,
  roster,
  allGames,
  setGames,
  isAdmin,
  goldPoolNum,
  silverPoolNum,
}: {
  genderLabel: string;
  isKob: boolean;
  poolGames: KobGameRow[];
  roster: string[];
  allGames: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  isAdmin?: boolean;
  goldPoolNum: number;
  silverPoolNum: number;
}) {
  const [goldSize, setGoldSize] = useState(8);
  const overallStandings = useMemo(() => computeStandings(poolGames, roster), [poolGames, roster]);

  // Split: top goldSize go to Gold, rest go to Silver
  const goldFinalists = overallStandings.slice(0, goldSize);
  const silverFinalists = overallStandings.slice(goldSize);

  const goldGames = allGames.filter(g => g.pool === goldPoolNum);
  const silverGames = allGames.filter(g => g.pool === silverPoolNum);

  const generateGold = (finalists: string[], court: number, gamesPerPlayer: number | 'all', courts: number) => {
    const label: KobGameRow['finalsLabel'] = isKob ? 'Gold KOB' : 'Gold QOB';
    const newGames = buildFinalsGames(finalists, label, goldPoolNum, court, gamesPerPlayer, courts);
    setGames(prev => [...prev.filter(g => g.pool !== goldPoolNum), ...newGames]);
  };

  const generateSilver = (finalists: string[], court: number, gamesPerPlayer: number | 'all', courts: number) => {
    const label: KobGameRow['finalsLabel'] = isKob ? 'Silver KOB' : 'Silver QOB';
    const newGames = buildFinalsGames(finalists, label, silverPoolNum, court, gamesPerPlayer, courts);
    setGames(prev => [...prev.filter(g => g.pool !== silverPoolNum), ...newGames]);
  };

  const hasBrackets = goldGames.length > 0 || silverGames.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`font-semibold text-[13px] ${isKob ? 'text-blue-700' : 'text-pink-700'}`}>
          {genderLabel}
        </span>
        <span className="text-[11px] text-slate-500">
          {overallStandings.length} players ranked
        </span>
        {!hasBrackets && overallStandings.length >= 4 && (
          <label className="flex items-center gap-1.5 text-[12px]">
            <span className="text-slate-600 font-medium">Gold bracket size:</span>
            <input
              type="number" min={4} max={overallStandings.length}
              value={goldSize}
              onChange={e => setGoldSize(Math.max(4, parseInt(e.target.value) || 4))}
              className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] text-center font-semibold"
            />
            <span className="text-[11px] text-slate-400">
              (top {goldSize} → Gold{silverFinalists.length >= 4 ? `, remaining ${silverFinalists.length} → Silver` : ''})
            </span>
          </label>
        )}
      </div>

      {/* Gold bracket */}
      <BracketPanel
        title={isKob ? 'Gold — King of the Beach' : 'Gold — Queen of the Beach'}
        tier="gold"
        accentClass={isKob ? 'text-blue-700' : 'text-pink-700'}
        borderClass={isKob ? 'border-blue-200' : 'border-pink-200'}
        finalists={goldFinalists}
        existingGames={goldGames}
        defaultCourt={isKob ? 1 : 2}
        isAdmin={isAdmin}
        onGenerate={generateGold}
        onClear={() => setGames(prev => prev.filter(g => g.pool !== goldPoolNum))}
      />

      {/* Silver bracket — only show if enough remaining players */}
      {(silverFinalists.length >= 4 || silverGames.length > 0) && (
        <BracketPanel
          title={isKob ? 'Silver — Consolation KOB' : 'Silver — Consolation QOB'}
          tier="silver"
          accentClass="text-slate-600"
          borderClass="border-slate-300"
          finalists={silverFinalists}
          existingGames={silverGames}
          defaultCourt={isKob ? 3 : 4}
          isAdmin={isAdmin}
          onGenerate={generateSilver}
          onClear={() => setGames(prev => prev.filter(g => g.pool !== silverPoolNum))}
        />
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function KobFinalsGenerator({
  games,
  setGames,
  guysText,
  girlsText,
  isAdmin,
}: {
  games: KobGameRow[];
  setGames: (f: (prev: KobGameRow[]) => KobGameRow[]) => void;
  guysText: string;
  girlsText: string;
  isAdmin?: boolean;
}) {
  const guys = useMemo(
    () => uniq((guysText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [guysText],
  );
  const girls = useMemo(
    () => uniq((girlsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)),
    [girlsText],
  );

  // KOB pool play = pools 1–499; QOB = pools 501–999
  const kobPoolGames = useMemo(() => games.filter(g => !g.isFinals && g.pool >= 1   && g.pool <= 499), [games]);
  const qobPoolGames = useMemo(() => games.filter(g => !g.isFinals && g.pool >= 501 && g.pool <= 999), [games]);

  const hasKob = kobPoolGames.length > 0;
  const hasQob = qobPoolGames.length > 0;
  if (!hasKob && !hasQob) return null;

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="mb-3">
        <h3 className="text-[16px] font-semibold text-sky-800">Finals Generator (KOB / QOB)</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Set players, games per player, and courts for each bracket. Players are seeded by pool play standings.
        </p>
      </div>

      <div className={`space-y-6 ${hasKob && hasQob ? 'divide-y divide-slate-100' : ''}`}>
        {hasKob && (
          <GenderSection
            genderLabel="Men — KOB"
            isKob={true}
            poolGames={kobPoolGames}
            roster={guys}
            allGames={games}
            setGames={setGames}
            isAdmin={isAdmin}
            goldPoolNum={1001}
            silverPoolNum={1011}
          />
        )}
        {hasQob && (
          <div className={hasKob ? 'pt-6' : ''}>
            <GenderSection
              genderLabel="Women — QOB"
              isKob={false}
              poolGames={qobPoolGames}
              roster={girls}
              allGames={games}
              setGames={setGames}
              isAdmin={isAdmin}
              goldPoolNum={1002}
              silverPoolNum={1012}
            />
          </div>
        )}
      </div>
    </section>
  );
}

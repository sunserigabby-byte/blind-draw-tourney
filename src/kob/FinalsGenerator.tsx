import React, { useMemo, useState } from 'react';
import type { KobGameRow, PlayerStats } from '../types';
import { slug, uniq, parseScore, isValidKobScore, computeStandings } from '../utils';
import { SCHEDULES, POOL_INFO, VALID_SIZES, poolInfoLabel } from './schedules';
import type { ValidSize } from './schedules';

// ── Finals game builder (works with any size 4–8) ────────────────────────────

function buildFinalsGames(
  finalists: string[],
  label: KobGameRow['finalsLabel'],
  poolNum: number,
  court: number,
): KobGameRow[] {
  const schedule = SCHEDULES[finalists.length];
  if (!schedule) return [];
  const ts = Date.now();
  return schedule.map((entry, gi) => ({
    id: `finals-${poolNum}-g${gi + 1}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
    pool: poolNum,
    game: gi + 1,
    t1: [finalists[entry.t1[0]], finalists[entry.t1[1]]] as [string, string],
    t2: [finalists[entry.t2[0]], finalists[entry.t2[1]]] as [string, string],
    court: court + entry.courtOffset,
    scoreText: '',
    isFinals: true,
    finalsLabel: label,
    ...(entry.sitters.length === 1
      ? { sitOut: finalists[entry.sitters[0]] }
      : entry.sitters.length > 1
        ? { sitOut: entry.sitters.map(i => finalists[i]) }
        : {}),
  }));
}

// ── Bracket panel (read-only player list + generate button) ─────────────────

function BracketPanel({
  title,
  tier,
  accentClass,
  borderClass,
  finalists,
  existingGames,
  defaultCourt,
  finalsSize,
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
  finalsSize: ValidSize;
  isAdmin?: boolean;
  onGenerate: (finalists: string[], court: number) => void;
  onClear: () => void;
}) {
  const [court, setCourt] = useState(defaultCourt);

  const hasFinals = existingGames.length > 0;
  const scoredCount = existingGames.filter(g => {
    const p = parseScore(g.scoreText);
    return p && isValidKobScore(p[0], p[1]);
  }).length;
  const allScored = hasFinals && scoredCount === existingGames.length;

  const finalistNames = finalists.slice(0, finalsSize).map(s => s.name);
  const ready = finalistNames.length === finalsSize;
  const info = POOL_INFO[finalsSize];
  const schedule = SCHEDULES[finalsSize];

  return (
    <div className={`border-2 ${borderClass} rounded-xl p-4`}>
      <div className={`font-bold text-[14px] mb-1 ${accentClass}`}>{title}</div>
      <div className="text-[10px] text-slate-400 mb-3">
        {finalsSize} players · {poolInfoLabel(finalsSize)}
      </div>

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
              Not enough players with pool play results ({finalists.length} available, need {finalsSize}).
            </p>
          ) : (
            <>
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

              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1 text-[12px]">
                  Court
                  <input
                    type="number" min={1} value={court}
                    onChange={e => setCourt(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border rounded px-2 py-1 text-[12px]"
                    disabled={!isAdmin}
                  />
                </label>
                {info && info.courts > 1 && (
                  <span className="text-[10px] text-slate-400">Uses courts {court} & {court + 1}</span>
                )}
                {isAdmin && (
                  <button
                    className={`px-3 py-1.5 rounded-lg shadow-sm text-[12px] font-semibold disabled:opacity-40 text-white ${
                      tier === 'gold' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-500 hover:bg-slate-600'
                    }`}
                    onClick={() => onGenerate(finalistNames, court)}
                  >
                    Generate {title}
                  </button>
                )}
              </div>

              {/* Schedule preview */}
              {schedule && (
                <div className="mt-1 border rounded-lg p-2 bg-slate-50 text-[11px]">
                  <div className="font-medium text-slate-600 mb-1">Schedule preview:</div>
                  {schedule.map((entry, gi) => (
                    <div key={gi} className="text-slate-500">
                      G{gi + 1}:{' '}
                      <span className="text-slate-700 font-medium">
                        {finalistNames[entry.t1[0]]} + {finalistNames[entry.t1[1]]}
                      </span>
                      {' '}vs{' '}
                      <span className="text-slate-700 font-medium">
                        {finalistNames[entry.t2[0]]} + {finalistNames[entry.t2[1]]}
                      </span>
                      {entry.sitters.length > 0 && (
                        <span className="text-slate-400 ml-1">
                          (sits: {entry.sitters.map(i => finalistNames[i]).join(', ')})
                        </span>
                      )}
                      {entry.courtOffset > 0 && (
                        <span className="text-slate-400 ml-1">· Court {court + entry.courtOffset}</span>
                      )}
                    </div>
                  ))}
                </div>
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
  const [goldSize, setGoldSize] = useState<ValidSize>(4);
  const [silverSize, setSilverSize] = useState<ValidSize>(4);

  const overallStandings = useMemo(() => computeStandings(poolGames, roster), [poolGames, roster]);

  // Top goldSize go to Gold; next silverSize go to Silver
  const goldFinalists = overallStandings.slice(0, goldSize);
  const silverFinalists = overallStandings.slice(goldSize, goldSize + silverSize);

  const goldGames = allGames.filter(g => g.pool === goldPoolNum);
  const silverGames = allGames.filter(g => g.pool === silverPoolNum);

  const generateGold = (finalists: string[], court: number) => {
    const label: KobGameRow['finalsLabel'] = isKob ? 'Gold KOB' : 'Gold QOB';
    const newGames = buildFinalsGames(finalists, label, goldPoolNum, court);
    setGames(prev => [...prev.filter(g => g.pool !== goldPoolNum), ...newGames]);
  };

  const generateSilver = (finalists: string[], court: number) => {
    const label: KobGameRow['finalsLabel'] = isKob ? 'Silver KOB' : 'Silver QOB';
    const newGames = buildFinalsGames(finalists, label, silverPoolNum, court);
    setGames(prev => [...prev.filter(g => g.pool !== silverPoolNum), ...newGames]);
  };

  const hasBrackets = goldGames.length > 0 || silverGames.length > 0;

  // How many remaining players after gold + silver
  const remaining = overallStandings.length - goldSize - silverSize;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`font-semibold text-[13px] ${isKob ? 'text-blue-700' : 'text-pink-700'}`}>
          {genderLabel}
        </span>
        <span className="text-[11px] text-slate-500">
          {overallStandings.length} players ranked
        </span>
      </div>

      {/* Size pickers */}
      <div className="flex items-center gap-4 flex-wrap text-[12px]">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-600 font-medium">Gold:</span>
          {VALID_SIZES.map(n => (
            <button key={n}
              className={`px-2 py-0.5 rounded border text-[11px] ${goldSize === n ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
              onClick={() => setGoldSize(n)}
              disabled={hasBrackets}
            >{n}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-600 font-medium">Silver:</span>
          {VALID_SIZES.map(n => (
            <button key={n}
              className={`px-2 py-0.5 rounded border text-[11px] ${silverSize === n ? 'bg-slate-500 text-white border-slate-500' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
              onClick={() => setSilverSize(n)}
              disabled={hasBrackets}
            >{n}</button>
          ))}
        </div>
      </div>

      {/* Cutoff summary */}
      {overallStandings.length > 0 && !hasBrackets && (
        <p className="text-[11px] text-slate-500">
          Top {goldSize} from standings go to Gold. Next {silverSize} go to Silver.
          {remaining > 0 &&
            ` ${remaining} player${remaining !== 1 ? 's' : ''} won't make finals.`}
          {remaining <= 0 && overallStandings.length > goldSize &&
            ` All remaining go to Silver.`}
        </p>
      )}

      {/* Gold bracket */}
      <BracketPanel
        title={isKob ? '🥇 Gold — King of the Beach' : '🥇 Gold — Queen of the Beach'}
        tier="gold"
        accentClass={isKob ? 'text-blue-700' : 'text-pink-700'}
        borderClass={isKob ? 'border-blue-200' : 'border-pink-200'}
        finalists={goldFinalists}
        existingGames={goldGames}
        defaultCourt={isKob ? 1 : 2}
        finalsSize={goldSize}
        isAdmin={isAdmin}
        onGenerate={generateGold}
        onClear={() => setGames(prev => prev.filter(g => g.pool !== goldPoolNum))}
      />

      {/* Silver bracket — always visible if enough players */}
      {(silverFinalists.length > 0 || silverGames.length > 0) && (
        <BracketPanel
          title={isKob ? '🥈 Silver — Consolation KOB' : '🥈 Silver — Consolation QOB'}
          tier="silver"
          accentClass="text-slate-600"
          borderClass="border-slate-300"
          finalists={silverFinalists}
          existingGames={silverGames}
          defaultCourt={isKob ? 3 : 4}
          finalsSize={silverSize}
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
          Choose bracket sizes below. Top players from standings fill Gold, next players fill Silver.
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

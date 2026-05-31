import React, { useEffect, useMemo, useState } from 'react';
import type { MickeyMatchRow, MickeyTeam, ScoreSettings } from '../types';
import { apiGetState, apiSaveState } from '../api';
import { parseScore, isValidScore, mickeyTeamLabel } from '../utils';
import { SunnyLogo } from './SunnyLogo';

const POLL_INTERVAL_MS = 3000;
const RECENT_EDIT_GRACE_MS = 1500;

type FoundMatch = {
  match: MickeyMatchRow;
  teams: MickeyTeam[];
  pairsText: string;
  source: 'MICKEY' | 'MICKEYBD';
  division: 'UPPER' | 'LOWER';
  roundLabel?: string; // "Round N" for BD; "Pool N" for M&M
};

// Look for a match anywhere in the global state. Returns the match plus the
// surrounding context (teams in its round/pool, pairs text for labels).
function findMatch(state: any, matchId: string): FoundMatch | null {
  // Regular Mickey & Minnie pool matches
  for (const div of ['UPPER', 'LOWER'] as const) {
    const tab = state?.mickey?.[div];
    if (tab && Array.isArray(tab.matches)) {
      const m = tab.matches.find((mm: MickeyMatchRow) => mm.id === matchId);
      if (m) {
        return {
          match: m,
          teams: tab.teams ?? [],
          pairsText: tab.pairsText ?? '',
          source: 'MICKEY',
          division: div,
          roundLabel: typeof m.pool === 'number' ? `Pool ${m.pool}` : undefined,
        };
      }
    }
  }
  // BD Mickey & Minnie rounds
  for (const div of ['UPPER', 'LOWER'] as const) {
    const tab = state?.mickeyBD?.[div];
    if (tab && Array.isArray(tab.rounds)) {
      for (const round of tab.rounds) {
        const m = round.matches?.find((mm: MickeyMatchRow) => mm.id === matchId);
        if (m) {
          return {
            match: m,
            teams: round.teams ?? [],
            pairsText: tab.pairsText ?? '',
            source: 'MICKEYBD',
            division: div,
            roundLabel: `Round ${round.number}`,
          };
        }
      }
    }
  }
  return null;
}

// Apply a partial patch to a match inside the state, returning a new state object.
function patchMatchInState(state: any, matchId: string, patch: Partial<MickeyMatchRow>): any {
  if (!state) return state;
  const next = JSON.parse(JSON.stringify(state));
  for (const div of ['UPPER', 'LOWER'] as const) {
    const tab = next?.mickey?.[div];
    if (tab?.matches) {
      tab.matches = tab.matches.map((m: MickeyMatchRow) =>
        m.id === matchId ? { ...m, ...patch } : m);
    }
    const bdTab = next?.mickeyBD?.[div];
    if (bdTab?.rounds) {
      bdTab.rounds = bdTab.rounds.map((r: any) => ({
        ...r,
        matches: (r.matches ?? []).map((m: MickeyMatchRow) =>
          m.id === matchId ? { ...m, ...patch } : m),
      }));
    }
  }
  return next;
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

const defaultScoreSettings: ScoreSettings = { playTo: 21, cap: null };

export function ScoreFocusPage({ matchId }: { matchId: string }) {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [lastEditAt, setLastEditAt] = useState(0);
  const [savingError, setSavingError] = useState<string>('');
  const [adminKey] = useState<string>(() => {
    try { return sessionStorage.getItem('ADMIN_KEY') || ''; } catch { return ''; }
  });
  const isAdmin = !!adminKey;

  // Load on mount, then poll for updates.
  useEffect(() => {
    let cancelled = false;
    let lastEditRef = lastEditAt;
    const load = async () => {
      try {
        const remote = await apiGetState();
        if (cancelled) return;
        if (Date.now() - lastEditRef < RECENT_EDIT_GRACE_MS) return; // skip if user typed recently
        setState(remote ?? null);
        setLoading(false);
        setError('');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load');
          setLoading(false);
        }
      }
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref-like reading of lastEditAt without re-running the effect
  useEffect(() => {
    (window as any).__lastScoreEdit = lastEditAt;
  }, [lastEditAt]);

  const found = useMemo(() => state ? findMatch(state, matchId) : null, [state, matchId]);

  const updateScore = (patch: Partial<MickeyMatchRow>) => {
    if (!isAdmin) return;
    setLastEditAt(Date.now());
    setState((prev: any) => {
      const next = patchMatchInState(prev, matchId, patch);
      // Save to server in background
      apiSaveState(next as any, adminKey)
        .then(() => setSavingError(''))
        .catch((e: any) => setSavingError(e?.message || 'Save failed'));
      return next;
    });
  };

  const back = () => {
    try { window.location.hash = ''; } catch {}
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-[14px]">Loading match…</div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-red-600 text-[14px]">Couldn't load: {error}</div>
      </main>
    );
  }
  if (!found) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="text-[16px] font-semibold text-slate-800">Match not found</div>
          <div className="text-[13px] text-slate-500">
            The link may be stale or pointing at a match that's been removed.
          </div>
          <button onClick={back} className="px-4 py-2 rounded bg-sky-700 text-white text-[13px]">
            Back to tournament
          </button>
        </div>
      </main>
    );
  }

  const { match, teams, pairsText, source, division, roundLabel } = found;
  const teamA = teams.find(t => t.id === match.teamAId);
  const teamB = teams.find(t => t.id === match.teamBId);
  const teamAName = teamA ? mickeyTeamLabel(teamA, pairsText) : '(deleted team)';
  const teamBName = teamB ? mickeyTeamLabel(teamB, pairsText) : '(deleted team)';

  // Which formats to render. M&M may use single-format matches; BD M&M is always combined.
  const formats: ('MICKEY' | 'MINNIE')[] = match.format ? [match.format] : ['MICKEY', 'MINNIE'];

  const sourceLabel = source === 'MICKEYBD' ? 'Mickey & Minnie Blind Draw' : 'Mickey & Minnie';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <SunnyLogo />
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            <button
              onClick={back}
              className="text-[12px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            {sourceLabel} · {division} Division{roundLabel ? ` · ${roundLabel}` : ''}
          </div>
          {match.format && (
            <div className="mt-1 inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded font-semibold bg-purple-100 text-purple-700">
              {match.format === 'MICKEY' ? 'Mickey set' : 'Minnie set'}
            </div>
          )}
          {!isAdmin && (
            <div className="mt-2 inline-block text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-700">
              Viewer mode — unlock editing in the main app to enter scores.
            </div>
          )}
          {savingError && (
            <div className="mt-2 inline-block text-[11px] text-red-600">
              Save error: {savingError}
            </div>
          )}
        </div>

        {/* Team A */}
        <ScoreCard
          teamName={teamAName}
          side="a"
          match={match}
          formats={formats}
          isAdmin={isAdmin}
          onScoreChange={(fmt, side, val) => {
            if (fmt === 'MICKEY') updateScore({ mickeyScore: setSide(match.mickeyScore, side, val) });
            else updateScore({ minnieScore: setSide(match.minnieScore, side, val) });
          }}
        />

        {/* Team B */}
        <ScoreCard
          teamName={teamBName}
          side="b"
          match={match}
          formats={formats}
          isAdmin={isAdmin}
          onScoreChange={(fmt, side, val) => {
            if (fmt === 'MICKEY') updateScore({ mickeyScore: setSide(match.mickeyScore, side, val) });
            else updateScore({ minnieScore: setSide(match.minnieScore, side, val) });
          }}
        />

        <p className="text-center text-[11px] text-slate-400">
          Scores save automatically and update on other phones within a few seconds.
        </p>
      </div>
    </main>
  );
}

function ScoreCard({
  teamName,
  side,
  match,
  formats,
  isAdmin,
  onScoreChange,
}: {
  teamName: string;
  side: 'a' | 'b';
  match: MickeyMatchRow;
  formats: ('MICKEY' | 'MINNIE')[];
  isAdmin: boolean;
  onScoreChange: (fmt: 'MICKEY' | 'MINNIE', side: 'a' | 'b', val: string) => void;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
      <div className="text-[15px] font-semibold text-slate-800 mb-3 break-words">{teamName}</div>
      <div className="grid grid-cols-2 gap-3">
        {formats.map(fmt => {
          const text = fmt === 'MICKEY' ? match.mickeyScore : match.minnieScore;
          const value = getSide(text, side);
          const parsed = parseScore(text);
          const scored = parsed && parsed[0] !== parsed[1];
          const winningSide = !scored ? null : parsed![0] > parsed![1] ? 'a' : 'b';
          const winning = winningSide === side;
          const valid = !text || (parsed ? isValidScore(parsed[0], parsed[1], defaultScoreSettings) : false);
          return (
            <div key={fmt} className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                {fmt === 'MICKEY' ? 'Mickey' : 'Minnie'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                className={
                  'w-24 h-20 text-center text-[36px] font-bold tabular-nums border-2 rounded-lg ' +
                  (winning ? 'bg-emerald-50 border-emerald-400 text-emerald-800 ' : 'border-slate-300 ') +
                  (!valid ? 'border-red-500 bg-red-50' : '')
                }
                value={value}
                onChange={e => onScoreChange(fmt, side, e.target.value.replace(/[^\d]/g, ''))}
                readOnly={!isAdmin}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

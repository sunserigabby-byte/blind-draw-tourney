import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRow, QuadsMatchRow, TriplesMatchRow, BracketMatch, KobGameRow, ScoreSettings, MickeyTeam, MickeyMatchRow } from './types';
import { apiGetState, apiSaveState } from './api';
import { SunnyLogo } from './components/SunnyLogo';
import { LineNumberTextarea } from './components/LinedTextarea';
import { BracketView } from './components/BracketView';
import { MatchesView } from './doubles/MatchesView';
import { RoundGenerator } from './doubles/RoundGenerator';
import { Leaderboard } from './doubles/Leaderboard';
import { PlayoffBuilder } from './doubles/PlayoffBuilder';
import { QuadsMatchesView } from './quads/MatchesView';
import { QuadsRoundGenerator } from './quads/RoundGenerator';
import { QuadsLeaderboard } from './quads/Leaderboard';
import { QuadsPlayoffBuilder } from './quads/PlayoffBuilder';
import { TriplesMatchesView } from './triples/MatchesView';
import { TriplesRoundGenerator } from './triples/RoundGenerator';
import { TriplesLeaderboard } from './triples/Leaderboard';
import { TriplesPlayoffBuilder } from './triples/PlayoffBuilder';
import { KobPoolGenerator } from './kob/PoolGenerator';
import { KobFinalsGenerator } from './kob/FinalsGenerator';
import { KobMatchesView } from './kob/MatchesView';
import { KobLeaderboard } from './kob/Leaderboard';
import { MickeyTeamBuilder } from './mickey/TeamBuilder';
import { MickeyMatchesView } from './mickey/MatchesView';
import { MickeyLeaderboard } from './mickey/Leaderboard';
import { MickeyPlayoffBuilder } from './mickey/PlayoffBuilder';
import { MickeyBracketView } from './mickey/BracketView';
import { MickeyBDRoundManager } from './mickeyBlind/RoundManager';
import { MickeyBDMatchesView } from './mickeyBlind/MatchesView';
import { MickeyBDLeaderboard } from './mickeyBlind/Leaderboard';
import { MickeyBDPlayoffBuilder } from './mickeyBlind/PlayoffBuilder';
import { ScoreSettingsPanel } from './components/ScoreSettingsPanel';
import { Sidebar, SIDEBAR_DIVISIONS, SIDEBAR_SECTIONS, type SidebarSection, type SidebarTabKey } from './components/Sidebar';
import { ThemeToggle, readStoredTheme, applyTheme, persistTheme, type Theme } from './components/ThemeToggle';
import { ScoreFocusPage } from './components/ScoreFocusPage';

type TabKey = SidebarTabKey;
type DivisionKey = "UPPER" | "LOWER";
type SectionKey = SidebarSection;

type DivisionState<TMatch> = { guysText: string; girlsText: string; matches: TMatch[]; brackets: BracketMatch[] };

function emptyDivisionState<TMatch>(): DivisionState<TMatch> {
  return { guysText: "", girlsText: "", matches: [], brackets: [] };
}

type MickeyDivisionState = {
  pairsText: string;
  freeAgentsText: string;
  teams: MickeyTeam[];
  matches: MickeyMatchRow[];
  brackets: BracketMatch[];
  courtCount?: number;
  firstFormat?: 'MICKEY' | 'MINNIE';
  // 'COMBINED' = single round-robin, each match plays both Mickey + Minnie
  // sets back-to-back (one match card with two score columns).
  // 'ALTERNATING' = double round-robin, round 1 all one format and round 2
  // the other (one set per match card).
  matchFormat?: 'COMBINED' | 'ALTERNATING';
};
function emptyMickeyState(): MickeyDivisionState {
  return {
    pairsText: "", freeAgentsText: "", teams: [], matches: [], brackets: [],
    courtCount: 1, firstFormat: 'MICKEY', matchFormat: 'ALTERNATING',
  };
}

// Mickey & Minnie Blind Draw — teams re-randomize every round, but pairs
// stay together within each round (same draw algorithm as fixed M&M).
type MickeyBDRound = {
  id: string;
  number: number;
  teams: MickeyTeam[];
  matches: MickeyMatchRow[];
};
type MickeyBDDivisionState = {
  pairsText: string;
  freeAgentsText: string;
  rounds: MickeyBDRound[];
  brackets: BracketMatch[];
  courtCount?: number;
};
function emptyMickeyBDState(): MickeyBDDivisionState {
  return { pairsText: "", freeAgentsText: "", rounds: [], brackets: [], courtCount: 1 };
}

// Short description for each format, shown at the top of its Home page.
const FORMAT_DESCRIPTIONS: Record<SidebarTabKey, { tagline: string; details: React.ReactNode }> = {
  DOUBLES: {
    tagline: '2-person blind-draw teams (typically 1 guy + 1 girl) · rally scoring to 21, win by 2.',
    details: (
      <>
        Players sign up individually and the app randomly pairs everyone into 2-person teams each round,
        mixing across guys and girls. Rosters refresh every round so you meet new partners and opponents.
        Pool play feeds into a seeded playoff bracket.
      </>
    ),
  },
  QUADS: {
    tagline: '4-person blind-draw teams (typically 2 guys + 2 girls) · rally scoring to 21, cap at 25.',
    details: (
      <>
        Same idea as Doubles but with 4-person teams. The app draws balanced 4-person rosters every round
        and standings roll up across all rounds. Playoffs seed from combined pool-play wins and point
        differential.
      </>
    ),
  },
  TRIPLES: {
    tagline: '3-person blind-draw teams · rally scoring to 21, win by 2.',
    details: (
      <>
        3v3 format with players randomly drawn into trios each round. Mixed-gender team composition;
        teams shuffle every round. Standings carry across all rounds into the playoff bracket.
      </>
    ),
  },
  KOB: {
    tagline: 'King & Queen of the Beach — individual blind draw with rotating partners.',
    details: (
      <>
        Every player partners with every other player exactly once. Pools of 4 to 8; a pool of 8 runs on
        two simultaneous courts with zero sit-out time. Top finishers advance to Gold Finals, runners-up
        to optional Silver Finals. Men (KOB) and Women (QOB) play separate pools with their own standings.
      </>
    ),
  },
  MICKEY: {
    tagline: 'Fixed teams of 4 built from sign-up pairs + free agents — two sets per matchup.',
    details: (
      <>
        Teams stay together through pool play <em>and</em> playoffs. Each pool matchup is two sets:{' '}
        <strong>Mickey</strong> (coed quads) and <strong>Minnie</strong> (revco quads), both to 21. Wins
        count per set with point differential as the tiebreaker. Playoffs add a seeded bracket plus a
        Redemption Rally consolation bracket for round 1 / round 2 losers.
      </>
    ),
  },
  MICKEYBD: {
    tagline: 'Mickey & Minnie format with fresh teams every round — pairs stay together each draw.',
    details: (
      <>
        Same Mickey + Minnie set structure, but teams <strong>re-randomize every round</strong> instead of
        staying together for pool play. Each round plays one match per team with a Mickey set and a Minnie
        set back-to-back, then everyone is re-shuffled into new teams of 4 for the next round. Pairs always
        stay together inside a round. The leaderboard adds up each pair's and free agent's wins across all
        rounds played.
      </>
    ),
  },
};

// Tiny tile used on each format's HOME page to jump to a sub-section.
function JumpCard({
  title, subtitle, badge, onClick,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 hover:ring-sky-300 hover:bg-sky-50/40 transition p-4 text-left flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-slate-800">{title}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge !== undefined && (
          <span className="text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium">
            {badge}
          </span>
        )}
        <span className="text-slate-400 text-xl leading-none">›</span>
      </div>
    </button>
  );
}

// Reusable section header that hosts the score settings panel.
function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
      <div>
        <h2 className="text-[16px] font-semibold text-sky-800">{title}</h2>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export default function BlindDrawTourneyApp() {
  const [activeTab, setActiveTab] = useState<TabKey>("DOUBLES");
  const [activeDivision, setActiveDivision] = useState<DivisionKey>("UPPER");
  const [activeSection, setActiveSection] = useState<SectionKey>("HOME");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);
  const setTheme = (t: Theme) => setThemeState(t);

  // Hash routing: #score=<matchId> opens a focused single-match scoring page.
  const [hash, setHash] = useState<string>(() => { try { return window.location.hash; } catch { return ''; } });
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const focusedMatchId = hash.startsWith('#score=') ? decodeURIComponent(hash.slice('#score='.length)) : null;

  const [adminKey, setAdminKey] = useState<string>(() => { try { return sessionStorage.getItem("ADMIN_KEY") || ""; } catch { return ""; } });
  const isAdmin = !!adminKey;
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [remoteError, setRemoteError] = useState<string>("");
  const [adminKeyError, setAdminKeyError] = useState<string>("");
  const [otherAdminActive, setOtherAdminActive] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const [sessionId] = useState<string>(() => { try { let id = sessionStorage.getItem("SESSION_ID"); if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem("SESSION_ID", id); } return id; } catch { return Math.random().toString(36).slice(2); } });

  const [dUpper, setDUpper] = useState<DivisionState<MatchRow>>(emptyDivisionState<MatchRow>());
  const [dLower, setDLower] = useState<DivisionState<MatchRow>>(emptyDivisionState<MatchRow>());
  const [qUpper, setQUpper] = useState<DivisionState<QuadsMatchRow>>(emptyDivisionState<QuadsMatchRow>());
  const [qLower, setQLower] = useState<DivisionState<QuadsMatchRow>>(emptyDivisionState<QuadsMatchRow>());
  const [dScoreSettings, setDScoreSettings] = useState<ScoreSettings>({ playTo: 21, cap: null });
  const [qScoreSettings, setQScoreSettings] = useState<ScoreSettings>({ playTo: 21, cap: 25 });
  const [tScoreSettings, setTScoreSettings] = useState<ScoreSettings>({ playTo: 21, cap: null });
  const [kobScoreSettings, setKobScoreSettings] = useState<ScoreSettings>({ playTo: 21, cap: 23 });
  const [tUpper, setTUpper] = useState<DivisionState<TriplesMatchRow>>(emptyDivisionState<TriplesMatchRow>());
  const [tLower, setTLower] = useState<DivisionState<TriplesMatchRow>>(emptyDivisionState<TriplesMatchRow>());
  const [kobUpper, setKobUpper] = useState<DivisionState<KobGameRow>>(emptyDivisionState<KobGameRow>());
  const [kobLower, setKobLower] = useState<DivisionState<KobGameRow>>(emptyDivisionState<KobGameRow>());
  const [mUpper, setMUpper] = useState<MickeyDivisionState>(emptyMickeyState());
  const [mLower, setMLower] = useState<MickeyDivisionState>(emptyMickeyState());
  const [mScoreSettings, setMScoreSettings] = useState<ScoreSettings>({ playTo: 21, cap: null });
  const [mbdUpper, setMBDUpper] = useState<MickeyBDDivisionState>(emptyMickeyBDState());
  const [mbdLower, setMBDLower] = useState<MickeyBDDivisionState>(emptyMickeyBDState());
  const [mbdScoreSettings, setMBDScoreSettings] = useState<ScoreSettings>({ playTo: 21, cap: null });

  async function handleResetApp() {
    const ok = window.confirm(
      "Reset the whole app? This will clear all rosters, matches, brackets, and autosaved data."
    );
    if (!ok) return;

    const emptyDUpper = emptyDivisionState<MatchRow>();
    const emptyDLower = emptyDivisionState<MatchRow>();
    const emptyQUpper = emptyDivisionState<QuadsMatchRow>();
    const emptyQLower = emptyDivisionState<QuadsMatchRow>();
    const emptyTUpper = emptyDivisionState<TriplesMatchRow>();
    const emptyTLower = emptyDivisionState<TriplesMatchRow>();
    const emptyKobUpper = emptyDivisionState<KobGameRow>();
    const emptyKobLower = emptyDivisionState<KobGameRow>();
    const emptyMUpper = emptyMickeyState();
    const emptyMLower = emptyMickeyState();
    const emptyMBDUpper = emptyMickeyBDState();
    const emptyMBDLower = emptyMickeyBDState();

    setDUpper(emptyDUpper);
    setDLower(emptyDLower);
    setQUpper(emptyQUpper);
    setQLower(emptyQLower);
    setTUpper(emptyTUpper);
    setTLower(emptyTLower);
    setKobUpper(emptyKobUpper);
    setKobLower(emptyKobLower);
    setMUpper(emptyMUpper);
    setMLower(emptyMLower);
    setMBDUpper(emptyMBDUpper);
    setMBDLower(emptyMBDLower);
    setActiveTab("DOUBLES");
    setActiveDivision("UPPER");
    setActiveSection("HOME");

    try {
      localStorage.removeItem("sunnysports.autosave");
    } catch {}

    if (isAdmin) {
      const emptySnapshot = {
        activeTab: "DOUBLES",
        activeDivision: "UPPER",
        doubles: { UPPER: emptyDUpper, LOWER: emptyDLower },
        quads: { UPPER: emptyQUpper, LOWER: emptyQLower },
        triples: { UPPER: emptyTUpper, LOWER: emptyTLower },
        mickey: { UPPER: emptyMUpper, LOWER: emptyMLower },
        guysText: "", girlsText: "", matches: [], brackets: [],
        qGuysText: "", qGirlsText: "", qMatches: [], qBrackets: [],
        tGuysText: "", tGirlsText: "", tMatches: [], tBrackets: [],
      };

      try {
        await apiSaveState(emptySnapshot as any, adminKey);
        setRemoteError("");
      } catch (e: any) {
        setRemoteError(e?.message || "Failed to reset shared data");
      }
    }
  }

  const snapshotState = useMemo(() => ({
    activeTab,
    activeDivision,
    doubles: { UPPER: dUpper, LOWER: dLower },
    quads: { UPPER: qUpper, LOWER: qLower },
    triples: { UPPER: tUpper, LOWER: tLower },
    kob: { UPPER: kobUpper, LOWER: kobLower },
    mickey: { UPPER: mUpper, LOWER: mLower },
    mickeyBD: { UPPER: mbdUpper, LOWER: mbdLower },
    dScoreSettings, qScoreSettings, tScoreSettings, kobScoreSettings, mScoreSettings, mbdScoreSettings,
    guysText: dUpper.guysText, girlsText: dUpper.girlsText, matches: dUpper.matches, brackets: dUpper.brackets,
    qGuysText: qUpper.guysText, qGirlsText: qUpper.girlsText, qMatches: qUpper.matches, qBrackets: qUpper.brackets,
    tGuysText: tUpper.guysText, tGirlsText: tUpper.girlsText, tMatches: tUpper.matches, tBrackets: tUpper.brackets,
  } as any), [activeTab, activeDivision, dUpper, dLower, qUpper, qLower, tUpper, tLower, kobUpper, kobLower, mUpper, mLower, mbdUpper, mbdLower, dScoreSettings, qScoreSettings, tScoreSettings, kobScoreSettings, mScoreSettings, mbdScoreSettings]);

  useEffect(() => {
    (async () => {
      try {
        const remote: any = await apiGetState();
        const data: any = remote || (()=> { try { const raw = localStorage.getItem("sunnysports.autosave"); return raw ? JSON.parse(raw) : null; } catch { return null; } })();
        if (data) {
          if (data.doubles?.UPPER) setDUpper(data.doubles.UPPER); else setDUpper({ guysText: data.guysText || "", girlsText: data.girlsText || "", matches: Array.isArray(data.matches) ? data.matches : [], brackets: Array.isArray(data.brackets) ? data.brackets : [] });
          if (data.doubles?.LOWER) setDLower(data.doubles.LOWER);
          if (data.quads?.UPPER) setQUpper(data.quads.UPPER); else setQUpper({ guysText: data.qGuysText || "", girlsText: data.qGirlsText || "", matches: Array.isArray(data.qMatches) ? data.qMatches : [], brackets: Array.isArray(data.qBrackets) ? data.qBrackets : [] });
          if (data.quads?.LOWER) setQLower(data.quads.LOWER);
          if (data.triples?.UPPER) setTUpper(data.triples.UPPER); else setTUpper({ guysText: data.tGuysText || "", girlsText: data.tGirlsText || "", matches: Array.isArray(data.tMatches) ? data.tMatches : [], brackets: Array.isArray(data.tBrackets) ? data.tBrackets : [] });
          if (data.triples?.LOWER) setTLower(data.triples.LOWER);
          if (data.kob?.UPPER) setKobUpper(data.kob.UPPER);
          if (data.kob?.LOWER) setKobLower(data.kob.LOWER);
          if (data.mickey?.UPPER) setMUpper(data.mickey.UPPER);
          if (data.mickey?.LOWER) setMLower(data.mickey.LOWER);
          // Merge with empty state so older saves (which may not have all
          // fields like `brackets`) don't crash on .length / .some().
          if (data.mickeyBD?.UPPER) setMBDUpper({ ...emptyMickeyBDState(), ...data.mickeyBD.UPPER });
          if (data.mickeyBD?.LOWER) setMBDLower({ ...emptyMickeyBDState(), ...data.mickeyBD.LOWER });
          if (data.dScoreSettings) setDScoreSettings(data.dScoreSettings);
          if (data.qScoreSettings) setQScoreSettings(data.qScoreSettings);
          else if (data.qScoreCap === 21 || data.qScoreCap === 25) setQScoreSettings({ playTo: 21, cap: data.qScoreCap });
          if (data.tScoreSettings) setTScoreSettings(data.tScoreSettings);
          if (data.kobScoreSettings) setKobScoreSettings(data.kobScoreSettings);
          if (data.mScoreSettings) setMScoreSettings(data.mScoreSettings);
          if (data.mbdScoreSettings) setMBDScoreSettings(data.mbdScoreSettings);
          if (data.activeTab === "DOUBLES" || data.activeTab === "QUADS" || data.activeTab === "TRIPLES" || data.activeTab === "KOB" || data.activeTab === "MICKEY" || data.activeTab === "MICKEYBD") setActiveTab(data.activeTab);
          if (data.activeDivision === "UPPER" || data.activeDivision === "LOWER") setActiveDivision(data.activeDivision);
        }
        setLoadingRemote(false);
      } catch (e: any) { setRemoteError(e?.message || "Failed to load shared data"); setLoadingRemote(false); }
    })();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("sunnysports.autosave", JSON.stringify(snapshotState)); } catch {}
    if (!isAdmin) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try { await apiSaveState(snapshotState as any, adminKey); setRemoteError(""); }
      catch (e: any) { setRemoteError(e?.message || "Failed to save shared data"); }
    }, 600);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [snapshotState, isAdmin, adminKey]);

  useEffect(() => {
    if (!isAdmin) { setOtherAdminActive(false); return; }
    const ping = async () => {
      try {
        const res = await fetch("/api/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = await res.json();
        setOtherAdminActive(json.otherActive > 0);
      } catch { /* ignore network errors */ }
    };
    ping();
    const iv = window.setInterval(ping, 15_000);
    return () => window.clearInterval(iv);
  }, [isAdmin, sessionId]);

  // ── Current per-format slices ───────────────────────────────────────────
  const currentD = activeDivision === "UPPER" ? dUpper : dLower;
  const setCurrentD = activeDivision === "UPPER" ? setDUpper : setDLower;
  const currentQ = activeDivision === "UPPER" ? qUpper : qLower;
  const setCurrentQ = activeDivision === "UPPER" ? setQUpper : setQLower;
  const currentT = activeDivision === "UPPER" ? tUpper : tLower;
  const setCurrentT = activeDivision === "UPPER" ? setTUpper : setTLower;
  const currentKob = activeDivision === "UPPER" ? kobUpper : kobLower;
  const setCurrentKob = activeDivision === "UPPER" ? setKobUpper : setKobLower;
  const currentM = activeDivision === "UPPER" ? mUpper : mLower;
  const setCurrentM = activeDivision === "UPPER" ? setMUpper : setMLower;
  const currentMBD = activeDivision === "UPPER" ? mbdUpper : mbdLower;
  const setCurrentMBD = activeDivision === "UPPER" ? setMBDUpper : setMBDLower;

  const currentDivisionMeta = SIDEBAR_DIVISIONS.find(d => d.key === activeTab);
  const divisionLabel = currentDivisionMeta?.label ?? activeTab;
  const isBlindDraw = !!currentDivisionMeta?.blindDraw;

  // ── Reusable bits ───────────────────────────────────────────────────────
  const AdminBanner = (
    <section className="bg-white rounded-lg ring-1 ring-slate-200 p-3 text-[12px] text-slate-700 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${isAdmin ? "bg-emerald-500" : "bg-slate-400"}`} />
        <span className="font-semibold">{isAdmin ? "Admin Mode" : "Viewer Mode (read-only)"}</span>
        {loadingRemote && <span className="text-slate-500">Loading shared data…</span>}
        {!!remoteError && <span className="text-red-600">{remoteError}</span>}
        {otherAdminActive && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">
            Another admin is also editing
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isAdmin
          ? <>
              <button className="px-3 py-1.5 rounded bg-sky-700 text-white hover:bg-sky-800" onClick={async () => {
                setAdminKeyError("");
                const k = prompt("Enter Admin Key to enable editing:");
                if (!k) return;
                try {
                  const getRes = await fetch("/api/state", { cache: "no-store" });
                  const json = await getRes.json();
                  const currentState = json?.data ?? null;
                  const res = await fetch("/api/state", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-key": k },
                    body: JSON.stringify(currentState),
                  });
                  if (res.status === 401) {
                    setAdminKeyError("Incorrect admin key. Please try again.");
                    return;
                  }
                } catch {
                  // Offline use — accept the key
                }
                try { sessionStorage.setItem("ADMIN_KEY", k); } catch {}
                setAdminKeyError("");
                setAdminKey(k);
              }}>Unlock Editing</button>
              {!!adminKeyError && <span className="text-red-600 text-[11px] font-medium">{adminKeyError}</span>}
            </>
          : <button className="px-3 py-1.5 rounded border" onClick={() => { try { sessionStorage.removeItem("ADMIN_KEY"); } catch {} setAdminKey(""); }}>Lock (Viewer Mode)</button>
        }
      </div>
    </section>
  );

  // ── Helper: count scored matches for the current section's badge ────────
  function scoredCount(arr: { scoreText?: string }[]): number {
    return arr.filter(m => {
      const t = (m.scoreText || '').trim();
      if (!t) return false;
      const p = t.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!p) return false;
      return parseInt(p[1], 10) !== parseInt(p[2], 10);
    }).length;
  }
  function scoredMickeyCount(arr: MickeyMatchRow[]): number {
    let n = 0;
    for (const m of arr) {
      const check = (s?: string) => {
        const t = (s || '').trim(); if (!t) return false;
        const p = t.match(/^(\d+)\s*[-–]\s*(\d+)$/);
        return !!p && parseInt(p[1], 10) !== parseInt(p[2], 10);
      };
      if (check(m.mickeyScore)) n++;
      if (check(m.minnieScore)) n++;
    }
    return n;
  }
  function scoredKobCount(arr: KobGameRow[]): number {
    return arr.filter(g => {
      const t = (g.scoreText || '').trim();
      if (!t) return false;
      const p = t.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      return !!p && parseInt(p[1], 10) !== parseInt(p[2], 10);
    }).length;
  }

  // ── HOME content per format ─────────────────────────────────────────────
  function renderHome() {
    let teamsBadge = '';
    let poolsBadge = '';
    let playoffsBadge = '';
    let teamsSubtitle = '';
    let poolsSubtitle = '';
    let playoffsSubtitle = '';

    if (activeTab === 'DOUBLES') {
      const guys = currentD.guysText.split(/\r?\n/).filter(s => s.trim()).length;
      const girls = currentD.girlsText.split(/\r?\n/).filter(s => s.trim()).length;
      teamsBadge = `${guys + girls}`;
      teamsSubtitle = 'Roster and round generator';
      poolsBadge = `${scoredCount(currentD.matches)}/${currentD.matches.length}`;
      poolsSubtitle = 'Matches and standings';
      playoffsBadge = currentD.brackets.length > 0 ? 'Built' : 'Not built';
      playoffsSubtitle = 'Bracket and Redemption Rally';
    } else if (activeTab === 'QUADS') {
      const guys = currentQ.guysText.split(/\r?\n/).filter(s => s.trim()).length;
      const girls = currentQ.girlsText.split(/\r?\n/).filter(s => s.trim()).length;
      teamsBadge = `${guys + girls}`;
      teamsSubtitle = 'Roster and round generator';
      poolsBadge = `${scoredCount(currentQ.matches)}/${currentQ.matches.length}`;
      poolsSubtitle = 'Matches and standings';
      playoffsBadge = currentQ.brackets.length > 0 ? 'Built' : 'Not built';
      playoffsSubtitle = 'Bracket and Redemption Rally';
    } else if (activeTab === 'TRIPLES') {
      const guys = currentT.guysText.split(/\r?\n/).filter(s => s.trim()).length;
      const girls = currentT.girlsText.split(/\r?\n/).filter(s => s.trim()).length;
      teamsBadge = `${guys + girls}`;
      teamsSubtitle = 'Roster and round generator';
      poolsBadge = `${scoredCount(currentT.matches)}/${currentT.matches.length}`;
      poolsSubtitle = 'Matches and standings';
      playoffsBadge = currentT.brackets.length > 0 ? 'Built' : 'Not built';
      playoffsSubtitle = 'Bracket and Redemption Rally';
    } else if (activeTab === 'KOB') {
      const guys = currentKob.guysText.split(/\r?\n/).filter(s => s.trim()).length;
      const girls = currentKob.girlsText.split(/\r?\n/).filter(s => s.trim()).length;
      teamsBadge = `${guys + girls}`;
      teamsSubtitle = 'Roster and pool generators';
      const games = currentKob.matches as KobGameRow[];
      const main = games.filter(g => !g.isFinals);
      const finals = games.filter(g => g.isFinals);
      poolsBadge = `${scoredKobCount(main)}/${main.length}`;
      poolsSubtitle = 'Pool games and standings';
      playoffsBadge = finals.length > 0 ? `${scoredKobCount(finals)}/${finals.length}` : 'Not built';
      playoffsSubtitle = 'Gold and Silver finals';
    } else if (activeTab === 'MICKEY') {
      const teamCount = currentM.teams.length;
      teamsBadge = `${teamCount}`;
      teamsSubtitle = 'Pairs, free agents, teams of 4';
      const totalSets = currentM.matches.length * 2;
      poolsBadge = `${scoredMickeyCount(currentM.matches)}/${totalSets}`;
      poolsSubtitle = 'Pool matchups and standings';
      playoffsBadge = currentM.brackets.length > 0 ? 'Built' : 'Not built';
      playoffsSubtitle = 'Bracket and Redemption Rally';
    } else { // MICKEYBD
      const rounds = currentMBD.rounds ?? [];
      const brackets = currentMBD.brackets ?? [];
      const totalMatches = rounds.reduce((n, r) => n + r.matches.length, 0);
      const scoredSets = rounds.reduce(
        (n, r) => n + scoredMickeyCount(r.matches), 0,
      );
      teamsBadge = `${rounds.length}`;
      teamsSubtitle = `Roster and round generator (${rounds.length} round${rounds.length === 1 ? '' : 's'} so far)`;
      poolsBadge = `${scoredSets}/${totalMatches * 2}`;
      poolsSubtitle = 'Matches across all rounds + standings';
      playoffsBadge = brackets.length > 0 ? 'Built' : 'Not built';
      playoffsSubtitle = 'Re-drawn playoff teams + Redemption Rally';
    }

    const desc = FORMAT_DESCRIPTIONS[activeTab];

    return (
      <>
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              How {divisionLabel} works
            </span>
            {isBlindDraw && (
              <span className="text-[9.5px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                Blind Draw
              </span>
            )}
          </div>
          <p className="text-[14px] text-slate-800 font-medium leading-relaxed">{desc.tagline}</p>
          <p className="text-[12.5px] text-slate-600 leading-relaxed mt-2">{desc.details}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <JumpCard
            title="Teams"
            subtitle={teamsSubtitle}
            badge={teamsBadge}
            onClick={() => setActiveSection('TEAMS')}
          />
          <JumpCard
            title="Pools"
            subtitle={poolsSubtitle}
            badge={poolsBadge}
            onClick={() => setActiveSection('POOLS')}
          />
          <JumpCard
            title="Playoffs"
            subtitle={playoffsSubtitle}
            badge={playoffsBadge}
            onClick={() => setActiveSection('PLAYOFFS')}
          />
        </div>
      </>
    );
  }

  // ── Section content ─────────────────────────────────────────────────────
  function renderSection() {
    if (activeSection === 'HOME') return renderHome();

    if (activeTab === 'DOUBLES') {
      if (activeSection === 'TEAMS') {
        return (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
                <SectionHeader
                  title={`Players (Doubles – ${activeDivision})`}
                  right={<ScoreSettingsPanel settings={dScoreSettings} onChange={setDScoreSettings} />}
                />
                <div className="grid md:grid-cols-2 gap-4">
                  <LineNumberTextarea id={`d-guys-${activeDivision}`} label="Guys" value={currentD.guysText} onChange={(e) => setCurrentD(p => ({ ...p, guysText: e.target.value }))} />
                  <LineNumberTextarea id={`d-girls-${activeDivision}`} label="Girls" value={currentD.girlsText} onChange={(e) => setCurrentD(p => ({ ...p, girlsText: e.target.value }))} />
                </div>
              </section>
              <RoundGenerator
                guysText={currentD.guysText}
                girlsText={currentD.girlsText}
                matches={currentD.matches}
                setMatches={(v: any) => setCurrentD(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              />
            </fieldset>
          </>
        );
      }
      if (activeSection === 'POOLS') {
        return (
          <>
            <MatchesView
              matches={currentD.matches}
              setMatches={(v: any) => setCurrentD(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              isAdmin={isAdmin}
              scoreSettings={dScoreSettings}
            />
            <Leaderboard
              matches={currentD.matches}
              guysText={currentD.guysText}
              girlsText={currentD.girlsText}
              scoreSettings={dScoreSettings}
            />
          </>
        );
      }
      if (activeSection === 'PLAYOFFS') {
        return (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <PlayoffBuilder
                matches={currentD.matches}
                guysText={currentD.guysText}
                girlsText={currentD.girlsText}
                setBrackets={(f) => setCurrentD(prev => ({
                  ...prev,
                  brackets: typeof f === "function" ? (f as any)(prev.brackets) : f
                }))}
                baseDivision={activeDivision}
              />
            </fieldset>
            <BracketView
              brackets={currentD.brackets}
              setBrackets={(v: any) => setCurrentD(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))}
            />
          </>
        );
      }
    }

    if (activeTab === 'QUADS') {
      if (activeSection === 'TEAMS') {
        return (
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
              <SectionHeader
                title={`Players (Quads – ${activeDivision})`}
                right={<ScoreSettingsPanel settings={qScoreSettings} onChange={setQScoreSettings} />}
              />
              <div className="grid md:grid-cols-2 gap-4">
                <LineNumberTextarea id={`q-guys-${activeDivision}`} label="Guys (Quads)" value={currentQ.guysText} onChange={(e) => setCurrentQ(p => ({ ...p, guysText: e.target.value }))} />
                <LineNumberTextarea id={`q-girls-${activeDivision}`} label="Girls (Quads)" value={currentQ.girlsText} onChange={(e) => setCurrentQ(p => ({ ...p, girlsText: e.target.value }))} />
              </div>
            </section>
            <QuadsRoundGenerator guysText={currentQ.guysText} girlsText={currentQ.girlsText} matches={currentQ.matches} setMatches={(v: any) => setCurrentQ(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} />
          </fieldset>
        );
      }
      if (activeSection === 'POOLS') {
        return (
          <>
            <QuadsMatchesView matches={currentQ.matches} setMatches={(v: any) => setCurrentQ(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} isAdmin={isAdmin} scoreSettings={qScoreSettings} />
            <QuadsLeaderboard matches={currentQ.matches} guysText={currentQ.guysText} girlsText={currentQ.girlsText} scoreSettings={qScoreSettings} />
          </>
        );
      }
      if (activeSection === 'PLAYOFFS') {
        return (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <QuadsPlayoffBuilder matches={currentQ.matches} guysText={currentQ.guysText} girlsText={currentQ.girlsText} setBrackets={(v: any) => setCurrentQ(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} baseDivision={activeDivision} scoreSettings={qScoreSettings} />
            </fieldset>
            {currentQ.brackets.length > 0 && <BracketView brackets={currentQ.brackets} setBrackets={(v: any) => setCurrentQ(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} />}
          </>
        );
      }
    }

    if (activeTab === 'TRIPLES') {
      if (activeSection === 'TEAMS') {
        return (
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
              <SectionHeader
                title={`Players (Triples – ${activeDivision})`}
                right={<ScoreSettingsPanel settings={tScoreSettings} onChange={setTScoreSettings} />}
              />
              <div className="grid md:grid-cols-2 gap-4">
                <LineNumberTextarea id={`t-guys-${activeDivision}`} label="Guys (Triples)" value={currentT.guysText} onChange={(e) => setCurrentT(p => ({ ...p, guysText: e.target.value }))} />
                <LineNumberTextarea id={`t-girls-${activeDivision}`} label="Girls (Triples)" value={currentT.girlsText} onChange={(e) => setCurrentT(p => ({ ...p, girlsText: e.target.value }))} />
              </div>
            </section>
            <TriplesRoundGenerator guysText={currentT.guysText} girlsText={currentT.girlsText} matches={currentT.matches} setMatches={(v: any) => setCurrentT(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} />
          </fieldset>
        );
      }
      if (activeSection === 'POOLS') {
        return (
          <>
            <TriplesMatchesView matches={currentT.matches} setMatches={(v: any) => setCurrentT(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} isAdmin={isAdmin} scoreSettings={tScoreSettings} />
            <TriplesLeaderboard matches={currentT.matches} guysText={currentT.guysText} girlsText={currentT.girlsText} scoreSettings={tScoreSettings} />
          </>
        );
      }
      if (activeSection === 'PLAYOFFS') {
        return (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <TriplesPlayoffBuilder matches={currentT.matches} guysText={currentT.guysText} girlsText={currentT.girlsText} setBrackets={(v: any) => setCurrentT(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} />
            </fieldset>
            {currentT.brackets.length > 0 && <BracketView brackets={currentT.brackets} setBrackets={(v: any) => setCurrentT(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} />}
          </>
        );
      }
    }

    if (activeTab === 'KOB') {
      if (activeSection === 'TEAMS') {
        return (
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
              <SectionHeader
                title={`Players (KOB / QOB – ${activeDivision})`}
                subtitle="Individual tournament with rotating partners. Uneven rosters split into mixed pool sizes automatically."
                right={<ScoreSettingsPanel settings={kobScoreSettings} onChange={setKobScoreSettings} />}
              />
              <div className="grid md:grid-cols-2 gap-4">
                <LineNumberTextarea id={`kob-guys-${activeDivision}`} label="Men (KOB)" value={currentKob.guysText} onChange={(e) => setCurrentKob(p => ({ ...p, guysText: e.target.value }))} />
                <LineNumberTextarea id={`kob-girls-${activeDivision}`} label="Women (QOB)" value={currentKob.girlsText} onChange={(e) => setCurrentKob(p => ({ ...p, girlsText: e.target.value }))} />
              </div>
            </section>
            <div className="grid md:grid-cols-2 gap-4">
              <KobPoolGenerator
                label="Men (KOB)"
                playersText={currentKob.guysText}
                gender="kob"
                games={currentKob.matches as KobGameRow[]}
                setGames={(v: any) => setCurrentKob(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
                poolBase={0}
              />
              <KobPoolGenerator
                label="Women (QOB)"
                playersText={currentKob.girlsText}
                gender="qob"
                games={currentKob.matches as KobGameRow[]}
                setGames={(v: any) => setCurrentKob(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
                poolBase={500}
              />
            </div>
          </fieldset>
        );
      }
      if (activeSection === 'POOLS') {
        return (
          <>
            <KobMatchesView
              games={currentKob.matches as KobGameRow[]}
              setGames={(v: any) => setCurrentKob(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              isAdmin={isAdmin}
              guys={currentKob.guysText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)}
              girls={currentKob.girlsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)}
              scoreSettings={kobScoreSettings}
            />
            <KobLeaderboard
              games={currentKob.matches as KobGameRow[]}
              guysText={currentKob.guysText}
              girlsText={currentKob.girlsText}
              scoreSettings={kobScoreSettings}
            />
          </>
        );
      }
      if (activeSection === 'PLAYOFFS') {
        return (
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <KobFinalsGenerator
              games={currentKob.matches as KobGameRow[]}
              setGames={(v: any) => setCurrentKob(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              guysText={currentKob.guysText}
              girlsText={currentKob.girlsText}
              isAdmin={isAdmin}
            />
          </fieldset>
        );
      }
    }

    if (activeTab === 'MICKEY') {
      if (activeSection === 'TEAMS') {
        return (
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
              <SectionHeader
                title={`Sign-ups (Mickey & Minnie – ${activeDivision})`}
                subtitle={"Each name can take a (M)/(F) marker and an optional 1–5 skill, e.g. Amanda(F4) and Chance(M3)."}
                right={<ScoreSettingsPanel settings={mScoreSettings} onChange={setMScoreSettings} />}
              />
              <div className="grid md:grid-cols-2 gap-4">
                <LineNumberTextarea
                  id={`m-pairs-${activeDivision}`}
                  label="Pairs"
                  value={currentM.pairsText}
                  onChange={(e) => setCurrentM(p => ({ ...p, pairsText: e.target.value }))}
                />
                <LineNumberTextarea
                  id={`m-free-${activeDivision}`}
                  label="Free Agents"
                  value={currentM.freeAgentsText}
                  onChange={(e) => setCurrentM(p => ({ ...p, freeAgentsText: e.target.value }))}
                />
              </div>
            </section>
            <MickeyTeamBuilder
              pairsText={currentM.pairsText}
              freeAgentsText={currentM.freeAgentsText}
              teams={currentM.teams}
              setTeams={(v: any) => setCurrentM(p => ({ ...p, teams: typeof v === 'function' ? v(p.teams) : v }))}
              matches={currentM.matches}
              setMatches={(v: any) => setCurrentM(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              firstFormat={currentM.firstFormat ?? 'MICKEY'}
              setFirstFormat={(f) => setCurrentM(p => ({ ...p, firstFormat: f }))}
              matchFormat={currentM.matchFormat ?? 'ALTERNATING'}
              setMatchFormat={(f) => setCurrentM(p => ({ ...p, matchFormat: f }))}
            />
          </fieldset>
        );
      }
      if (activeSection === 'POOLS') {
        return (
          <>
            <MickeyMatchesView
              matches={currentM.matches}
              setMatches={(v: any) => setCurrentM(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              teams={currentM.teams}
              pairsText={currentM.pairsText}
              courtCount={currentM.courtCount ?? 1}
              setCourtCount={(n: number) => setCurrentM(p => ({ ...p, courtCount: Math.max(1, Math.floor(n) || 1) }))}
              isAdmin={isAdmin}
              scoreSettings={mScoreSettings}
            />
            <MickeyLeaderboard
              matches={currentM.matches}
              teams={currentM.teams}
              pairsText={currentM.pairsText}
              freeAgentsText={currentM.freeAgentsText}
              scoreSettings={mScoreSettings}
            />
          </>
        );
      }
      if (activeSection === 'PLAYOFFS') {
        return (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <MickeyPlayoffBuilder
                teams={currentM.teams}
                matches={currentM.matches}
                pairsText={currentM.pairsText}
                freeAgentsText={currentM.freeAgentsText}
                brackets={currentM.brackets}
                setBrackets={(v: any) => setCurrentM(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))}
                division={activeDivision}
              />
            </fieldset>
            <MickeyBracketView
              brackets={currentM.brackets}
              setBrackets={(v: any) => setCurrentM(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))}
              isAdmin={isAdmin}
            />
          </>
        );
      }
    }

    if (activeTab === 'MICKEYBD') {
      if (activeSection === 'TEAMS') {
        return (
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-4">
              <SectionHeader
                title={`Sign-ups (Mickey & Minnie Blind Draw – ${activeDivision})`}
                subtitle={"Add (M)/(F) and optional 1–5 skill markers, e.g. Amanda(F4) and Chance(M3). Teams re-randomize every round."}
                right={<ScoreSettingsPanel settings={mbdScoreSettings} onChange={setMBDScoreSettings} />}
              />
              <div className="grid md:grid-cols-2 gap-4">
                <LineNumberTextarea
                  id={`mbd-pairs-${activeDivision}`}
                  label="Pairs"
                  value={currentMBD.pairsText}
                  onChange={(e) => setCurrentMBD(p => ({ ...p, pairsText: e.target.value }))}
                />
                <LineNumberTextarea
                  id={`mbd-free-${activeDivision}`}
                  label="Free Agents"
                  value={currentMBD.freeAgentsText}
                  onChange={(e) => setCurrentMBD(p => ({ ...p, freeAgentsText: e.target.value }))}
                />
              </div>
            </section>
            <MickeyBDRoundManager
              pairsText={currentMBD.pairsText}
              freeAgentsText={currentMBD.freeAgentsText}
              rounds={currentMBD.rounds}
              setRounds={(v: any) => setCurrentMBD(p => ({ ...p, rounds: typeof v === 'function' ? v(p.rounds) : v }))}
            />
          </fieldset>
        );
      }
      if (activeSection === 'POOLS') {
        return (
          <>
            <MickeyBDMatchesView
              rounds={currentMBD.rounds}
              setRounds={(v: any) => setCurrentMBD(p => ({ ...p, rounds: typeof v === 'function' ? v(p.rounds) : v }))}
              pairsText={currentMBD.pairsText}
              isAdmin={isAdmin}
              scoreSettings={mbdScoreSettings}
            />
            <MickeyBDLeaderboard
              rounds={currentMBD.rounds}
              pairsText={currentMBD.pairsText}
              freeAgentsText={currentMBD.freeAgentsText}
              scoreSettings={mbdScoreSettings}
            />
          </>
        );
      }
      if (activeSection === 'PLAYOFFS') {
        return (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <MickeyBDPlayoffBuilder
                rounds={currentMBD.rounds ?? []}
                pairsText={currentMBD.pairsText}
                freeAgentsText={currentMBD.freeAgentsText}
                brackets={currentMBD.brackets ?? []}
                setBrackets={(v: any) => setCurrentMBD(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets ?? []) : v }))}
                division={activeDivision}
              />
            </fieldset>
            <MickeyBracketView
              brackets={currentMBD.brackets ?? []}
              setBrackets={(v: any) => setCurrentMBD(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets ?? []) : v }))}
              isAdmin={isAdmin}
            />
          </>
        );
      }
    }

    return null;
  }

  // Focused live-scoring page short-circuits the rest of the app.
  if (focusedMatchId) {
    return <ScoreFocusPage matchId={focusedMatchId} />;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            className="md:hidden text-slate-700 p-1 rounded hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span className="text-xl leading-none">☰</span>
          </button>
          <SunnyLogo />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-slate-500 hidden sm:block">
              Tournament Control · Live pool play &amp; playoffs
            </span>
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      <div className="flex">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeDivision={activeDivision}
          setActiveDivision={setActiveDivision}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 min-w-0">
          <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
            {AdminBanner}

            {/* Format header with sub-tab bar */}
            <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 px-4 pt-4 pb-0">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-[20px] font-bold text-sky-900">{divisionLabel}</h1>
                    {isBlindDraw && (
                      <span className="text-[9.5px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                        Blind Draw
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {activeDivision} Division · pool play and playoffs
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["UPPER", "LOWER"] as DivisionKey[]).map(div => (
                    <button
                      key={div}
                      className={
                        'px-2.5 py-1 rounded-md text-[11px] font-medium ' +
                        (activeDivision === div ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                      }
                      onClick={() => setActiveDivision(div)}
                    >
                      {div}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 mt-3 border-b border-slate-200 -mx-4 px-4 overflow-x-auto">
                {SIDEBAR_SECTIONS.map(s => (
                  <button
                    key={s.key}
                    className={
                      'px-3 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ' +
                      (activeSection === s.key
                        ? 'border-sky-500 text-sky-800'
                        : 'border-transparent text-slate-500 hover:text-slate-700')
                    }
                    onClick={() => setActiveSection(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section content */}
            <div className="space-y-4">
              {renderSection()}
            </div>

            {/* Reset (kept at bottom, low-key) */}
            <section className="bg-white/60 rounded-lg p-3 text-[11px] text-slate-500 mt-6">
              <button
                className="px-2 py-1 border rounded text-[11px] hover:bg-slate-100"
                onClick={handleResetApp}
              >
                {isAdmin ? "Reset App" : "Reset Local App"}
              </button>
              <span className="ml-2">Each format keeps separate UPPER and LOWER division data.</span>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

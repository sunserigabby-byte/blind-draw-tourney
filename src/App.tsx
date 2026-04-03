import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRow, QuadsMatchRow, TriplesMatchRow, BracketMatch, KobGameRow, ScoreSettings } from './types';
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
import { ScoreSettingsPanel } from './components/ScoreSettingsPanel';

type TabKey = "DOUBLES" | "QUADS" | "TRIPLES" | "KOB";
type DivisionKey = "UPPER" | "LOWER";
type DivisionState<TMatch> = { guysText: string; girlsText: string; matches: TMatch[]; brackets: BracketMatch[] };

function emptyDivisionState<TMatch>(): DivisionState<TMatch> {
  return { guysText: "", girlsText: "", matches: [], brackets: [] };
}

export default function BlindDrawTourneyApp() {
  const [activeTab, setActiveTab] = useState<TabKey>("DOUBLES");
  const [activeDivision, setActiveDivision] = useState<DivisionKey>("UPPER");

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

    setDUpper(emptyDUpper);
    setDLower(emptyDLower);
    setQUpper(emptyQUpper);
    setQLower(emptyQLower);
    setTUpper(emptyTUpper);
    setTLower(emptyTLower);
    setKobUpper(emptyKobUpper);
    setKobLower(emptyKobLower);
    setActiveTab("DOUBLES");
    setActiveDivision("UPPER");

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
        guysText: "",
        girlsText: "",
        matches: [],
        brackets: [],
        qGuysText: "",
        qGirlsText: "",
        qMatches: [],
        qBrackets: [],
        tGuysText: "",
        tGirlsText: "",
        tMatches: [],
        tBrackets: [],
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
    dScoreSettings, qScoreSettings, tScoreSettings, kobScoreSettings,
    guysText: dUpper.guysText, girlsText: dUpper.girlsText, matches: dUpper.matches, brackets: dUpper.brackets,
    qGuysText: qUpper.guysText, qGirlsText: qUpper.girlsText, qMatches: qUpper.matches, qBrackets: qUpper.brackets,
    tGuysText: tUpper.guysText, tGirlsText: tUpper.girlsText, tMatches: tUpper.matches, tBrackets: tUpper.brackets,
  } as any), [activeTab, activeDivision, dUpper, dLower, qUpper, qLower, tUpper, tLower, kobUpper, kobLower, dScoreSettings, qScoreSettings, tScoreSettings, kobScoreSettings]);

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
          if (data.dScoreSettings) setDScoreSettings(data.dScoreSettings);
          if (data.qScoreSettings) setQScoreSettings(data.qScoreSettings);
          else if (data.qScoreCap === 21 || data.qScoreCap === 25) setQScoreSettings({ playTo: 21, cap: data.qScoreCap });
          if (data.tScoreSettings) setTScoreSettings(data.tScoreSettings);
          if (data.kobScoreSettings) setKobScoreSettings(data.kobScoreSettings);
          if (data.activeTab === "DOUBLES" || data.activeTab === "QUADS" || data.activeTab === "TRIPLES" || data.activeTab === "KOB") setActiveTab(data.activeTab);
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

  // Heartbeat: ping every 15s when admin, check if another admin is active
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

  const AdminBanner = () => (
    <section className="bg-white/90 rounded-lg p-3 text-[12px] text-slate-700 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${isAdmin ? "bg-emerald-500" : "bg-slate-400"}`} />
        <span className="font-semibold">{isAdmin ? "Admin Mode (editing enabled)" : "Viewer Mode (read-only)"}</span>
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
                  // Fetch current state, then POST it back unchanged to validate the key
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
                  // Network error — allow offline use, accept the key
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

  const DivisionTabs = () => (
    <div className="bg-white/85 rounded-xl p-2 shadow ring-1 ring-slate-200 inline-flex gap-2">
      {(["UPPER", "LOWER"] as DivisionKey[]).map(div => (
        <button key={div} className={"px-3 py-1.5 rounded-lg text-[12px] font-medium " + (activeDivision === div ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")} onClick={() => setActiveDivision(div)}>{div} Division</button>
      ))}
    </div>
  );

  const currentD = activeDivision === "UPPER" ? dUpper : dLower;
  const setCurrentD = activeDivision === "UPPER" ? setDUpper : setDLower;
  const currentQ = activeDivision === "UPPER" ? qUpper : qLower;
  const setCurrentQ = activeDivision === "UPPER" ? setQUpper : setQLower;
  const currentT = activeDivision === "UPPER" ? tUpper : tLower;
  const setCurrentT = activeDivision === "UPPER" ? setTUpper : setTLower;
  const currentKob = activeDivision === "UPPER" ? kobUpper : kobLower;
  const setCurrentKob = activeDivision === "UPPER" ? setKobUpper : setKobLower;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-100 via-sky-50 to-white text-slate-800 antialiased">
      <header className="sticky top-0 z-10 bg-sky-900/90 backdrop-blur border-b border-sky-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex items-center justify-between gap-3"><SunnyLogo /></div>
          <div className="text-[11px] text-sky-100/80 md:text-right"><div className="font-medium">Tournament Control Panel</div><div>Live blind draw · pool play · playoffs · redemption rally</div></div>
        </div>
        <div className="border-t border-sky-700 bg-sky-900/80">
          <div className="max-w-6xl mx-auto px-4 py-6 flex gap-2 text-[13px]">
            <button className={"px-3 py-1 rounded-t-md border-b-2 " + (activeTab === "DOUBLES" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("DOUBLES")}>Revco Doubles</button>
            <button className={"px-3 py-1 rounded-t-md border-b-2 " + (activeTab === "QUADS" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("QUADS")}>Revco Quads</button>
            <button className={"px-3 py-1 rounded-t-md border-b-2 " + (activeTab === "TRIPLES" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("TRIPLES")}>Revco Triples</button>
            <button className={"px-3 py-1 rounded-t-md border-b-2 " + (activeTab === "KOB" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("KOB")}>KOB / QOB</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <AdminBanner />
        <DivisionTabs />

        {activeTab === "DOUBLES" ? (
          <>
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                  <h2 className="text-[16px] font-semibold text-sky-800">
                    Players (Doubles – {activeDivision})
                  </h2>
                  <ScoreSettingsPanel settings={dScoreSettings} onChange={setDScoreSettings} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <LineNumberTextarea
                    id={`d-guys-${activeDivision}`}
                    label="Guys"
                    value={currentD.guysText}
                    onChange={(e) => setCurrentD(p => ({ ...p, guysText: e.target.value }))}
                  />
                  <LineNumberTextarea
                    id={`d-girls-${activeDivision}`}
                    label="Girls"
                    value={currentD.girlsText}
                    onChange={(e) => setCurrentD(p => ({ ...p, girlsText: e.target.value }))}
                  />
                </div>
              </section>

              <RoundGenerator
                guysText={currentD.guysText}
                girlsText={currentD.girlsText}
                matches={currentD.matches}
                setMatches={(v: any) => setCurrentD(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              />
            </fieldset>

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
        ) : activeTab === "QUADS" ? (
          <>
            <QuadsLeaderboard matches={currentQ.matches} guysText={currentQ.guysText} girlsText={currentQ.girlsText} scoreSettings={qScoreSettings} />
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                  <h2 className="text-[16px] font-semibold text-sky-800">Players (Quads – {activeDivision})</h2>
                  <ScoreSettingsPanel settings={qScoreSettings} onChange={setQScoreSettings} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <LineNumberTextarea id={`q-guys-${activeDivision}`} label="Guys (Quads)" value={currentQ.guysText} onChange={(e) => setCurrentQ(p => ({ ...p, guysText: e.target.value }))} />
                  <LineNumberTextarea id={`q-girls-${activeDivision}`} label="Girls (Quads)" value={currentQ.girlsText} onChange={(e) => setCurrentQ(p => ({ ...p, girlsText: e.target.value }))} />
                </div>
              </section>
              <QuadsRoundGenerator guysText={currentQ.guysText} girlsText={currentQ.girlsText} matches={currentQ.matches} setMatches={(v: any) => setCurrentQ(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} />
              <QuadsMatchesView matches={currentQ.matches} setMatches={(v: any) => setCurrentQ(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} isAdmin={isAdmin} scoreSettings={qScoreSettings} />
              <QuadsPlayoffBuilder matches={currentQ.matches} guysText={currentQ.guysText} girlsText={currentQ.girlsText} setBrackets={(v: any) => setCurrentQ(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} baseDivision={activeDivision} scoreSettings={qScoreSettings} />
              {currentQ.brackets.length > 0 && <BracketView brackets={currentQ.brackets} setBrackets={(v: any) => setCurrentQ(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} />}
            </fieldset>
          </>
        ) : activeTab === "TRIPLES" ? (
          <>
            <TriplesLeaderboard matches={currentT.matches} guysText={currentT.guysText} girlsText={currentT.girlsText} scoreSettings={tScoreSettings} />
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                  <h2 className="text-[16px] font-semibold text-sky-800">Players (Triples – {activeDivision})</h2>
                  <ScoreSettingsPanel settings={tScoreSettings} onChange={setTScoreSettings} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <LineNumberTextarea id={`t-guys-${activeDivision}`} label="Guys (Triples)" value={currentT.guysText} onChange={(e) => setCurrentT(p => ({ ...p, guysText: e.target.value }))} />
                  <LineNumberTextarea id={`t-girls-${activeDivision}`} label="Girls (Triples)" value={currentT.girlsText} onChange={(e) => setCurrentT(p => ({ ...p, girlsText: e.target.value }))} />
                </div>
              </section>
              <TriplesRoundGenerator guysText={currentT.guysText} girlsText={currentT.girlsText} matches={currentT.matches} setMatches={(v: any) => setCurrentT(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} />
              <TriplesMatchesView matches={currentT.matches} setMatches={(v: any) => setCurrentT(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))} isAdmin={isAdmin} scoreSettings={tScoreSettings} />
              <TriplesPlayoffBuilder matches={currentT.matches} guysText={currentT.guysText} girlsText={currentT.girlsText} setBrackets={(v: any) => setCurrentT(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} />
              {currentT.brackets.length > 0 && <BracketView brackets={currentT.brackets} setBrackets={(v: any) => setCurrentT(p => ({ ...p, brackets: typeof v === 'function' ? v(p.brackets) : v }))} />}
            </fieldset>
          </>
        ) : (
          /* ── KOB / QOB ── */
          <>
            <KobLeaderboard
              games={currentKob.matches as KobGameRow[]}
              guysText={currentKob.guysText}
              girlsText={currentKob.girlsText}
              scoreSettings={kobScoreSettings}
            />
            <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
              <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                  <h2 className="text-[16px] font-semibold text-sky-800">
                    Players (KOB / QOB – {activeDivision})
                  </h2>
                  <ScoreSettingsPanel settings={kobScoreSettings} onChange={setKobScoreSettings} />
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  King &amp; Queen of the Beach — individual tournament with rotating partners.
                  Pools or Round Robin mode. Uneven rosters automatically split into mixed pool sizes.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <LineNumberTextarea
                    id={`kob-guys-${activeDivision}`}
                    label="Men (KOB)"
                    value={currentKob.guysText}
                    onChange={(e) => setCurrentKob(p => ({ ...p, guysText: e.target.value }))}
                  />
                  <LineNumberTextarea
                    id={`kob-girls-${activeDivision}`}
                    label="Women (QOB)"
                    value={currentKob.girlsText}
                    onChange={(e) => setCurrentKob(p => ({ ...p, girlsText: e.target.value }))}
                  />
                </div>
              </section>
              {/* Side-by-side KOB / QOB pool generators */}
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
              <KobFinalsGenerator
                games={currentKob.matches as KobGameRow[]}
                setGames={(v: any) => setCurrentKob(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
                guysText={currentKob.guysText}
                girlsText={currentKob.girlsText}
                isAdmin={isAdmin}
              />
            </fieldset>
            <KobMatchesView
              games={currentKob.matches as KobGameRow[]}
              setGames={(v: any) => setCurrentKob(p => ({ ...p, matches: typeof v === 'function' ? v(p.matches) : v }))}
              isAdmin={isAdmin}
              guys={currentKob.guysText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)}
              girls={currentKob.girlsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)}
              scoreSettings={kobScoreSettings}
            />
          </>
        )}

        <section className="bg-white/80 rounded-lg p-3 text-[11px] text-slate-600">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-2 py-1 border rounded text-[11px]"
              onClick={handleResetApp}
            >
              {isAdmin ? "Reset App" : "Reset Local App"}
            </button>
            <span>Each format now has separate UPPER and LOWER division data.</span>
          </div>
        </section>
      </div>
    </main>
  );
}

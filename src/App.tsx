import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Sunny Sports Performance – Blind Draw Tourney (tabbed build)
 *
 * TABS
 *  - Revco Doubles
 *  - Revco Quads
 *  - Revco Triples
 *
 * DOUBLES TAB (unchanged core logic)
 * ✅ Guys/Girls text boxes with line numbers + duplicate highlighting + live counts
 * ✅ Strict no-repeat (partners/opponents) toggle inside Round Generator
 * ✅ Random round generation (1 guy + 1 girl / team) with imbalance handling:
 *    - Ultimate Revco = 2 guys (blue)
 *    - Power Puff = 2 girls (pink)
 * ✅ Matches view: collapsible by round, delete-with-confirm, score input, auto-winner tint
 * ✅ Live Leaderboard (Guys & Girls) with W/L/PD (pool rules: to 21+, win by 2, no cap)
 * ✅ Autosave (rosters, matches, brackets) to localStorage
 * ✅ Playoff Builder: split upper/lower, pair within buckets, then seed by combined W then PD
 * ✅ Brackets: ESPN-style layout with BYEs placed in correct rounds, winners auto-advance
 * ✅ Redemption Rally (RR): losers from Upper+Lower R1/R2; optional partner re-randomize
 *
 * QUADS TAB (new)
 * ✅ Separate Guys/Girls rosters (Quads)
 * ✅ Quads Round Generator:
 *    - Prioritize 2 guys + 2 girls per team
 *    - Leftover players → up to 2 triples teams if needed
 *    - Tries to avoid repeat opponents when strict mode on
 * ✅ Quads Matches & Results:
 *    - 1 set to 21, win by 2, **cap 25**
 *    - Auto winner tint by score
 * ✅ Quads Leaderboard:
 *    - All players ranked by W/L/PD (using quads matches)
 * ✅ Quads Playoffs & punishments: placeholder card (coming later)
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
  members: string[];  // doubles = 2, quads = 4, RR can be mixed
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

/** QUADS pool-play match row */
type QuadsMatchRow = {
  id: string;
  round: number;
  court: number;
  t1: string[];
  t2: string[];
  isTriple1?: boolean;
  isTriple2?: boolean;
  scoreText?: string;
};

type TriplesMatchRow = {
  id: string;
  round: number;
  court: number;
  t1: string[];
  t2: string[];
  girlsNeeded: number;
  scoreText?: string;
};

const slug = (s:string)=> s.trim().toLowerCase().replace(/\s+/g,' ');
const uniq = <T,>(arr:T[]) => Array.from(new Set(arr));
const clampN = (n:number, min:number)=> isFinite(n) ? Math.max(min, Math.floor(n)) : min;

const shuffle = <T,>(arr:T[], seed?:number)=>{
  const a = arr.slice();
  let r = seed ?? Math.floor(Math.random()*1e9);
  const rand = ()=> (r = (r*1664525 + 1013904223) % 4294967296) / 4294967296;
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(rand()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
};

// Court pools for playoffs
const UPPER_COURTS = [1,2,3,4,5];
const LOWER_COURTS = [6,7,8,9,10];
const courtFor = (division:PlayDiv, round:number, slot:number)=>{
  const pool = division==='UPPER' ? UPPER_COURTS : LOWER_COURTS; // RR uses lower courts by default
  return pool[(slot-1) % pool.length];
};

// ===== Generic score parsing
function parseScore(text?: string): [number, number] | null {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(b)) return null;
  return [a, b];
}

// Doubles pool: to 21+, win by 2, no cap
function isValidDoublesScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

// Quads pool: to 21, win by 2, cap 25
function isValidQuadsScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && max <= 25 && diff >= 2;
}

function isValidTriplesScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

/* ========================= Shared persistence API ========================= */

type PersistedState = {
  guysText: string;
  girlsText: string;
  matches: MatchRow[];
  brackets: BracketMatch[];
  qGuysText: string;
  qGirlsText: string;
  qMatches: QuadsMatchRow[];
  qBrackets: BracketMatch[];
  tGuysText: string;
  tGirlsText: string;
  tMatches: TriplesMatchRow[];
  tBrackets: BracketMatch[];
  activeTab: "DOUBLES" | "QUADS" | "TRIPLES";
};

async function apiGetState(): Promise<PersistedState | null> {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data ?? null;
}

async function apiSaveState(state: PersistedState, adminKey: string): Promise<void> {
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`POST /api/state failed (${res.status})`);
}

/* ========================= Sunny Logo ========================= */

function SunnyLogo(){
  return (
    <div className="flex items-center gap-3 select-none">
      <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden className="drop-shadow-sm">
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
            <stop offset="0%" stopColor="rgba(253, 224, 71, .45)" />
            <stop offset="100%" stopColor="rgba(253, 224, 71, 0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="14" fill="url(#sky)" />
        <circle cx="32" cy="32" r="16" fill="url(#glow)" />
        <circle cx="32" cy="32" r="12" fill="url(#sunCore)" stroke="#f59e0b" strokeWidth="1.25" />
        <g stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" opacity=".95">
          {Array.from({length:12}).map((_,i)=>{
            const a = (i*Math.PI*2)/12; const r1=18, r2=24;
            const x1=32+Math.cos(a)*r1, y1=32+Math.sin(a)*r1;
            const x2=32+Math.cos(a)*r2, y2=32+Math.sin(a)*r2;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
        <circle cx="32" cy="32" r="13.5" fill="none" stroke="#fde68a" strokeOpacity=".6" strokeWidth="1" />
      </svg>
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight text-sky-50 text-[16px]">Sunny Sports Performance</div>
        <div className="text-[11px] text-sky-100/90">Blind Draw Tourney</div>
      </div>
    </div>
  );
}

/* ========================= LinedTextarea (shared) ========================= */

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

  const lines = useMemo(() => (value ?? '').split(/\r?\n/), [value]);
  const trimmed = useMemo(() => lines.map((s) => s.trim()), [lines]);
  const normalized = useMemo(() => trimmed.map((s) => s.replace(/\s+/g, ' ').toLowerCase()), [trimmed]);
  const nonEmptyCount = useMemo(() => trimmed.filter(Boolean).length, [trimmed]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of normalized) { if (!s) continue; m.set(s, (m.get(s) || 0) + 1); }
    return m;
  }, [normalized]);
  const isDupLine = useMemo(() => normalized.map((s) => !!s && (counts.get(s) || 0) > 1), [normalized, counts]);
  const duplicateNames = useMemo(() => Array.from(counts.entries()).filter(([, c]) => c > 1).map(([n]) => n), [counts]);

  useEffect(() => {
    const ta = taRef.current, gut = gutterRef.current; if (!ta || !gut) return;
    const sync = () => { gut.scrollTop = ta.scrollTop; };
    ta.addEventListener('scroll', sync, { passive: true });
    return () => ta.removeEventListener('scroll', sync as any);
  }, []);

  // Caret + scroll persistence to prevent jumpy typing
  useEffect(() => {
    const ta = taRef.current as HTMLTextAreaElement | null; if (!ta) return;
    if (typeof scrollRef.current === 'number') ta.scrollTop = scrollRef.current;
    if (document.activeElement === ta) {
      try { ta.selectionStart = selRef.current.start; ta.selectionEnd = selRef.current.end; } catch {}
    }
  }, [value]);

  const hasDupes = duplicateNames.length > 0;

  return (
    <div className="block text-sm">
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id}>{label} (one per line)</label>
        <span className="text-[11px] text-slate-600">People: <span className="font-semibold">{nonEmptyCount}</span></span>
      </div>

      <div className={`relative border rounded-xl shadow-sm grid bg-white ${hasDupes ? 'ring-1 ring-red-300 border-red-400' : 'border-slate-200'}`} style={{ gridTemplateColumns: 'auto 1fr' }}>
        {/* Line numbers */}
        <div
          ref={gutterRef}
          className="select-none text-right text-xs bg-slate-50/80 border-r rounded-l-xl px-2 py-2 overflow-auto"
          style={{ maxHeight: '10rem' }}
          aria-hidden
        >
          {lines.map((_, i) => (
            <div key={i} className={`leading-5 tabular-nums ${isDupLine[i] ? 'bg-red-50 text-red-600 font-semibold' : 'text-slate-400'}`}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea with duplicate highlight overlay */}
        <div className="relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-r-xl" aria-hidden>
            {lines.map((_, i) => (
              <div key={i} className={`h-5 ${isDupLine[i] ? 'bg-red-50' : ''}`} style={{ lineHeight: '1.25rem' }} />
            ))}
          </div>
          <textarea
            id={id}
            ref={taRef}
            className="w-full h-40 px-2 py-2 rounded-r-xl focus:outline-none bg-transparent relative z-10 leading-5 text-[13px] text-slate-800"
            value={value}
            placeholder={placeholder || ''}
            onChange={(e) => {
              const ta = e.currentTarget;
              selRef.current = { start: (ta.selectionStart ?? 0), end: (ta.selectionEnd ?? 0) };
              scrollRef.current = ta.scrollTop;
              onChange(e);
            }}
            onSelect={(e) => {
              const ta = e.currentTarget as HTMLTextAreaElement;
              selRef.current = { start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 };
            }}
            onScroll={(e) => { scrollRef.current = (e.currentTarget as HTMLTextAreaElement).scrollTop; }}
            style={{ resize: 'vertical', lineHeight: '1.25rem' }}
            aria-invalid={hasDupes}
            aria-errormessage={hasDupes ? `${id}-dups` : undefined}
          />
        </div>
      </div>

      {hasDupes && (
        <div id={`${id}-dups`} className="text-xs text-red-600 mt-1">
          Duplicate names detected: <span className="font-medium">{duplicateNames.join(', ')}</span>
        </div>
      )}
    </div>
  );
}


const LineNumberTextarea = LinedTextarea;

/* ========================= TRIPLES: helpers & views ========================= */

type TriplesBucket = { name:string; W:number; L:number; PD:number };

function computeTriplesStandings(matches:TriplesMatchRow[], guysText:string, girlsText:string){
  const guysList = Array.from(new Set((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)));
  const girlsList= Array.from(new Set((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)));
  const girlsSet = new Set(girlsList.map(slug));
  const g = new Map<string,TriplesBucket>();
  const h = new Map<string,TriplesBucket>();
  const ensure=(map:Map<string,TriplesBucket>, n:string)=>{ if(!map.has(n)) map.set(n,{name:n,W:0,L:0,PD:0}); return map.get(n)!; };
  for(const n of guysList) ensure(g,n);
  for(const n of girlsList) ensure(h,n);
  for(const m of matches){
    const s=parseScore(m.scoreText); if(!s) continue;
    const [a,b]=s; if(!isValidTriplesScore(a,b)) continue;
    const diff=Math.abs(a-b); const t1Won=a>b;
    const apply=(name:string, won:boolean)=>{
      const map = girlsSet.has(slug(name)) ? h : g;
      const row=ensure(map,name);
      if(won){row.W++; row.PD+=diff;} else {row.L++; row.PD-=diff;}
    };
    for(const p of m.t1) apply(p,t1Won);
    for(const p of m.t2) apply(p,!t1Won);
  }
  const sortRows=(arr:TriplesBucket[])=> arr.sort((x,y)=> y.W-x.W || y.PD-x.PD || x.name.localeCompare(y.name));
  return { guysRows: sortRows(Array.from(g.values())), girlsRows: sortRows(Array.from(h.values())) };
}

function TriplesLeaderboard({matches,guysText,girlsText}:{matches:TriplesMatchRow[];guysText:string;girlsText:string;}){
  const {guysRows,girlsRows}=useMemo(()=>computeTriplesStandings(matches,guysText,girlsText),[matches,guysText,girlsText]);
  const Table = ({title, rows}:{title:string; rows:TriplesBucket[]}) => (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[15px] font-semibold text-sky-800 mb-2">{title}</h3>
      <div className="overflow-x-auto"><table className="min-w-full text-[13px]"><thead><tr className="text-left text-slate-600"><th className="py-1 px-2">#</th><th className="py-1 px-2">Player</th><th className="py-1 px-2">W</th><th className="py-1 px-2">L</th><th className="py-1 px-2">PD</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.name} className="border-t"><td className="py-1 px-2 tabular-nums">{i+1}</td><td className="py-1 px-2">{r.name}</td><td className="py-1 px-2 tabular-nums">{r.W}</td><td className="py-1 px-2 tabular-nums">{r.L}</td><td className="py-1 px-2 tabular-nums">{r.PD}</td></tr>)}</tbody></table></div>
    </section>
  );
  return <section><h2 className="text-[18px] font-bold text-sky-900 mb-1">Leaderboard (Triples – Live)</h2><p className="text-[11px] text-slate-500 mb-3">Pool (triples): one game to 21+, win by 2, no cap.</p><div className="grid md:grid-cols-2 gap-4"><Table title="Guys Standings (Triples)" rows={guysRows} /><Table title="Girls Standings (Triples)" rows={girlsRows} /></div></section>;
}

function TriplesMatchesView({matches,setMatches}:{matches:TriplesMatchRow[]; setMatches:(f:(prev:TriplesMatchRow[])=>TriplesMatchRow[]|TriplesMatchRow[])=>void;}){
  const rounds = useMemo(()=> uniq(matches.map(m=>m.round)).sort((a,b)=>a-b), [matches]);
  const [open, setOpen] = useState(()=> new Set<number>(rounds.length ? [rounds[rounds.length-1]] : []));
  const [confirmR, setConfirmR] = useState<number|null>(null);
  useEffect(()=>{ if(rounds.length) setOpen(new Set([rounds[rounds.length-1]])); }, [matches.length]);
  const update=(id:string, patch:Partial<TriplesMatchRow>)=> setMatches(prev=> prev.map(m=> m.id===id? {...m, ...patch}: m));
  const doDelete=(round:number)=>{ setMatches(prev=> prev.filter(m=>m.round!==round)); setConfirmR(null); };
  return <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100"><h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Triples)</h2><div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />{rounds.length===0 && <p className="text-[13px] text-gray-600 max-w-lg mx-auto">No triples matches yet.</p>}<div className="mt-2 space-y-3">{rounds.map(r=><div key={r} className="border rounded-xl overflow-hidden shadow-sm bg-white"><div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center"><button className="text-left font-medium text-[14px] text-slate-800" onClick={()=>{ const n=new Set(open); if(n.has(r)) n.delete(r); else n.add(r); setOpen(n); }}>Round {r}<span className="ml-2 text-[11px] text-slate-500">{open.has(r)?'Click to collapse':'Click to expand'}</span></button><button className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700" onClick={()=>setConfirmR(r)}>Delete Round</button></div>{confirmR===r && <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]"><span className="text-red-700">Delete Round {r}?</span><div className="flex items-center gap-2"><button className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-[11px]" onClick={()=>doDelete(r)}>Confirm</button><button className="px-2 py-1 rounded border text-[11px]" onClick={()=>setConfirmR(null)}>Cancel</button></div></div>}{open.has(r) && <div className="overflow-x-auto"><table className="min-w-full text-[13px]"><thead className="sticky top-0 bg-white/90 backdrop-blur"><tr className="text-left text-slate-600"><th className="py-1 px-2">Court</th><th className="py-1 px-2">Team 1</th><th className="py-1 px-2">Team 2</th><th className="py-1 px-2">Score</th></tr></thead><tbody>{matches.filter(m=>m.round===r).sort((a,b)=>a.court-b.court).map((m,idx)=>{ const parsed=parseScore(m.scoreText); const valid=parsed ? isValidTriplesScore(parsed[0],parsed[1]) : (m.scoreText ? false : true); const t1Win=parsed && valid ? parsed[0]>parsed[1] : null; return <tr key={m.id} className={(idx%2?'bg-slate-50/60 ':'')+' border-t'}><td className="py-1 px-2 tabular-nums">{m.court}</td><td className={`py-1 px-2 ${t1Win===true ? 'bg-emerald-50':''}`}>{m.t1.join(', ')}</td><td className={`py-1 px-2 ${t1Win===false ? 'bg-emerald-50':''}`}>{m.t2.join(', ')}</td><td className="py-1 px-2"><input className={'w-40 border rounded px-2 py-1 text-[12px] '+(valid ? 'border-slate-300':'border-red-500 bg-red-50')} value={m.scoreText||''} onChange={(e)=>update(m.id,{scoreText:e.target.value})} placeholder="22-20" /></td></tr>; })}</tbody></table></div>}</div>)}</div></section>;
}

function TriplesRoundGenerator({guysText,girlsText,matches,setMatches}:{guysText:string;girlsText:string;matches:TriplesMatchRow[]; setMatches:(f:(prev:TriplesMatchRow[])=>TriplesMatchRow[]|TriplesMatchRow[])=>void;}){
  const [roundsToGen,setRoundsToGen]=useState(1);
  const [startCourt,setStartCourt]=useState(1);
  const [minGirlsPerTeam,setMinGirlsPerTeam]=useState(1);
  const guys = useMemo(()=> uniq((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)), [guysText]);
  const girls= useMemo(()=> uniq((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)), [girlsText]);
  function buildRound(roundIdx:number){
    const gPool = shuffle(guys); const fPool = shuffle(girls);
    const total = gPool.length + fPool.length; const teamsCount = Math.floor(total/3);
    const teams:string[][]=[];
    for(let i=0;i<teamsCount;i++){
      const team:string[]=[];
      const girlsNeeded=Math.min(minGirlsPerTeam, fPool.length >= (teamsCount-i) ? minGirlsPerTeam : fPool.length);
      for(let g=0; g<girlsNeeded && fPool.length; g++) team.push(fPool.shift()!);
      while(team.length<3 && gPool.length) team.push(gPool.shift()!);
      while(team.length<3 && fPool.length) team.push(fPool.shift()!);
      if(team.length===3) teams.push(team);
    }
    const made:TriplesMatchRow[]=[]; let court=startCourt;
    const list=shuffle(teams);
    while(list.length>=2){ const a=list.shift()!; const b=list.shift()!; made.push({id:`${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, round:roundIdx, court:court++, t1:a, t2:b, girlsNeeded:minGirlsPerTeam, scoreText:''}); }
    return made;
  }
  function onGenerate(){
    const n=clampN(roundsToGen,1); const out:TriplesMatchRow[]=[];
    const currentMax = matches.reduce((mx,m)=>Math.max(mx,m.round),0) || 0;
    for(let i=1;i<=n;i++) out.push(...buildRound(currentMax+i));
    setMatches(prev=>(Array.isArray(prev)?prev:[]).concat(out));
  }
  return <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4"><div className="flex items-center justify-between gap-3 flex-wrap"><h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Triples)</h3><div className="flex items-center gap-3 text-[12px] flex-wrap"><label className="flex items-center gap-1">Rounds<input type="number" min={1} value={roundsToGen} onChange={(e)=>setRoundsToGen(clampN(+e.target.value||1,1))} className="w-16 border rounded px-2 py-1" /></label><label className="flex items-center gap-1">Start court<input type="number" min={1} value={startCourt} onChange={(e)=>setStartCourt(clampN(+e.target.value||1,1))} className="w-16 border rounded px-2 py-1" /></label><label className="flex items-center gap-1">Min girls / team<input type="number" min={0} max={3} value={minGirlsPerTeam} onChange={(e)=>setMinGirlsPerTeam(clampN(+e.target.value||0,0))} className="w-16 border rounded px-2 py-1" /></label><button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]" onClick={onGenerate}>Generate</button></div></div><p className="text-[11px] text-slate-500 mt-2">Triples uses teams of 3 and tries to honor the minimum girls-per-team setting whenever the roster makes that possible.</p></section>;
}

function TriplesPlayoffBuilder({matches,guysText,girlsText,setBrackets}:{matches:TriplesMatchRow[];guysText:string;girlsText:string;setBrackets:(f:(prev:BracketMatch[])=>BracketMatch[]|BracketMatch[])=>void;}){
  const {guysRows,girlsRows}=useMemo(()=>computeTriplesStandings(matches,guysText,girlsText),[matches,guysText,girlsText]);
  const [teamCount,setTeamCount]=useState(8);
  function onBuild(){
    const all = [...guysRows.map(r=>({...r, gender:'M'})), ...girlsRows.map(r=>({...r, gender:'F'}))].sort((a,b)=> b.W-a.W || b.PD-a.PD || a.name.localeCompare(b.name));
    const selected = all.slice(0, Math.min(teamCount*3, all.length));
    const teams:Team[]=[];
    for(let i=0;i+2<selected.length;i+=3){
      const members=[selected[i].name, selected[i+1].name, selected[i+2].name];
      const name=members.join(' / ');
      teams.push({id:`TR-${teams.length+1}-${slug(name)}`, name, members, seed:teams.length+1, division:'UPPER'});
    }
    setBrackets(()=>buildBracket('UPPER', teams.slice(0, teamCount), 0));
  }
  return <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4"><h3 className="text-[16px] font-semibold text-sky-800 mb-2">Playoff Setup (Triples)</h3><div className="flex items-center gap-3 text-[12px] flex-wrap"><label className="flex items-center gap-2">Teams in bracket<input className="w-20 border rounded px-2 py-1" type="number" min={2} value={teamCount} onChange={(e)=>setTeamCount(clampN(+e.target.value||2,2))} /></label><button className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-[13px]" onClick={onBuild}>Build Triples Bracket</button></div><p className="text-[11px] text-slate-500 mt-2">Builds a simple triples bracket from the top triples standings pool.</p></section>;
}

/* ========================= DOUBLES: Matches View ========================= */

function MatchesView({
  matches,
  setMatches,
}:{
  matches:MatchRow[];
  setMatches:(f:(prev:MatchRow[])=>MatchRow[]|MatchRow[])=>void;
}){
  const rounds = useMemo(()=> uniq(matches.map(m=>m.round)).sort((a,b)=>a-b), [matches]);
  const [open, setOpen] = useState(()=> new Set<number>(rounds.length? [rounds[rounds.length-1]] : []));
  const [confirmR, setConfirmR] = useState<number|null>(null);
  useEffect(()=>{ if(rounds.length) setOpen(new Set([rounds[rounds.length-1]])); }, [matches.length]);

  const update=(id:string, patch:Partial<MatchRow>)=> setMatches(prev=> prev.map(m=> m.id===id? {...m, ...patch}: m));
  const requestDelete = (round:number) => { setConfirmR(round); };
  const doDelete = (round:number) => { setMatches(prev=> prev.filter(m=> m.round !== round)); setConfirmR(null); };

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Doubles)</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {rounds.length===0 && (
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No matches yet. Use the Round Generator to create blind-draw pool play.
        </p>
      )}

      <div className="mt-2 space-y-3">
        {rounds.map(r=> (
          <div key={r} className="border rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
              <button
                className="text-left font-medium text-[14px] text-slate-800"
                onClick={()=>{ const n=new Set(open); if(n.has(r)) n.delete(r); else n.add(r); setOpen(n); }}
              >
                Round {r}
                <span className="ml-2 text-[11px] text-slate-500">
                  {open.has(r)? 'Click to collapse' : 'Click to expand'}
                </span>
              </button>
              <button
                className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={()=>requestDelete(r)}
                title="Delete this entire round"
              >
                Delete Round
              </button>
            </div>

            {/* Inline confirm bar */}
            {confirmR===r && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
                <span className="text-red-700">
                  Delete Round {r}? This will remove all matches and scores in this round.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-[11px]"
                    onClick={()=>doDelete(r)}
                  >
                    Confirm
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-[11px]"
                    onClick={()=>setConfirmR(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open.has(r) && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead className="sticky top-0 bg-white/90 backdrop-blur">
                    <tr className="text-left text-slate-600">
                      <th className="py-1 px-2">Court</th>
                      <th className="py-1 px-2">Team 1</th>
                      <th className="py-1 px-2">Team 2</th>
                      <th className="py-1 px-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.filter(m=>m.round===r).sort((a,b)=>a.court-b.court).map((m,idx)=> {
                      const parsed = parseScore(m.scoreText);
                      const valid = parsed ? isValidDoublesScore(parsed[0], parsed[1]) : (m.scoreText ? false : true);
                      const t1Win = parsed && valid ? parsed[0] > parsed[1] : null; // auto-pick winner

                      return (
                        <tr
                          key={m.id}
                          className={
                            "border-t " +
                            (idx%2? 'bg-slate-50/60 ' : '') +
                            (m.tag==='ULTIMATE_REVCO' ? 'bg-blue-50/60' :
                             m.tag==='POWER_PUFF' ? 'bg-pink-50/60' : '')
                          }
                        >
                          <td className="py-1 px-2 tabular-nums">{m.court}</td>

                          {/* Team 1 cell tints green if T1 won */}
                          <td className={`py-1 px-2 ${t1Win===true ? 'bg-emerald-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              {m.tag==='ULTIMATE_REVCO' && (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200">
                                  Ultimate Revco
                                </span>
                              )}
                              {m.tag==='POWER_PUFF' && (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 ring-1 ring-pink-200">
                                  Power Puff
                                </span>
                              )}
                              <span>{m.t1p1} &amp; {m.t1p2}</span>
                            </div>
                          </td>

                          {/* Team 2 cell tints green if T2 won */}
                          <td className={`py-1 px-2 ${t1Win===false ? 'bg-emerald-50' : ''}`}>
                            {m.t2p1} &amp; {m.t2p2}
                          </td>

                          {/* Score input shows red while invalid, neutral when valid/empty */}
                          <td className="py-1 px-2">
                            <input
                              className={
                                "w-40 border rounded px-2 py-1 text-[12px] " +
                                (valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                              }
                              value={m.scoreText || ''}
                              onChange={(e)=>update(m.id,{scoreText:e.target.value})}
                              placeholder="win by 2 (e.g., 22-20)"
                              title="Pool play (doubles): one game to 21+, must win by 2 (no cap)"
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

/* ========================= DOUBLES: Round Generator ========================= */

function RoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}:{
  guysText:string;
  girlsText:string;
  matches:MatchRow[];
  setMatches:(f:(prev:MatchRow[])=>MatchRow[]|MatchRow[])=>void;
}){
  const [strict, setStrict] = useState(true);
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);
  const [seedStr, setSeedStr] = useState('');

  const guys = useMemo(()=> uniq((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)),[guysText]);
  const girls= useMemo(()=> uniq((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)),[girlsText]);

  // Build maps from a given match history (so we can update within a multi-round generation batch)
  const buildPartnerMap = (history:MatchRow[])=>{
    const mp = new Map<string, Set<string>>();
    for(const m of history){
      const add=(a?:string,b?:string)=>{
        if(!a||!b) return;
        const A=slug(a),B=slug(b);
        if(!mp.has(A)) mp.set(A,new Set());
        if(!mp.has(B)) mp.set(B,new Set());
        mp.get(A)!.add(B); mp.get(B)!.add(A);
      };
      add(m.t1p1,m.t1p2); add(m.t2p1,m.t2p2);
    }
    return mp;
  };
  const buildOpponentMap = (history:MatchRow[])=>{
    const mp = new Map<string, Set<string>>();
    for(const m of history){
      const t1=[m.t1p1,m.t1p2], t2=[m.t2p1,m.t2p2];
      for(const a of t1) for(const b of t2){
        if(!a||!b) continue;
        const A=slug(a),B=slug(b);
        if(!mp.has(A)) mp.set(A,new Set());
        mp.get(A)!.add(B);
      }
      for(const a of t2) for(const b of t1){
        if(!a||!b) continue;
        const A=slug(a),B=slug(b);
        if(!mp.has(A)) mp.set(A,new Set());
        mp.get(A)!.add(B);
      }
    }
    return mp;
  };

  const canPair = (mp:Map<string,Set<string>>, a:string,b:string)=> !strict ? true : !(mp.get(slug(a))?.has(slug(b)));
  const haventOpposed = (mp:Map<string,Set<string>>, a:string,b:string)=> !strict ? true : !(mp.get(slug(a))?.has(slug(b)));

  function buildRound(roundIdx:number, history:MatchRow[]){
    const seedNum = seedStr ? Number(seedStr) : undefined;
    const G = shuffle(guys, seedNum);
    const H = shuffle(girls, seedNum? seedNum+17 : undefined);

    const partnerMap = buildPartnerMap(history);
    const opponentMap = buildOpponentMap(history);

    const pairs: {team:[string,string], tag:MatchRow['tag']}[] = [];
    const n = Math.min(G.length, H.length);

    for(let i=0;i<n;i++){
      const g = G[i], h = H[i];
      if(canPair(partnerMap,g,h)){
        pairs.push({team:[g,h], tag:null});
        const a=slug(g), b=slug(h);
        partnerMap.get(a)?.add(b) || partnerMap.set(a,new Set([b]));
        partnerMap.get(b)?.add(a) || partnerMap.set(b,new Set([a]));
      }else{
        let placed=false;
        for(let j=i+1;j<n;j++){
          if(canPair(partnerMap,g,H[j])){
            const tmp=H[i]; H[i]=H[j]; H[j]=tmp;
            pairs.push({team:[g,H[i]], tag:null});
            placed=true;
            const a=slug(g), b=slug(H[i]);
            partnerMap.get(a)?.add(b) || partnerMap.set(a,new Set([b]));
            partnerMap.get(b)?.add(a) || partnerMap.set(b,new Set([a]));
            break;
          }
        }
        if(!placed){
          pairs.push({team:[g,h], tag:null});
          const a=slug(g), b=slug(h);
          partnerMap.get(a)?.add(b) || partnerMap.set(a,new Set([b]));
          partnerMap.get(b)?.add(a) || partnerMap.set(b,new Set([a]));
        }
      }
    }

    const extraGuys = G.slice(n);
    const extraGirls= H.slice(n);
    if(extraGuys.length>=2) pairs.push({team:[extraGuys[0], extraGuys[1]], tag:'ULTIMATE_REVCO'});
    if(extraGirls.length>=2) pairs.push({team:[extraGirls[0], extraGirls[1]], tag:'POWER_PUFF'});

    // Pair teams onto courts (exactly two teams per court)
    const teamList = pairs.slice();
    const made: MatchRow[] = [];
    let court = startCourt;
    while(teamList.length>=2){
      const a = teamList.shift()!;
      let idx=0, found=false;
      for(let i=0;i<teamList.length;i++){
        const b = teamList[i];
        const ok =
          haventOpposed(opponentMap,a.team[0],b.team[0]) &&
          haventOpposed(opponentMap,a.team[0],b.team[1]) &&
          haventOpposed(opponentMap,a.team[1],b.team[0]) &&
          haventOpposed(opponentMap,a.team[1],b.team[1]);
        if(ok){ idx=i; found=true; break; }
      }
      const b = teamList.splice(found?idx:0,1)[0];
      // update opponent map so later pairings in this same round avoid repeats
      [a.team[0],a.team[1]].forEach(A=>[b.team[0],b.team[1]].forEach(B=>{
        const SA=slug(A), SB=slug(B);
        opponentMap.get(SA)?.add(SB) || opponentMap.set(SA,new Set([SB]));
      }));
      [b.team[0],b.team[1]].forEach(A=>[a.team[0],a.team[1]].forEach(B=>{
        const SA=slug(A), SB=slug(B);
        opponentMap.get(SA)?.add(SB) || opponentMap.set(SA,new Set([SB]));
      }));

      made.push({
        id: `${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
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

  function onGenerate(){
    const n = clampN(roundsToGen, 1);
    const out: MatchRow[] = [];
    // Use a moving history so new rounds in the same batch respect strict rules
    let history = matches.slice();
    const currentMax = history.reduce((mx,m)=> Math.max(mx,m.round),0) || 0;
    for(let i=1;i<=n;i++){
      const roundIdx = currentMax + i;
      const one = buildRound(roundIdx, history);
      out.push(...one);
      history = history.concat(one);
    }
    setMatches(prev=> (Array.isArray(prev)? prev:[]).concat(out));
  }

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Doubles)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e)=>setStrict(e.target.checked)}
            />
            Strict no-repeat
          </label>
          <label className="flex items-center gap-1">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={(e)=>setRoundsToGen(clampN(+e.target.value||1,1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={(e)=>setStartCourt(clampN(+e.target.value||1,1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            Seed
            <input
              type="text"
              value={seedStr}
              onChange={(e)=>setSeedStr(e.target.value)}
              placeholder="optional"
              className="w-24 border rounded px-2 py-1"
            />
          </label>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]"
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        Blue badge = Ultimate Revco (2 guys). Pink badge = Power Puff (2 girls). Strict mode avoids repeat partners &amp;
        opponents. Courts are assigned to exactly two teams per match.
      </p>
    </section>
  );
}

/* ========================= DOUBLES: Leaderboard ========================= */

function Leaderboard({
  matches,
  guysText,
  girlsText,
}:{
  matches:MatchRow[];
  guysText:string;
  girlsText:string;
}){
  // Build player list from rosters (so zero-game players still appear)
  const guysList = useMemo(
    ()=> Array.from(new Set((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))),
    [guysText],
  );
  const girlsList= useMemo(
    ()=> Array.from(new Set((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))),
    [girlsText],
  );
  const guysSet  = useMemo(()=> new Set(guysList.map(slug)), [guysList]);
  const girlsSet = useMemo(()=> new Set(girlsList.map(slug)), [girlsList]);

  type Bucket = { name:string; W:number; L:number; PD:number };
  const baseStats = () => new Map<string, Bucket>();
  const ensure = (map:Map<string,Bucket>, n:string)=>{
    if(!map.has(n)) map.set(n,{name:n, W:0, L:0, PD:0});
    return map.get(n)!;
  };

  const { guysRows, girlsRows } = useMemo(()=>{
    const g = baseStats(); const h = baseStats();
    // Ensure all rostered players show
    for(const n of guysList) ensure(g, n);
    for(const n of girlsList) ensure(h, n);

    // Tally from valid pool scores
    for(const m of matches){
      const s = parseScore(m.scoreText); if(!s) continue;
      const [a,b] = s;
      if(!isValidDoublesScore(a,b)) continue;
      const t1=[m.t1p1,m.t1p2], t2=[m.t2p1,m.t2p2];
      const diff = Math.abs(a-b); const t1Won = a>b;
      const apply = (name:string, won:boolean)=>{
        const key = name;
        const isGuy = guysSet.has(slug(name));
        const isGirl = girlsSet.has(slug(name));
        const map = isGuy ? g : isGirl ? h : g; // fallback to guys if unknown
        const row = ensure(map, key);
        if(won){ row.W++; row.PD += diff; } else { row.L++; row.PD -= diff; }
      };
      for(const p of t1) apply(p, t1Won);
      for(const p of t2) apply(p, !t1Won);
    }

    const sortRows = (arr:Bucket[])=>
      arr.sort((x,y)=> y.W-x.W || y.PD-x.PD || x.name.localeCompare(y.name));
    return {
      guysRows: sortRows(Array.from(g.values())),
      girlsRows: sortRows(Array.from(h.values())),
    };
  }, [matches, guysList, girlsList, guysSet, girlsSet]);

  const Table = ({title, rows}:{title:string; rows:Bucket[]})=> (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[15px] font-semibold text-sky-800 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 px-2">#</th>
              <th className="py-1 px-2">Player</th>
              <th className="py-1 px-2">W</th>
              <th className="py-1 px-2">L</th>
              <th className="py-1 px-2">PD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=> (
              <tr key={r.name} className="border-t">
                <td className="py-1 px-2 tabular-nums">{i+1}</td>
                <td className="py-1 px-2">{r.name}</td>
                <td className="py-1 px-2 tabular-nums">{r.W}</td>
                <td className="py-1 px-2 tabular-nums">{r.L}</td>
                <td className="py-1 px-2 tabular-nums">{r.PD}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section>
      <h2 className="text-[18px] font-bold text-sky-900 mb-1">Leaderboard (Doubles – Live)</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Pool (doubles): one game to 21+, win by 2, no cap. W/L/PD auto-update as you type scores.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Table title="Guys Standings" rows={guysRows} />
        <Table title="Girls Standings" rows={girlsRows} />
      </div>
    </section>
  );
}

/* ========================= DOUBLES: Playoffs & Brackets ========================= */

function computeStandings(matches:MatchRow[], guysText:string, girlsText:string){
  const guysList = Array.from(new Set((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)));
  const girlsList= Array.from(new Set((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)));
  const guysSet  = new Set(guysList.map(slug));
  const girlsSet = new Set(girlsList.map(slug));
  type Bucket = { name:string; W:number; L:number; PD:number };
  const g = new Map<string,Bucket>(), h = new Map<string,Bucket>();
  const ensure=(map:Map<string,Bucket>, n:string)=>{
    if(!map.has(n)) map.set(n,{name:n,W:0,L:0,PD:0});
    return map.get(n)!;
  };
  for(const n of guysList) ensure(g,n);
  for(const n of girlsList) ensure(h,n);
  for(const m of matches){
    const s=parseScore(m.scoreText); if(!s) continue;
    const [a,b]=s;
    if(!isValidDoublesScore(a,b)) continue;
    const t1=[m.t1p1,m.t1p2], t2=[m.t2p1,m.t2p2];
    const diff=Math.abs(a-b);
    const t1Won=a>b;
    const apply=(name:string,won:boolean)=>{
      const map = guysSet.has(slug(name))? g : h;
      const row=ensure(map,name);
      if(won){row.W++; row.PD+=diff;} else {row.L++; row.PD-=diff;}
    };
    for(const p of t1) apply(p,t1Won);
    for(const p of t2) apply(p,!t1Won);
  }
  const sortRows=(arr:Bucket[])=> arr.sort((x,y)=> y.W-x.W || y.PD-x.PD || x.name.localeCompare(y.name));
  return { guysRows: sortRows(Array.from(g.values())), girlsRows: sortRows(Array.from(h.values())) };
}

function nextPow2(n:number){ let p=1; while(p<n) p<<=1; return p; }

function buildBracket(division:PlayDiv, teams:Team[], topSeedByeCount:number = 0): BracketMatch[] {
  const N = teams.length; if (N === 0) return [];
  const size = nextPow2(N);
  function espnOrder(n:number): number[] {
    if (n === 1) return [1];
    if (n === 2) return [1,2];
    const prev = espnOrder(n/2);
    const out:number[] = [];
    for (let i=0;i<prev.length;i+=2){
      const a = prev[i];
      const b = prev[i+1] ?? (n/2);
      out.push(a, n+1-a, b, n+1-b);
    }
    return out;
  }
  const order = espnOrder(size);
  const idxBySeed = new Map<number, number>();
  order.forEach((seed, idx)=> idxBySeed.set(seed, idx));

  const slots: (Team|undefined)[] = new Array(size).fill(undefined);
  const orderedTeams = teams.slice().sort((a,b)=> a.seed - b.seed);
  for(const t of orderedTeams){
    const i = idxBySeed.get(t.seed);
    if(i!==undefined) slots[i] = t;
  }

  const gapByes = Math.max(0, size - N);
  const wantByes = Math.min(Math.max(gapByes, Math.floor(topSeedByeCount)), 5, size);
  const byeSeeds = new Set<number>();
  for(let s=1;s<=wantByes;s++) byeSeeds.add(s);

  const matches: BracketMatch[] = [];
  let round = 1;
  let current: BracketMatch[] = [];
  for(let i=0;i<size;i+=2){
    const m: BracketMatch = {
      id:`${division}-R${round}-${(i/2)+1}`,
      division,
      round,
      slot:(i/2)+1,
      team1:slots[i],
      team2:slots[i+1],
      court:courtFor(division, round, (i/2)+1),
    };
    current.push(m);
  }
  matches.push(...current);

  while(current.length > 1){
    const nextRound: BracketMatch[] = [];
    round++;
    for(let i=0;i<current.length;i+=2){
      const parent: BracketMatch = {
        id:`${division}-R${round}-${(i/2)+1}`,
        division,
        round,
        slot:(i/2)+1,
        court:courtFor(division, round, (i/2)+1),
      };
      const a = current[i], b = current[i+1];
      if(a){ a.nextId = parent.id; a.nextSide = 'team1'; parent.team1SourceId = a.id; }
      if(b){ b.nextId = parent.id; b.nextSide = 'team2'; parent.team2SourceId = b.id; }
      nextRound.push(parent);
    }
    matches.push(...nextRound);
    current = nextRound;
  }

  const byId = new Map(matches.map(m=> [m.id, m] as const));
  const advanceWinner = (m:BracketMatch, team:Team|undefined) => {
    if(!team || !m.nextId || !m.nextSide) return;
    const parent = byId.get(m.nextId); if(!parent) return;
    if(m.nextSide === 'team1') parent.team1 = team; else parent.team2 = team;
  };

  for(const m of matches.filter(x=> x.round===1)){
    const t1 = m.team1, t2 = m.team2;
    if(t1 && !t2 && byeSeeds.has(t1.seed)) advanceWinner(m, t1);
    if(t2 && !t1 && byeSeeds.has(t2.seed)) advanceWinner(m, t2);
  }

  for(const m of matches.filter(x=> x.round===1)){
    const onlyOne = (!!m.team1 && !m.team2) || (!m.team1 && !!m.team2);
    if(onlyOne){
      m.score = 'BYE';
      m.team1 = undefined;
      m.team2 = undefined;
    }
  }

  return matches;
}

// Build visual columns from matches; hide pure BYE leaves
function buildVisualColumns(brackets:BracketMatch[], division:PlayDiv){
  const list = brackets.filter(b=>b.division===division);
  if(list.length===0) return { cols: [] as BracketMatch[][], rounds: 0, size: 0 };
  const maxRound = Math.max(1, ...list.map(b=> b.round));
  const cols: BracketMatch[][] = [];
  for(let r=1;r<=maxRound;r++){
    let col = list.filter(b=> b.round===r).sort((a,b)=> a.slot-b.slot);
    if(r===1){
      col = col.filter(m=> !(m.team1===undefined && m.team2===undefined && (m.score||'').toUpperCase()==='BYE'));
    }
    cols.push(col);
  }
  return { cols, rounds:maxRound, size: (cols[0]?.length||1)*2 };
}

function seedBadge(seed?:number){
  if(!seed && seed!==0) return null;
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 mr-1">
      #{seed}
    </span>
  );
}

function BracketCard({m}:{m:BracketMatch}){
  const parsed = (()=>{
    if(!m.score) return null;
    const t = String(m.score).trim();
    const sep = t.includes('–') ? '–' : '-';
    const p=t.split(sep).map(s=>s.trim());
    if(p.length!==2) return null;
    const a=+p[0], b=+p[1];
    return (isFinite(a)&&isFinite(b))? [a,b] as [number,number]: null;
  })();
  const winnerSide: 'team1'|'team2'|null =
    parsed ? (parsed[0]>parsed[1] ? 'team1' : (parsed[0]<parsed[1] ? 'team2' : null)) : null;

  const TeamLine = ({t,active,label}:{t?:Team; active?:boolean; label:'A'|'B'})=> t ? (
    <div className={
      "flex items-center justify-between gap-1 rounded px-1.5 py-1 " +
      (active? 'bg-emerald-50 ring-1 ring-emerald-200' : '')
    }>
      <div className="flex items-center gap-1 min-w-0">
        <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-slate-100 text-slate-600">
          {label}
        </span>
        {seedBadge(t.seed)}
        <span className="truncate" title={t.name}>{t.name}</span>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-1 text-slate-400">
      <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-slate-100 text-slate-400">
        {label}
      </span>
      <em className="text-[11px]">Waiting on previous match</em>
    </div>
  );

  return (
    <div className="relative min-w-[280px] rounded-xl border bg-white shadow-md p-3">
      <div className="text-[11px] text-slate-500 mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-slate-700">{m.division}</span>
          <span>· R{m.round} · M{m.slot}</span>
          {m.redemption && (
            <span className="ml-1 inline-block text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
              RR
            </span>
          )}
        </span>
        {m.court!==undefined && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200">
            Court {m.court}
          </span>
        )}
      </div>
      <div className="text-sm space-y-1">
        <TeamLine t={m.team1} active={winnerSide==='team1'} label="A" />
        <div className="h-px bg-slate-200" />
        <TeamLine t={m.team2} active={winnerSide==='team2'} label="B" />
      </div>
      {m.score !== undefined && m.score !== 'BYE' && (
        <div className="mt-1 text-xs text-slate-600">
          <span className="text-slate-500">Score:</span> {m.score}
        </div>
      )}
      {/* connectors */}
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
}:{
  brackets:BracketMatch[];
  setBrackets:(f:(prev:BracketMatch[])=>BracketMatch[]|BracketMatch[])=>void;
}){
  const divisions:PlayDiv[] = ['UPPER','LOWER','RR'];

  function parseScoreLoose(s?:string): [number,number] | null {
    if(!s) return null;
    const txt = String(s).trim();
    const sep = txt.includes('–') ? '–' : '-';
    const parts = txt.split(sep).map(p=>p.trim());
    if(parts.length!==2) return null;
    const a = parseInt(parts[0],10), b = parseInt(parts[1],10);
    return (isFinite(a) && isFinite(b)) ? [a,b] : null;
  }

  const onScore=(id:string, score:string)=> setBrackets(prev=>{
    const copy = prev.map(x=> ({...x}));
    const map = new Map(copy.map(m=> [m.id, m] as const));
    const m = map.get(id); if(!m) return copy;
    m.score = score;
    const parsed = parseScoreLoose(score);
    if(parsed){
      const [a,b] = parsed;
      const winner = a>b ? m.team1 : (a<b ? m.team2 : undefined);
      const loser  = a>b ? m.team2 : (a<b ? m.team1 : undefined);
      if(winner && m.nextId && m.nextSide){
        const p = map.get(m.nextId);
        if(p){ if(m.nextSide==='team1') p.team1 = winner; else p.team2 = winner; }
      }
      if(loser && m.loserNextId && m.loserNextSide){
        const q = map.get(m.loserNextId);
        if(q){ if(m.loserNextSide==='team1') q.team1 = loser; else q.team2 = loser; }
      }
    }
    return copy;
  });

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6">
      <h2 className="text-[20px] font-bold text-sky-900 mb-2 tracking-tight">Playoff Brackets</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        ESPN-style seeding and BYEs. Quarterfinals → Semifinals → Final. Winners auto-advance. The{' '}
        <strong>RR</strong> bracket combines UPPER+LOWER losers from R1/R2.
      </p>
      {divisions.map(div=>{
        const cfg = buildVisualColumns(brackets, div);
        const cols = cfg.cols;
        if(!cols.length) return null;
        return (
          <div key={div} className="mb-8">
            <h3 className="font-semibold text-slate-700 mb-2 text-[14px]">{div}</h3>
            <div className="overflow-x-auto">
              <div
                className="grid gap-6"
                style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))` }}
              >
                {cols.map((col, colIdx)=>{
                  const unit = 14;
                  return (
                    <div key={colIdx} className="flex flex-col">
                      {col.map((m, i)=>{
                        const topGap = i===0 ? unit*(Math.pow(2,colIdx)-1) : unit*(Math.pow(2,colIdx+1)-1);
                        const canScore = !!(m.team1 && m.team2);
                        return (
                          <div key={m.id} style={{ marginTop: topGap }}>
                            <BracketCard m={m} />
                            {canScore && (
                              <div className="mt-1">
                                <input
                                  className="w-32 border rounded px-2 py-1 text-[12px]"
                                  value={m.score||''}
                                  onChange={(e)=>onScore(m.id, e.target.value)}
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

function PlayoffBuilder({
  matches,
  guysText,
  girlsText,
  setBrackets,
}:{
  matches:MatchRow[];
  guysText:string;
  girlsText:string;
  setBrackets:(f:(prev:BracketMatch[])=>BracketMatch[]|BracketMatch[])=>void;
}){
  const { guysRows, girlsRows } = useMemo(
    ()=> computeStandings(matches, guysText, girlsText),
    [matches, guysText, girlsText],
  );
  const [upperK, setUpperK] = useState<number>(Math.ceil(Math.max(1, guysRows.length)/2));
  const [seedRandom, setSeedRandom] = useState<boolean>(true);
  const [groupSize, setGroupSize] = useState<number>(4); // randomized pairing window size
  const [byeUpper, setByeUpper] = useState<number>(0); // top-seed BYEs for UPPER
  const [byeLower, setByeLower] = useState<number>(0); // top-seed BYEs for LOWER
  const [rrRandomize, setRrRandomize] = useState<boolean>(false); // randomize partners in combined RR

  // Build teams from buckets, then seed by COMBINED pool results (W first) then combined PD
  function build(div:PlayDiv, guySlice:{start:number,end:number}, girlSlice:{start:number,end:number}){
    const g = guysRows.slice(guySlice.start, guySlice.end); // sorted by guys W/PD already
    const h = girlsRows.slice(girlSlice.start, girlSlice.end);

    // Helper: quick lookup of stats by name
    const gStats = new Map(guysRows.map(r=>[r.name, r] as const));
    const hStats = new Map(girlsRows.map(r=>[r.name, r] as const));

    const teams: Team[] = [];
    const K = Math.min(g.length, h.length);

    for(let base = 0; base < K; base += Math.max(2, groupSize)){
      const end = Math.min(base + Math.max(2, groupSize), K);
      const girlsWindow = h.slice(base, end);
      const girlsShuffled = seedRandom ? shuffle(girlsWindow) : girlsWindow;
      for(let j = base; j < end; j++){
        const guy = g[j];
        const girl = girlsShuffled[j - base];
        const name = `${guy?.name || '—'} & ${girl?.name || '—'}`;
        teams.push({
          id:`${div}-tmp-${j+1}-{slug(name)}`,
          name,
          members:[guy?.name||'', girl?.name||''],
          seed:j+1,
          division:div,
        });
      }
    }

    // Rank by combined record (W first) then combined PD
    const score = (t:Team)=>{
      const stats = t.members.map(n => gStats.get(n) || hStats.get(n) || {W:0,L:0,PD:0});
      const W = stats.reduce((s,v)=> s+(v.W||0), 0);
      const PD= stats.reduce((s,v)=> s+(v.PD||0),0);
      return { W, PD };
    };
    teams.sort((A,B)=>{
      const sA = score(A), sB = score(B);
      return (sB.W - sA.W) || (sB.PD - sA.PD) || A.name.localeCompare(B.name);
    });
    teams.forEach((t,i)=>{
      t.seed = i+1;
      t.id = `${div}-${t.seed}-${slug(t.name)}`;
    });

    return teams;
  }

  function onBuild(){
    const upperTeams = build('UPPER', {start:0,end:upperK}, {start:0,end:upperK});
    const lowerTeams = build('LOWER', {start:upperK,end:guysRows.length}, {start:upperK,end:girlsRows.length});
    const upperMain = buildBracket('UPPER', upperTeams, byeUpper);
    const lowerMain = buildBracket('LOWER', lowerTeams, byeLower);
    setBrackets(() => ([...upperMain, ...lowerMain]));
  }

  function buildCombinedRR(){
    setBrackets(prev => {
      const main = prev.filter(b => b.division==='UPPER' || b.division==='LOWER');
      const rrPruned = prev.filter(b => b.division!=='RR');

      // Collect losers from Round 1 & 2 of UPPER+LOWER **with entered scores**
      const losers: Team[] = [];

      const decided = main.filter(
        m=> (m.round===1 || m.round===2) &&
            m.team1 && m.team2 &&
            typeof m.score==='string' && m.score.trim(),
      );
      for (const m of decided) {
        const parsed = parseScore(m.score);
        if(!parsed) continue;
        const [a,b] = parsed;
        const winner = a>b ? m.team1 : m.team2;
        const loser  = a>b ? m.team2 : m.team1;
        if(loser){
          losers.push({
            id:`RR-carry-${losers.length+1}`,
            name: loser.name,
            members: loser.members,
            seed: losers.length+1,
            division:'RR',
          });
        }
        // also auto-advance winner to next if wiring exists (safety)
        if(winner && m.nextId && m.nextSide){
          const parent = main.find(x=>x.id===m.nextId);
          if(parent){
            if(m.nextSide==='team1') parent.team1 = winner;
            else parent.team2 = winner;
          }
        }
      }

      // Optional: re-randomize RR partners
      let rrTeams: Team[] = [];
      if(rrRandomize){
        const pool = losers.flatMap(t=> t.members);
        const names = uniq(pool).filter(Boolean);
        const shuffled = shuffle(names);
        for(let i=0;i<shuffled.length;i+=2){
          const a = shuffled[i], b = shuffled[i+1]; if(!a || !b) break;
          const name = `${a} & ${b}`;
          rrTeams.push({
            id:`RR-${i/2+1}-${slug(name)}`,
            name,
            members:[a,b],
            seed:(i/2)+1,
            division:'RR',
          });
        }
      }else{
        rrTeams = losers;
      }

      const rrBracket = buildBracket('RR', rrTeams, 0);
      return [...rrPruned, ...rrBracket];
    });
  }

  return (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[16px] font-semibold text-sky-800 mb-2">Playoff Setup (Doubles)</h3>
      <div className="grid md:grid-cols-2 gap-3 text-[12px]">
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            Upper size (per gender)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={1}
              value={upperK}
              onChange={(e)=>setUpperK(clampN(+e.target.value||1,1))}
            />
          </label>
          <label className="flex items-center gap-2">
            Pairing window (group shuffle)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={2}
              value={groupSize}
              onChange={(e)=>setGroupSize(clampN(+e.target.value||2,2))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={seedRandom}
              onChange={(e)=>setSeedRandom(e.target.checked)}
            />
            Randomize within window
          </label>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            Top BYEs (Upper)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={0}
              value={byeUpper}
              onChange={(e)=>setByeUpper(clampN(+e.target.value||0,0))}
            />
          </label>
          <label className="flex items-center gap-2">
            Top BYEs (Lower)
            <input
              className="w-20 border rounded px-2 py-1"
              type="number"
              min={0}
              value={byeLower}
              onChange={(e)=>setByeLower(clampN(+e.target.value||0,0))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rrRandomize}
              onChange={(e)=>setRrRandomize(e.target.checked)}
            />
            RR: allow partner re-randomize
          </label>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm text-[13px]"
          onClick={onBuild}
        >
          Build Upper &amp; Lower
        </button>
        <button
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm text-[13px]"
          onClick={buildCombinedRR}
        >
          Build Redemption Rally
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        Upper/Lower teams are formed by pairing top halves of Guys/Girls and seeding by combined W then PD. BYEs are given
        to top seeds if configured. RR combines first/second-round losers (optionally re-randomized).
      </p>
    </section>
  );
}

/* ========================= QUADS: Matches View ========================= */

function QuadsMatchesView({
  matches,
  setMatches,
}:{
  matches:QuadsMatchRow[];
  setMatches:(f:(prev:QuadsMatchRow[])=>QuadsMatchRow[]|QuadsMatchRow[])=>void;
}){
  const rounds = useMemo(()=> uniq(matches.map(m=>m.round)).sort((a,b)=>a-b), [matches]);
  const [open, setOpen] = useState(()=> new Set<number>(rounds.length? [rounds[rounds.length-1]] : []));
  const [confirmR, setConfirmR] = useState<number|null>(null);
  useEffect(()=>{ if(rounds.length) setOpen(new Set([rounds[rounds.length-1]])); }, [matches.length]);

  const update=(id:string, patch:Partial<QuadsMatchRow>)=> setMatches(prev=> prev.map(m=> m.id===id? {...m, ...patch}: m));
  const requestDelete = (round:number) => { setConfirmR(round); };
  const doDelete = (round:number) => { setMatches(prev=> prev.filter(m=> m.round !== round)); setConfirmR(null); };

  return (
    <section className="bg-white backdrop-blur rounded-2xl shadow-lg ring-1 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-[20px] font-bold text-sky-800 mb-2 tracking-tight">Matches & Results (Quads)</h2>
      <div className="w-24 h-1 bg-sky-500 mx-auto rounded-full mb-4" />

      {rounds.length===0 && (
        <p className="text-[13px] text-gray-600 max-w-lg mx-auto">
          No quads matches yet. Use the Quads Round Generator to create pool play.
        </p>
      )}

      <div className="mt-2 space-y-3">
        {rounds.map(r=> (
          <div key={r} className="border rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
              <button
                className="text-left font-medium text-[14px] text-slate-800"
                onClick={()=>{ const n=new Set(open); if(n.has(r)) n.delete(r); else n.add(r); setOpen(n); }}
              >
                Round {r}
                <span className="ml-2 text-[11px] text-slate-500">
                  {open.has(r)? 'Click to collapse' : 'Click to expand'}
                </span>
              </button>
              <button
                className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={()=>requestDelete(r)}
                title="Delete this entire round"
              >
                Delete Round
              </button>
            </div>

            {/* Inline confirm bar */}
            {confirmR===r && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-[12px]">
                <span className="text-red-700">
                  Delete Round {r}? This will remove all matches and scores in this round.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-[11px]"
                    onClick={()=>doDelete(r)}
                  >
                    Confirm
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-[11px]"
                    onClick={()=>setConfirmR(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open.has(r) && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead className="sticky top-0 bg-white/90 backdrop-blur">
                    <tr className="text-left text-slate-600">
                      <th className="py-1 px-2">Court</th>
                      <th className="py-1 px-2">Team 1 (Quads/Triples)</th>
                      <th className="py-1 px-2">Team 2 (Quads/Triples)</th>
                      <th className="py-1 px-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.filter(m=>m.round===r).sort((a,b)=>a.court-b.court).map((m,idx)=> {
                      const parsed = parseScore(m.scoreText);
                      const valid = parsed ? isValidQuadsScore(parsed[0], parsed[1]) : (m.scoreText ? false : true);
                      const t1Win = parsed && valid ? parsed[0] > parsed[1] : null; // auto-pick winner

                      const labelTeam = (players:string[], isTriple?:boolean)=> (
                        <div className="flex items-center gap-2">
                          {isTriple && (
                            <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                              Triples
                            </span>
                          )}
                          <span>{players.join(', ')}</span>
                        </div>
                      );

                      return (
                        <tr
                          key={m.id}
                          className={
                            "border-t " +
                            (idx%2? 'bg-slate-50/60 ' : '')
                          }
                        >
                          <td className="py-1 px-2 tabular-nums">{m.court}</td>

                          {/* Team 1 cell tints green if T1 won */}
                          <td className={`py-1 px-2 ${t1Win===true ? 'bg-emerald-50' : ''}`}>
                            {labelTeam(m.t1, m.isTriple1)}
                          </td>

                          {/* Team 2 cell tints green if T2 won */}
                          <td className={`py-1 px-2 ${t1Win===false ? 'bg-emerald-50' : ''}`}>
                            {labelTeam(m.t2, m.isTriple2)}
                          </td>

                          {/* Score input (to 21, win by 2, cap 25) */}
                          <td className="py-1 px-2">
                            <input
                              className={
                                "w-40 border rounded px-2 py-1 text-[12px] " +
                                (valid ? 'border-slate-300' : 'border-red-500 bg-red-50')
                              }
                              value={m.scoreText || ''}
                              onChange={(e)=>update(m.id,{scoreText:e.target.value})}
                              placeholder="to 21, cap 25 (e.g., 21-19)"
                              title="Pool play (quads): one game to 21, win by 2, cap 25"
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

/* ========================= QUADS: Round Generator ========================= */

function QuadsRoundGenerator({
  guysText,
  girlsText,
  matches,
  setMatches,
}:{
  guysText:string;
  girlsText:string;
  matches:QuadsMatchRow[];
  setMatches:(f:(prev:QuadsMatchRow[])=>QuadsMatchRow[]|QuadsMatchRow[])=>void;
}){
  const [strict, setStrict] = useState(true);
  const [roundsToGen, setRoundsToGen] = useState(1);
  const [startCourt, setStartCourt] = useState(1);

  const guys = useMemo(()=> uniq((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)),[guysText]);
  const girls= useMemo(()=> uniq((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)),[girlsText]);

  // Opponent map: track which *individuals* have already opposed each other
  const buildOpponentMap = (history:QuadsMatchRow[])=>{
    const mp = new Map<string, Set<string>>();
    for(const m of history){
      const t1=m.t1, t2=m.t2;
      for(const a of t1) for(const b of t2){
        const A=slug(a),B=slug(b);
        if(!mp.has(A)) mp.set(A,new Set());
        mp.get(A)!.add(B);
      }
      for(const a of t2) for(const b of t1){
        const A=slug(a),B=slug(b);
        if(!mp.has(A)) mp.set(A,new Set());
        mp.get(A)!.add(B);
      }
    }
    return mp;
  };
  const haventOpposedTeam = (mp:Map<string,Set<string>>, teamA:string[], teamB:string[])=>{
    if(!strict) return true;
    for(const a of teamA){
      const set = mp.get(slug(a));
      if(!set) continue;
      for(const b of teamB){
        if(set.has(slug(b))) return false;
      }
    }
    return true;
  };

  function buildRound(roundIdx:number, history:QuadsMatchRow[]){
    const G = shuffle(guys);
    const H = shuffle(girls);

    const opponentMap = buildOpponentMap(history);

    const totalPlayers = G.length + H.length;
    const maxQuadsByCounts = Math.min(Math.floor(G.length/2), Math.floor(H.length/2));

    // choose #quads so leftover players form at most 2 triples (0,3,6 leftover)
    let quadsToMake = maxQuadsByCounts;
    for(let q=maxQuadsByCounts;q>=0;q--){
      const leftover = totalPlayers - 4*q;
      if(leftover===0 || leftover===3 || leftover===6){
        quadsToMake = q;
        break;
      }
    }

    const teams: { members:string[]; isTriple:boolean }[] = [];
    let gIdx=0, hIdx=0;

    // Build full quads: 2 guys + 2 girls when possible
    for(let i=0;i<quadsToMake;i++){
      const tGuys = G.slice(gIdx,gIdx+2);
      const tGirls= H.slice(hIdx,hIdx+2);
      gIdx+=2; hIdx+=2;
      teams.push({ members:[...tGuys,...tGirls], isTriple:false });
    }

    // Leftovers → triples (3 or 6 players → 1 or 2 triples)
    const leftovers = [...G.slice(gIdx), ...H.slice(hIdx)];
    for(let i=0;i+2<leftovers.length;i+=3){
      const t = leftovers.slice(i,i+3);
      teams.push({ members:t, isTriple:true });
    }

    // Pair teams into matches, 2 teams per court, try to avoid repeat opponents
    const teamList = teams.slice();
    const made: QuadsMatchRow[] = [];
    let court = startCourt;

    while(teamList.length>=2){
      const a = teamList.shift()!;
      let idx=0, found=false;
      for(let i=0;i<teamList.length;i++){
        const b = teamList[i];
        if(haventOpposedTeam(opponentMap,a.members,b.members)){
          idx=i; found=true; break;
        }
      }
      const b = teamList.splice(found?idx:0,1)[0];

      // update opponent map
      for(const A of a.members){
        const SA=slug(A);
        const set = opponentMap.get(SA) || new Set<string>();
        for(const B of b.members) set.add(slug(B));
        opponentMap.set(SA,set);
      }
      for(const A of b.members){
        const SA=slug(A);
        const set = opponentMap.get(SA) || new Set<string>();
        for(const B of a.members) set.add(slug(B));
        opponentMap.set(SA,set);
      }

      made.push({
        id: `${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        round: roundIdx,
        court: court++,
        t1: a.members,
        t2: b.members,
        isTriple1: a.isTriple,
        isTriple2: b.isTriple,
        scoreText: '',
      });
    }

    return made;
  }

  function onGenerate(){
    const n = clampN(roundsToGen, 1);
    const out: QuadsMatchRow[] = [];
    let history = matches.slice();
    const currentMax = history.reduce((mx,m)=> Math.max(mx,m.round),0) || 0;
    for(let i=1;i<=n;i++){
      const roundIdx = currentMax + i;
      const one = buildRound(roundIdx, history);
      out.push(...one);
      history = history.concat(one);
    }
    setMatches(prev=> (Array.isArray(prev)? prev:[]).concat(out));
  }

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold text-sky-800">Round Generator (Quads)</h3>
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e)=>setStrict(e.target.checked)}
            />
            Strict no-repeat (opponents)
          </label>
          <label className="flex items-center gap-1">
            Rounds
            <input
              type="number"
              min={1}
              value={roundsToGen}
              onChange={(e)=>setRoundsToGen(clampN(+e.target.value||1,1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            Start court
            <input
              type="number"
              min={1}
              value={startCourt}
              onChange={(e)=>setStartCourt(clampN(+e.target.value||1,1))}
              className="w-16 border rounded px-2 py-1"
            />
          </label>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]"
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        Quads engine prioritizes 2 guys + 2 girls per team. Leftover players form up to two Triples teams. Strict mode
        avoids repeat opponents as much as possible.
      </p>
    </section>
  );
}

/* ========================= QUADS: Leaderboard ========================= */

function QuadsLeaderboard({
  matches,
  guysText,
  girlsText,
}:{
  matches:QuadsMatchRow[];
  guysText:string;
  girlsText:string;
}){
  const guysList = useMemo(
    ()=> Array.from(new Set((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))),
    [guysText],
  );
  const girlsList= useMemo(
    ()=> Array.from(new Set((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))),
    [girlsText],
  );
  const guysSet  = useMemo(()=> new Set(guysList.map(slug)), [guysList]);
  const girlsSet = useMemo(()=> new Set(girlsList.map(slug)), [girlsList]);

  type Bucket = { name:string; W:number; L:number; PD:number };
  const baseStats = () => new Map<string, Bucket>();
  const ensure = (map:Map<string,Bucket>, n:string)=>{
    if(!map.has(n)) map.set(n,{name:n, W:0, L:0, PD:0});
    return map.get(n)!;
  };

  const { guysRows, girlsRows } = useMemo(()=>{
    const g = baseStats(); const h = baseStats();
    for(const n of guysList) ensure(g, n);
    for(const n of girlsList) ensure(h, n);

    for(const m of matches){
      const s = parseScore(m.scoreText); if(!s) continue;
      const [a,b] = s;
      if(!isValidQuadsScore(a,b)) continue;
      const diff = Math.abs(a-b);
      const t1Won = a>b;
      const t1 = m.t1;
      const t2 = m.t2;

      const apply = (name:string, won:boolean)=>{
        const key = name;
        const isGuy = guysSet.has(slug(name));
        const isGirl = girlsSet.has(slug(name));
        const map = isGuy ? g : isGirl ? h : g;
        const row = ensure(map, key);
        if(won){ row.W++; row.PD += diff; } else { row.L++; row.PD -= diff; }
      };

      for(const p of t1) apply(p, t1Won);
      for(const p of t2) apply(p, !t1Won);
    }

    const sortRows = (arr:Bucket[])=>
      arr.sort((x,y)=> y.W-x.W || y.PD-x.PD || x.name.localeCompare(y.name));
    return {
      guysRows: sortRows(Array.from(g.values())),
      girlsRows: sortRows(Array.from(h.values())),
    };
  }, [matches, guysList, girlsList, guysSet, girlsSet]);

  const Table = ({title, rows}:{title:string; rows:Bucket[]})=> (
    <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-[15px] font-semibold text-sky-800 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 px-2">#</th>
              <th className="py-1 px-2">Player</th>
              <th className="py-1 px-2">W</th>
              <th className="py-1 px-2">L</th>
              <th className="py-1 px-2">PD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=> (
              <tr key={r.name} className="border-t">
                <td className="py-1 px-2 tabular-nums">{i+1}</td>
                <td className="py-1 px-2">{r.name}</td>
                <td className="py-1 px-2 tabular-nums">{r.W}</td>
                <td className="py-1 px-2 tabular-nums">{r.L}</td>
                <td className="py-1 px-2 tabular-nums">{r.PD}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section>
      <h2 className="text-[18px] font-bold text-sky-900 mb-1">Leaderboard (Quads – Live)</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Pool (quads): one game to 21, win by 2, cap 25. W/L/PD auto-update as you type scores.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Table title="Guys Standings (Quads)" rows={guysRows} />
        <Table title="Girls Standings (Quads)" rows={girlsRows} />
      </div>
    </section>
  );
}

/* ========================= QUADS: Playoff Builder ========================= */

function QuadsPlayoffBuilder({
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
    const bracket = buildBracket("UPPER", finalTeams, 0);
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
        <div className="space-y-2">
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

        <div className="space-y-1 text-[11px] text-slate-600">
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
/* ========================= APP SHELL: Tabs + autosave ========================= */

type TabKey = "DOUBLES" | "QUADS" | "TRIPLES";
type DivisionKey = "UPPER" | "LOWER";
type DivisionState<TMatch> = { guysText:string; girlsText:string; matches:TMatch[]; brackets:BracketMatch[] };

function emptyDivisionState<TMatch>(): DivisionState<TMatch> {
  return { guysText:"", girlsText:"", matches:[], brackets:[] };
}

export default function BlindDrawTourneyApp() {
  const [activeTab, setActiveTab] = useState<TabKey>("DOUBLES");
  const [activeDivision, setActiveDivision] = useState<DivisionKey>("UPPER");

  const [adminKey, setAdminKey] = useState<string>(() => { try { return sessionStorage.getItem("ADMIN_KEY") || ""; } catch { return ""; } });
  const isAdmin = !!adminKey;
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [remoteError, setRemoteError] = useState<string>("");
  const saveTimer = useRef<number | null>(null);

  const [dUpper, setDUpper] = useState<DivisionState<MatchRow>>(emptyDivisionState<MatchRow>());
  const [dLower, setDLower] = useState<DivisionState<MatchRow>>(emptyDivisionState<MatchRow>());
  const [qUpper, setQUpper] = useState<DivisionState<QuadsMatchRow>>(emptyDivisionState<QuadsMatchRow>());
  const [qLower, setQLower] = useState<DivisionState<QuadsMatchRow>>(emptyDivisionState<QuadsMatchRow>());
  const [tUpper, setTUpper] = useState<DivisionState<TriplesMatchRow>>(emptyDivisionState<TriplesMatchRow>());
  const [tLower, setTLower] = useState<DivisionState<TriplesMatchRow>>(emptyDivisionState<TriplesMatchRow>());

  const snapshotState = useMemo(() => ({
    activeTab,
    activeDivision,
    doubles: { UPPER: dUpper, LOWER: dLower },
    quads: { UPPER: qUpper, LOWER: qLower },
    triples: { UPPER: tUpper, LOWER: tLower },
    guysText: dUpper.guysText, girlsText: dUpper.girlsText, matches: dUpper.matches, brackets: dUpper.brackets,
    qGuysText: qUpper.guysText, qGirlsText: qUpper.girlsText, qMatches: qUpper.matches, qBrackets: qUpper.brackets,
    tGuysText: tUpper.guysText, tGirlsText: tUpper.girlsText, tMatches: tUpper.matches, tBrackets: tUpper.brackets,
  } as any), [activeTab, activeDivision, dUpper, dLower, qUpper, qLower, tUpper, tLower]);

  useEffect(() => {
    (async () => {
      try {
        const remote:any = await apiGetState();
        const data:any = remote || (()=>{ try { const raw = localStorage.getItem("sunnysports.autosave"); return raw ? JSON.parse(raw) : null; } catch { return null; } })();
        if (data) {
          if (data.doubles?.UPPER) setDUpper(data.doubles.UPPER); else setDUpper({ guysText:data.guysText||"", girlsText:data.girlsText||"", matches:Array.isArray(data.matches)?data.matches:[], brackets:Array.isArray(data.brackets)?data.brackets:[] });
          if (data.doubles?.LOWER) setDLower(data.doubles.LOWER);
          if (data.quads?.UPPER) setQUpper(data.quads.UPPER); else setQUpper({ guysText:data.qGuysText||"", girlsText:data.qGirlsText||"", matches:Array.isArray(data.qMatches)?data.qMatches:[], brackets:Array.isArray(data.qBrackets)?data.qBrackets:[] });
          if (data.quads?.LOWER) setQLower(data.quads.LOWER);
          if (data.triples?.UPPER) setTUpper(data.triples.UPPER); else setTUpper({ guysText:data.tGuysText||"", girlsText:data.tGirlsText||"", matches:Array.isArray(data.tMatches)?data.tMatches:[], brackets:Array.isArray(data.tBrackets)?data.tBrackets:[] });
          if (data.triples?.LOWER) setTLower(data.triples.LOWER);
          if (data.activeTab === "DOUBLES" || data.activeTab === "QUADS" || data.activeTab === "TRIPLES") setActiveTab(data.activeTab);
          if (data.activeDivision === "UPPER" || data.activeDivision === "LOWER") setActiveDivision(data.activeDivision);
        }
        setLoadingRemote(false);
      } catch (e:any) { setRemoteError(e?.message || "Failed to load shared data"); setLoadingRemote(false); }
    })();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("sunnysports.autosave", JSON.stringify(snapshotState)); } catch {}
    if (!isAdmin) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try { await apiSaveState(snapshotState as any, adminKey); setRemoteError(""); }
      catch (e:any) { setRemoteError(e?.message || "Failed to save shared data"); }
    }, 600);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [snapshotState, isAdmin, adminKey]);

  const AdminBanner = () => (
    <section className="bg-white/90 rounded-lg p-3 text-[12px] text-slate-700 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${isAdmin ? "bg-emerald-500" : "bg-slate-400"}`} />
        <span className="font-semibold">{isAdmin ? "Admin Mode (editing enabled)" : "Viewer Mode (read-only)"}</span>
        {loadingRemote && <span className="text-slate-500">Loading shared data…</span>}
        {!!remoteError && <span className="text-red-600">{remoteError}</span>}
      </div>
      <div className="flex items-center gap-2">
        {!isAdmin ? <button className="px-3 py-1.5 rounded bg-sky-700 text-white hover:bg-sky-800" onClick={() => { const k = prompt("Enter Admin Key to enable editing:"); if (!k) return; try { sessionStorage.setItem("ADMIN_KEY", k); } catch {} setAdminKey(k); }}>Unlock Editing</button> : <button className="px-3 py-1.5 rounded border" onClick={() => { try { sessionStorage.removeItem("ADMIN_KEY"); } catch {} setAdminKey(""); }}>Lock (Viewer Mode)</button>}
      </div>
    </section>
  );

  const DivisionTabs = () => (
    <div className="bg-white/85 rounded-xl p-2 shadow ring-1 ring-slate-200 inline-flex gap-2">
      {(["UPPER","LOWER"] as DivisionKey[]).map(div => (
        <button key={div} className={"px-3 py-1.5 rounded-lg text-[12px] font-medium "+(activeDivision===div ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")} onClick={() => setActiveDivision(div)}>{div} Division</button>
      ))}
    </div>
  );

  const currentD = activeDivision === "UPPER" ? dUpper : dLower;
  const setCurrentD = activeDivision === "UPPER" ? setDUpper : setDLower;
  const currentQ = activeDivision === "UPPER" ? qUpper : qLower;
  const setCurrentQ = activeDivision === "UPPER" ? setQUpper : setQLower;
  const currentT = activeDivision === "UPPER" ? tUpper : tLower;
  const setCurrentT = activeDivision === "UPPER" ? setTUpper : setTLower;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-800 via-sky-700 to-sky-500 text-slate-800 antialiased">
      <header className="sticky top-0 z-10 bg-sky-900/90 backdrop-blur border-b border-sky-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex items-center justify-between gap-3"><SunnyLogo /></div>
          <div className="text-[11px] text-sky-100/80 md:text-right"><div className="font-medium">Tournament Control Panel</div><div>Live blind draw · pool play · playoffs · redemption rally</div></div>
        </div>
        <div className="border-t border-sky-700 bg-sky-900/80"><div className="max-w-6xl mx-auto px-4 py-1.5 flex gap-2 text-[13px]">
          <button className={"px-3 py-1 rounded-t-md border-b-2 "+(activeTab==="DOUBLES" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("DOUBLES")}>Revco Doubles</button>
          <button className={"px-3 py-1 rounded-t-md border-b-2 "+(activeTab==="QUADS" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("QUADS")}>Revco Quads</button>
          <button className={"px-3 py-1 rounded-t-md border-b-2 "+(activeTab==="TRIPLES" ? "bg-white text-sky-900 border-sky-400" : "bg-transparent text-sky-100/80 border-transparent hover:bg-sky-800/60")} onClick={() => setActiveTab("TRIPLES")}>Revco Triples</button>
        </div></div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <AdminBanner />
        <DivisionTabs />

        {activeTab === "DOUBLES" ? <>
          <Leaderboard matches={currentD.matches} guysText={currentD.guysText} girlsText={currentD.girlsText} />
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4"><h2 className="text-[16px] font-semibold text-sky-800 mb-2">Players (Doubles – {activeDivision})</h2><div className="grid md:grid-cols-2 gap-4"><LineNumberTextarea id={`d-guys-${activeDivision}`} label="Guys" value={currentD.guysText} onChange={(e)=>setCurrentD(p=>({...p, guysText:e.target.value}))} /><LineNumberTextarea id={`d-girls-${activeDivision}`} label="Girls" value={currentD.girlsText} onChange={(e)=>setCurrentD(p=>({...p, girlsText:e.target.value}))} /></div></section>
            <RoundGenerator guysText={currentD.guysText} girlsText={currentD.girlsText} matches={currentD.matches} setMatches={(v:any)=>setCurrentD(p=>({...p, matches: typeof v === 'function' ? v(p.matches) : v}))} />
            <MatchesView matches={currentD.matches} setMatches={(v:any)=>setCurrentD(p=>({...p, matches: typeof v === 'function' ? v(p.matches) : v}))} />
            <PlayoffBuilder matches={currentD.matches} guysText={currentD.guysText} girlsText={currentD.girlsText} setBrackets={(v:any)=>setCurrentD(p=>({...p, brackets: typeof v === 'function' ? v(p.brackets) : v}))} />
            <BracketView brackets={currentD.brackets} setBrackets={(v:any)=>setCurrentD(p=>({...p, brackets: typeof v === 'function' ? v(p.brackets) : v}))} />
          </fieldset>
        </> : activeTab === "QUADS" ? <>
          <QuadsLeaderboard matches={currentQ.matches} guysText={currentQ.guysText} girlsText={currentQ.girlsText} />
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4"><h2 className="text-[16px] font-semibold text-sky-800 mb-2">Players (Quads – {activeDivision})</h2><div className="grid md:grid-cols-2 gap-4"><LineNumberTextarea id={`q-guys-${activeDivision}`} label="Guys (Quads)" value={currentQ.guysText} onChange={(e)=>setCurrentQ(p=>({...p, guysText:e.target.value}))} /><LineNumberTextarea id={`q-girls-${activeDivision}`} label="Girls (Quads)" value={currentQ.girlsText} onChange={(e)=>setCurrentQ(p=>({...p, girlsText:e.target.value}))} /></div></section>
            <QuadsRoundGenerator guysText={currentQ.guysText} girlsText={currentQ.girlsText} matches={currentQ.matches} setMatches={(v:any)=>setCurrentQ(p=>({...p, matches: typeof v === 'function' ? v(p.matches) : v}))} />
            <QuadsMatchesView matches={currentQ.matches} setMatches={(v:any)=>setCurrentQ(p=>({...p, matches: typeof v === 'function' ? v(p.matches) : v}))} />
            <QuadsPlayoffBuilder matches={currentQ.matches} guysText={currentQ.guysText} girlsText={currentQ.girlsText} setBrackets={(v:any)=>setCurrentQ(p=>({...p, brackets: typeof v === 'function' ? v(p.brackets) : v}))} />
            {currentQ.brackets.length > 0 && <BracketView brackets={currentQ.brackets} setBrackets={(v:any)=>setCurrentQ(p=>({...p, brackets: typeof v === 'function' ? v(p.brackets) : v}))} />}
          </fieldset>
        </> : <>
          <TriplesLeaderboard matches={currentT.matches} guysText={currentT.guysText} girlsText={currentT.girlsText} />
          <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-95" : ""}>
            <section className="bg-white/95 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4"><h2 className="text-[16px] font-semibold text-sky-800 mb-2">Players (Triples – {activeDivision})</h2><div className="grid md:grid-cols-2 gap-4"><LineNumberTextarea id={`t-guys-${activeDivision}`} label="Guys (Triples)" value={currentT.guysText} onChange={(e)=>setCurrentT(p=>({...p, guysText:e.target.value}))} /><LineNumberTextarea id={`t-girls-${activeDivision}`} label="Girls (Triples)" value={currentT.girlsText} onChange={(e)=>setCurrentT(p=>({...p, girlsText:e.target.value}))} /></div></section>
            <TriplesRoundGenerator guysText={currentT.guysText} girlsText={currentT.girlsText} matches={currentT.matches} setMatches={(v:any)=>setCurrentT(p=>({...p, matches: typeof v === 'function' ? v(p.matches) : v}))} />
            <TriplesMatchesView matches={currentT.matches} setMatches={(v:any)=>setCurrentT(p=>({...p, matches: typeof v === 'function' ? v(p.matches) : v}))} />
            <TriplesPlayoffBuilder matches={currentT.matches} guysText={currentT.guysText} girlsText={currentT.girlsText} setBrackets={(v:any)=>setCurrentT(p=>({...p, brackets: typeof v === 'function' ? v(p.brackets) : v}))} />
            {currentT.brackets.length > 0 && <BracketView brackets={currentT.brackets} setBrackets={(v:any)=>setCurrentT(p=>({...p, brackets: typeof v === 'function' ? v(p.brackets) : v}))} />}
          </fieldset>
        </>}

        <section className="bg-white/80 rounded-lg p-3 text-[11px] text-slate-600"><div className="flex items-center gap-2 flex-wrap"><button className="px-2 py-1 border rounded text-[11px]" onClick={() => { localStorage.removeItem("sunnysports.autosave"); location.reload(); }}>Reset App (clear autosave)</button><span>Each format now has separate UPPER and LOWER division data.</span></div></section>
      </div>
    </main>
  );
}

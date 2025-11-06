import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Sunny Sports Performance – Blind Draw Tourney (stable build)
 *
 * ✅ Guys/Girls text boxes with line numbers + duplicate highlighting + live counts
 * ✅ Strict no-repeat (partners/opponents) toggle inside Round Generator
 * ✅ Random round generation (1 guy + 1 girl / team) with imbalance handling:
 *    - Ultimate Revco = 2 guys (blue)
 *    - Power Puff = 2 girls (pink)
 * ✅ Matches view: collapsible by round, delete-with-confirm, score input, auto-winner tint
 * ✅ Live Leaderboard (Guys & Girls) with W/L/PD (pool rules: to 21+, win by 2, no cap)
 * ✅ Autosave (rosters, matches, brackets) to localStorage
 * ✅ Playoff Builder: split upper/lower, pair within buckets, then **seed by combined W then PD**
 * ✅ Brackets: ESPN-style layout with BYEs placed in correct rounds, winners auto-advance
 * ✅ Redemption Rally (RR): losers from Upper+Lower R1/R2; optional partner re-randomize
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
interface Team { id:string; name:string; members:[string,string]; seed:number; division:PlayDiv; }
interface BracketMatch {
  id:string; division:PlayDiv; round:number; slot:number;
  team1?:Team; team2?:Team; score?:string;
  nextId?: string; nextSide?: 'team1'|'team2';
  team1SourceId?: string; team2SourceId?: string;
  court?: number;
  loserNextId?: string; loserNextSide?: 'team1'|'team2';
  redemption?: boolean;
}

const slug = (s:string)=> s.trim().toLowerCase().replace(/\s+/g,' ');
const uniq = <T,>(arr:T[]) => Array.from(new Set(arr));
const clampN = (n:number, min:number)=> isFinite(n) ? Math.max(min, Math.floor(n)) : min;

const shuffle = <T,>(arr:T[], seed?:number)=>{
  const a = arr.slice();
  let r = seed ?? Math.floor(Math.random()*1e9);
  const rand = ()=> (r = (r*1664525 + 1013904223) % 4294967296) / 4294967296;
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
};

// Court pools for playoffs
const UPPER_COURTS = [1,2,3,4,5];
const LOWER_COURTS = [6,7,8,9,10];
const courtFor = (division:PlayDiv, round:number, slot:number)=>{
  const pool = division==='UPPER' ? UPPER_COURTS : LOWER_COURTS; // RR uses lower courts by default
  return pool[(slot-1) % pool.length];
};

// ===== Pool scoring helpers: one game to 21+, win by 2, no cap
function parseScore(text?: string): [number, number] | null {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(b)) return null;
  return [a, b];
}
function isValidPoolScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
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

      <div className={`relative border rounded-xl shadow-sm grid ${hasDupes ? 'ring-1 ring-red-300 border-red-400' : ''}`} style={{ gridTemplateColumns: 'auto 1fr' }}>
        {/* Line numbers */}
        <div ref={gutterRef} className="select-none text-right text-xs bg-slate-50/80 border-r rounded-l-xl px-2 py-2 overflow-auto" style={{ maxHeight: '10rem' }} aria-hidden>
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
            className="w-full h-40 px-2 py-2 rounded-r-xl focus:outline-none bg-transparent relative z-10 leading-5"
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
        <div id={`${id}-dups`} className="text-xs text-red-600 mt-1">Duplicate names detected: <span className="font-medium">{duplicateNames.join(', ')}</span></div>
      )}
    </div>
  );
}

/* ========================= Matches View ========================= */

function MatchesView({matches, setMatches}:{matches:MatchRow[]; setMatches:(f:(prev:MatchRow[])=>MatchRow[]|MatchRow[])=>void;}){
  const rounds = useMemo(()=> uniq(matches.map(m=>m.round)).sort((a,b)=>a-b), [matches]);
  const [open, setOpen] = useState(()=> new Set<number>(rounds.length? [rounds[rounds.length-1]] : []));
  const [confirmR, setConfirmR] = useState<number|null>(null);
  useEffect(()=>{ if(rounds.length) setOpen(new Set([rounds[rounds.length-1]])); }, [matches.length]);

  const update=(id:string, patch:Partial<MatchRow>)=> setMatches(prev=> prev.map(m=> m.id===id? {...m, ...patch}: m));
  const requestDelete = (round:number) => { setConfirmR(round); };
  const doDelete = (round:number) => { setMatches(prev=> prev.filter(m=> m.round !== round)); setConfirmR(null); };

  return (
    <section className="bg-gradient-to-br from-sky-50 to-white backdrop-blur rounded-xl shadow-lg ring-2 ring-sky-200 p-6 border border-sky-100">
      <h2 className="text-2xl font-bold text-sky-700 mb-2 tracking-tight">Matches & Results</h2>
      <div className="w-20 h-1 bg-sky-400 mx-auto rounded-full mb-4" />

      {rounds.length===0 && <p className="text-sm text-gray-600 max-w-lg mx-auto">No matches yet. Generate rounds to begin.</p>}

      <div className="mt-2 space-y-3">
        {rounds.map(r=> (
          <div key={r} className="border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50/80 border-b flex justify-between items-center">
              <button
                className="text-left font-medium"
                onClick={()=>{ const n=new Set(open); if(n.has(r)) n.delete(r); else n.add(r); setOpen(n); }}
              >
                Round {r}
                <span className="ml-2 text-xs text-slate-500">{open.has(r)? 'Click to collapse' : 'Click to expand'}</span>
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={()=>requestDelete(r)}
                title="Delete this entire round"
              >
                Delete Round
              </button>
            </div>

            {/* Inline confirm bar */}
            {confirmR===r && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between text-sm">
                <span className="text-red-700">Delete Round {r}? This will remove all matches and scores in this round.</span>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700" onClick={()=>doDelete(r)}>Confirm</button>
                  <button className="px-2 py-1 rounded border" onClick={()=>setConfirmR(null)}>Cancel</button>
                </div>
              </div>
            )}

            {open.has(r) && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-1 px-2">Court</th>
                      <th className="py-1 px-2">Team 1</th>
                      <th className="py-1 px-2">Team 2</th>
                      <th className="py-1 px-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.filter(m=>m.round===r).sort((a,b)=>a.court-b.court).map(m=> {
                      const parsed = parseScore(m.scoreText);
                      const valid = parsed ? isValidPoolScore(parsed[0], parsed[1]) : (m.scoreText ? false : true);
                      const t1Win = parsed && valid ? parsed[0] > parsed[1] : null; // auto-pick winner

                      return (
                        <tr key={m.id} className={"border-t " + (m.tag==='ULTIMATE_REVCO' ? 'bg-blue-50/50' : m.tag==='POWER_PUFF' ? 'bg-pink-50/50' : '')}>
                          <td className="py-1 px-2 tabular-nums">{m.court}</td>

                          {/* Team 1 cell tints green if T1 won */}
                          <td className={`py-1 px-2 ${t1Win===true ? 'bg-emerald-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              {m.tag==='ULTIMATE_REVCO' && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200">Ultimate Revco</span>}
                              {m.tag==='POWER_PUFF' && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 ring-1 ring-pink-200">Power Puff</span>}
                              <span>{m.t1p1} &amp; {m.t1p2}</span>
                            </div>
                          </td>

                          {/* Team 2 cell tints green if T2 won */}
                          <td className={`py-1 px-2 ${t1Win===false ? 'bg-emerald-50' : ''}`}>{m.t2p1} &amp; {m.t2p2}</td>

                          {/* Score input shows red while invalid, neutral when valid/empty */}
                          <td className="py-1 px-2">
                            <input
                              className={`w-40 border rounded px-2 py-1 ${valid ? 'border-slate-300' : 'border-red-500 bg-red-50'}`}
                              value={m.scoreText || ''}
                              onChange={(e)=>update(m.id,{scoreText:e.target.value})}
                              placeholder="win by 2 (e.g., 22-20)"
                              title="Pool play: one game to 21+, must win by 2 (no cap)"
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

function RoundGenerator({ guysText, girlsText, matches, setMatches }:{ guysText:string; girlsText:string; matches:MatchRow[]; setMatches:(f:(prev:MatchRow[])=>MatchRow[]|MatchRow[])=>void; }){
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
      const add=(a?:string,b?:string)=>{ if(!a||!b) return; const A=slug(a),B=slug(b); if(!mp.has(A)) mp.set(A,new Set()); if(!mp.has(B)) mp.set(B,new Set()); mp.get(A)!.add(B); mp.get(B)!.add(A); };
      add(m.t1p1,m.t1p2); add(m.t2p1,m.t2p2);
    }
    return mp;
  };
  const buildOpponentMap = (history:MatchRow[])=>{
    const mp = new Map<string, Set<string>>();
    for(const m of history){
      const t1=[m.t1p1,m.t1p2], t2=[m.t2p1,m.t2p2];
      for(const a of t1) for(const b of t2){ if(!a||!b) continue; const A=slug(a),B=slug(b); if(!mp.has(A)) mp.set(A,new Set()); mp.get(A)!.add(B); }
      for(const a of t2) for(const b of t1){ if(!a||!b) continue; const A=slug(a),B=slug(b); if(!mp.has(A)) mp.set(A,new Set()); mp.get(A)!.add(B); }
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
          if(canPair(partnerMap,g,H[j])){ const tmp=H[i]; H[i]=H[j]; H[j]=tmp; pairs.push({team:[g,H[i]], tag:null}); placed=true; 
            const a=slug(g), b=slug(H[i]);
            partnerMap.get(a)?.add(b) || partnerMap.set(a,new Set([b]));
            partnerMap.get(b)?.add(a) || partnerMap.set(b,new Set([a]));
            break; }
        }
        if(!placed){ pairs.push({team:[g,h], tag:null});
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
        const ok = haventOpposed(opponentMap,a.team[0],b.team[0]) && haventOpposed(opponentMap,a.team[0],b.team[1]) && haventOpposed(opponentMap,a.team[1],b.team[0]) && haventOpposed(opponentMap,a.team[1],b.team[1]);
        if(ok){ idx=i; found=true; break; }
      }
      const b = teamList.splice(found?idx:0,1)[0];
      // update opponent map so later pairings in this same round avoid repeats
      [a.team[0],a.team[1]].forEach(A=>[b.team[0],b.team[1]].forEach(B=>{ const SA=slug(A), SB=slug(B); opponentMap.get(SA)?.add(SB) || opponentMap.set(SA,new Set([SB])); }));
      [b.team[0],b.team[1]].forEach(A=>[a.team[0],a.team[1]].forEach(B=>{ const SA=slug(A), SB=slug(B); opponentMap.get(SA)?.add(SB) || opponentMap.set(SA,new Set([SB])); }));

      made.push({ id: `${roundIdx}-${court}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, round: roundIdx, court: court++, t1p1: a.team[0], t1p2: a.team[1], t2p1: b.team[0], t2p2: b.team[1], tag: a.tag || b.tag || null, scoreText: '' });
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
        <h3 className="text-lg font-semibold text-sky-700">Round Generator</h3>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={strict} onChange={(e)=>setStrict(e.target.checked)} /> Strict no-repeat</label>
          <label className="flex items-center gap-1">Rounds <input type="number" min={1} value={roundsToGen} onChange={(e)=>setRoundsToGen(clampN(+e.target.value||1,1))} className="w-16 border rounded px-2 py-1"/></label>
          <label className="flex items-center gap-1">Start court <input type="number" min={1} value={startCourt} onChange={(e)=>setStartCourt(clampN(+e.target.value||1,1))} className="w-16 border rounded px-2 py-1"/></label>
          <label className="flex items-center gap-1">Seed <input type="text" value={seedStr} onChange={(e)=>setSeedStr(e.target.value)} placeholder="optional" className="w-24 border rounded px-2 py-1"/></label>
          <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[.99]" onClick={onGenerate}>Generate</button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">Blue badge = Ultimate Revco (2 guys). Pink badge = Power Puff (2 girls). Strict mode avoids repeat partners & opponents. Courts are assigned to exactly two teams per match.</p>
    </section>
  );
}

/* ========================= Leaderboard ========================= */

function Leaderboard({ matches, guysText, girlsText }:{ matches:MatchRow[]; guysText:string; girlsText:string; }){
  // Build player list from rosters (so zero-game players still appear)
  const guysList = useMemo(()=> Array.from(new Set((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))), [guysText]);
  const girlsList= useMemo(()=> Array.from(new Set((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))), [girlsText]);
  const guysSet  = useMemo(()=> new Set(guysList.map(slug)), [guysList]);
  const girlsSet = useMemo(()=> new Set(girlsList.map(slug)), [girlsList]);

  type Bucket = { name:string; W:number; L:number; PD:number };
  const baseStats = () => new Map<string, Bucket>();
  const ensure = (map:Map<string,Bucket>, n:string)=>{ if(!map.has(n)) map.set(n,{name:n, W:0, L:0, PD:0}); return map.get(n)!; };

  const { guysRows, girlsRows } = useMemo(()=>{
    const g = baseStats(); const h = baseStats();
    // Ensure all rostered players show
    for(const n of guysList) ensure(g, n);
    for(const n of girlsList) ensure(h, n);

    // Tally from valid pool scores
    for(const m of matches){
      const s = parseScore(m.scoreText); if(!s) continue; const [a,b]=s; if(!isValidPoolScore(a,b)) continue;
      const t1=[m.t1p1,m.t1p2], t2=[m.t2p1,m.t2p2];
      const diff = Math.abs(a-b); const t1Won = a>b;
      const apply = (name:string, won:boolean)=>{
        const key = name; const isGuy = guysSet.has(slug(name)); const isGirl = girlsSet.has(slug(name));
        const map = isGuy ? g : isGirl ? h : g; // fallback to guys if unknown
        const row = ensure(map, key);
        if(won){ row.W++; row.PD += diff; } else { row.L++; row.PD -= diff; }
      };
      for(const p of t1) apply(p, t1Won);
      for(const p of t2) apply(p, !t1Won);
    }

    const sortRows = (arr:Bucket[])=> arr.sort((x,y)=> y.W-x.W || y.PD-x.PD || x.name.localeCompare(y.name));
    return { guysRows: sortRows(Array.from(g.values())), girlsRows: sortRows(Array.from(h.values())) };
  }, [matches, guysList, girlsList, guysSet, girlsSet]);

  const Table = ({title, rows}:{title:string; rows:Bucket[]})=> (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h3 className="text-lg font-semibold text-sky-700 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
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
      <h2 className="text-xl font-bold text-sky-700 mb-1">Leaderboard (Live)</h2>
      <p className="text-xs text-slate-500 mb-3">Pool: one game to 21+, win by 2, no cap. W/L/PD auto-update as you type scores.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <Table title="Guys Standings" rows={guysRows} />
        <Table title="Girls Standings" rows={girlsRows} />
      </div>
    </section>
  );
}

/* ========================= Playoffs: standings & bracket ========================= */

function computeStandings(matches:MatchRow[], guysText:string, girlsText:string){
  const guysList = Array.from(new Set((guysText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)));
  const girlsList= Array.from(new Set((girlsText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)));
  const guysSet  = new Set(guysList.map(slug));
  const girlsSet = new Set(girlsList.map(slug));
  type Bucket = { name:string; W:number; L:number; PD:number };
  const g = new Map<string,Bucket>(), h = new Map<string,Bucket>();
  const ensure=(map:Map<string,Bucket>, n:string)=>{ if(!map.has(n)) map.set(n,{name:n,W:0,L:0,PD:0}); return map.get(n)!; };
  for(const n of guysList) ensure(g,n); for(const n of girlsList) ensure(h,n);
  for(const m of matches){
    const s=parseScore(m.scoreText); if(!s) continue; const [a,b]=s; if(!isValidPoolScore(a,b)) continue;
    const t1=[m.t1p1,m.t1p2], t2=[m.t2p1,m.t2p2]; const diff=Math.abs(a-b); const t1Won=a>b;
    const apply=(name:string,won:boolean)=>{ const map = guysSet.has(slug(name))? g : h; const row=ensure(map,name); if(won){row.W++; row.PD+=diff;} else {row.L++; row.PD-=diff;} };
    for(const p of t1) apply(p,t1Won); for(const p of t2) apply(p,!t1Won);
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
  const idxBySeed = new Map<number, number>(); order.forEach((seed, idx)=> idxBySeed.set(seed, idx));

  const slots: (Team|undefined)[] = new Array(size).fill(undefined);
  const orderedTeams = teams.slice().sort((a,b)=> a.seed - b.seed);
  for(const t of orderedTeams){ const i = idxBySeed.get(t.seed); if(i!==undefined) slots[i] = t; }

  const gapByes = Math.max(0, size - N);
  const wantByes = Math.min(Math.max(gapByes, Math.floor(topSeedByeCount)), 5, size);
  const byeSeeds = new Set<number>(); for(let s=1;s<=wantByes;s++) byeSeeds.add(s);

  const matches: BracketMatch[] = [];
  let round = 1;
  let current: BracketMatch[] = [];
  for(let i=0;i<size;i+=2){
    const m: BracketMatch = { id:`${division}-R${round}-${(i/2)+1}`, division, round, slot:(i/2)+1, team1:slots[i], team2:slots[i+1], court:courtFor(division, round, (i/2)+1) };
    current.push(m);
  }
  matches.push(...current);

  while(current.length > 1){
    const nextRound: BracketMatch[] = [];
    round++;
    for(let i=0;i<current.length;i+=2){
      const parent: BracketMatch = { id:`${division}-R${round}-${(i/2)+1}`, division, round, slot:(i/2)+1, court:courtFor(division, round, (i/2)+1) };
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
    if(onlyOne){ m.score = 'BYE'; m.team1 = undefined; m.team2 = undefined; }
  }

  return matches;
}

// Build visual columns from matches; hide pure BYE leaves
function buildVisualColumns(brackets:BracketMatch[], division:PlayDiv){
  const list = brackets.filter(b=>b.division===division);
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
  return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 mr-1">#{seed}</span>;
}

function BracketCard({m}:{m:BracketMatch}){
  const TeamLine = ({t}:{t?:Team})=> t ? (
    <div className="flex items-center gap-1">
      {seedBadge(t.seed)}<span>{t.name}</span>
    </div>
  ) : (
    <div className="flex items-center gap-1 text-slate-400">
      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">BYE</span>
      <em>Top seed advances</em>
    </div>
  );

  return (
    <div className="relative min-w-[260px] rounded-lg border bg-white shadow-sm p-2">
      <div className="text-[11px] text-slate-500 mb-1 flex items-center justify-between"><span>{m.division}{m.redemption? ' · Redemption Rally':''} · R{m.round} · M{m.slot}</span>{m.court!==undefined && (<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200">Court {m.court}</span>)}</div>
      <div className="text-sm">
        <TeamLine t={m.team1} />
        <div className="h-px my-1 bg-slate-200" />
        <TeamLine t={m.team2} />
      </div>
      {m.score !== undefined && (
        <div className="mt-1 text-xs text-slate-600">Score: {m.score}</div>
      )}
      {/* connector visuals */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-10">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-px bg-slate-300" />
      </div>
    </div>
  );
}

function BracketView({brackets, setBrackets}:{brackets:BracketMatch[]; setBrackets:(f:(prev:BracketMatch[])=>BracketMatch[]|BracketMatch[])=>void;}){
  const divisions:PlayDiv[] = ['UPPER','LOWER','RR'];

  function parseScoreLoose(s?:string): [number,number] | null {
    if(!s) return null; const txt = String(s).trim();
    const sep = txt.includes('–') ? '–' : '-';
    const parts = txt.split(sep).map(p=>p.trim()); if(parts.length!==2) return null;
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
      if(winner && m.nextId && m.nextSide){ const p = map.get(m.nextId); if(p){ if(m.nextSide==='team1') p.team1 = winner; else p.team2 = winner; }}
      if(loser && m.loserNextId && m.loserNextSide){ const q = map.get(m.loserNextId); if(q){ if(m.loserNextSide==='team1') q.team1 = loser; else q.team2 = loser; }}
    }
    return copy;
  });

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-6">
      <h2 className="text-xl font-bold text-sky-700 mb-2">Playoff Brackets</h2>
      <p className="text-xs text-slate-500 mb-4">ESPN-style seeding and BYEs. Quarterfinals → Semifinals → Final. Winners auto-advance. The <strong>RR</strong> bracket combines UPPER+LOWER losers from R1/R2.</p>
      {divisions.map(div=>{
        const cfg = buildVisualColumns(brackets, div);
        const cols = cfg.cols;
        return (
          <div key={div} className="mb-8">
            <h3 className="font-semibold text-slate-700 mb-2">{div}</h3>
            <div className="overflow-x-auto">
              <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))` }}>
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
                                  className="w-32 border rounded px-2 py-1 text-sm"
                                  value={m.score||''}
                                  onChange={(e)=>onScore(m.id, e.target.value)}
                                  placeholder="e.g., 21-17"
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

function PlayoffBuilder({matches, guysText, girlsText, setBrackets}:{matches:MatchRow[]; guysText:string; girlsText:string; setBrackets:(f:(prev:BracketMatch[])=>BracketMatch[]|BracketMatch[])=>void;}){
  const { guysRows, girlsRows } = useMemo(()=> computeStandings(matches, guysText, girlsText), [matches, guysText, girlsText]);
  const [upperK, setUpperK] = useState<number>(Math.ceil(Math.max(1, guysRows.length)/2));
  const [seedRandom, setSeedRandom] = useState<boolean>(true);
  const [groupSize, setGroupSize] = useState<number>(4); // randomized pairing window size
  const [byeUpper, setByeUpper] = useState<number>(0); // top-seed BYEs for UPPER
  const [byeLower, setByeLower] = useState<number>(0); // top-seed BYEs for LOWER
  const [rrRandomize, setRrRandomize] = useState<boolean>(false); // randomize partners in combined RR

  // Build teams from buckets, then seed by COMBINED pool results (W, then PD)
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
        // temporary seed (reassigned after ranking)
        teams.push({ id:`${div}-tmp-${j+1}-${slug(name)}`, name, members:[guy?.name||'', girl?.name||''], seed:j+1, division:div });
      }
    }

    // Rank by combined record (W first) then combined PD
    const score = (t:Team)=>{
      const [a,b] = t.members;
      const aS = gStats.get(a) || hStats.get(a) || {W:0,L:0,PD:0};
      const bS = gStats.get(b) || hStats.get(b) || {W:0,L:0,PD:0};
      return { W:(aS.W||0)+(bS.W||0), PD:(aS.PD||0)+(bS.PD||0) };
    };
    teams.sort((A,B)=>{
      const sA = score(A), sB = score(B);
      return (sB.W - sA.W) || (sB.PD - sA.PD) || A.name.localeCompare(B.name);
    });
    // Reassign seeds based on rank
    teams.forEach((t,i)=>{ t.seed = i+1; t.id = `${div}-${t.seed}-${slug(t.name)}`; });

    return teams;
  }

  function onBuild(){
    const upperTeams = build('UPPER', {start:0,end:upperK}, {start:0,end:upperK});
    const lowerTeams = build('LOWER', {start:upperK,end:guysRows.length}, {start:upperK,end:girlsRows.length});
    const upperMain = buildBracket('UPPER', upperTeams, byeUpper);
    const lowerMain = buildBracket('LOWER', lowerTeams, byeLower);
    // Only main brackets initially; RR is built via separate action
    setBrackets(() => ([...upperMain, ...lowerMain]));
  }

  function buildCombinedRR(){
    setBrackets(prev => {
      const main = prev.filter(b => b.division==='UPPER' || b.division==='LOWER');
      const rrPruned = prev.filter(b => b.division!=='RR');

      // Collect losers from Round 1 & 2 of UPPER+LOWER **with entered scores**
      const losers: Team[] = [];
      const guysSet = new Set((guysText||'').split(/\r?\n/).map(s=>slug(s.trim())).filter(Boolean));
      const girlsSet = new Set((girlsText||'').split(/\r?\n/).map(s=>slug(s.trim())).filter(Boolean));

      function teamFromMembers(members:[string,string], seed:number): Team{
        const name = `${members[0]||'—'} & ${members[1]||'—'}`;
        return { id:`RR-${seed}-${slug(name)}`, name, members, seed, division:'RR' };
      }

      const decided = main.filter(m=> (m.round===1 || m.round===2) && m.team1 && m.team2 && typeof m.score==='string' && m.score.trim());
      for(const m of decided){
        const txt = String(m.score);
        const sep = txt.includes('–') ? '–' : '-';
        const parts = txt.split(sep).map(p=>p.trim());
        const a = parseInt(parts[0],10), b = parseInt(parts[1],10);
        if(!isFinite(a) || !isFinite(b)) continue;
        const loserMembers = (a>b) ? (m.team2?.members) : (a<b ? m.team1?.members : undefined);
        if(loserMembers){ losers.push(teamFromMembers([loserMembers[0], loserMembers[1]], losers.length+1)); }
      }

      // Optionally re-randomize partners while keeping gender where possible
      let rrTeams: Team[] = [];
      if(rrRandomize){
        const guys: string[] = []; const girls: string[] = [];
        for(const t of losers){
          const a = t.members[0], b = t.members[1];
          if(guysSet.has(slug(a))) guys.push(a); else if(girlsSet.has(slug(a))) girls.push(a); else guys.push(a);
          if(guysSet.has(slug(b))) guys.push(b); else if(girlsSet.has(slug(b))) girls.push(b); else girls.push(b);
        }
        const G = shuffle(uniq(guys));
        const H = shuffle(uniq(girls));
        const K = Math.min(G.length, H.length);
        for(let i=0;i<K;i++){
          const members:[string,string] = [G[i], H[i]];
          rrTeams.push(teamFromMembers(members, i+1));
        }
        // Handle leftovers: make same-gender teams if needed
        const restG = G.slice(K), restH = H.slice(K);
        while(restG.length>=2){ const members:[string,string]=[restG.shift()!, restG.shift()!]; rrTeams.push(teamFromMembers(members, rrTeams.length+1)); }
        while(restH.length>=2){ const members:[string,string]=[restH.shift()!, restH.shift()!]; rrTeams.push(teamFromMembers(members, rrTeams.length+1)); }
      } else {
        rrTeams = losers;
      }

      const rrBracket = buildBracket('RR', rrTeams, 0);
      return [...rrPruned, ...rrBracket];
    });
  }

  return (
    <section className="bg-white/90 backdrop-blur rounded-xl shadow ring-1 ring-slate-200 p-4">
      <h2 className="text-lg font-semibold text-sky-700">Playoff Setup</h2>
      <p className="text-xs text-slate-500 mb-2">Pairs are formed from standings buckets, then <strong>teams are seeded by combined pool results</strong> (sum of both partners' W, then PD). Upper uses courts 1–5, Lower uses 6–10. Girls can be randomized within <strong>groups of N</strong> before ranking.</p>
      <div className="flex flex-wrap gap-3 items-end text-sm">
        <label className="flex flex-col">Upper size per gender
          <input type="number" min={2} max={Math.max(2,Math.min(guysRows.length,girlsRows.length))} value={upperK} onChange={(e)=>setUpperK(clampN(+e.target.value||upperK,2))} className="w-24 border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col">Randomize in groups of
          <input type="number" min={2} value={groupSize} onChange={(e)=>setGroupSize(clampN(+e.target.value||groupSize,2))} className="w-24 border rounded px-2 py-1" />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={seedRandom} onChange={(e)=>setSeedRandom(e.target.checked)} /> Randomize girls in each group</label>
        <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1" />
        <label className="flex flex-col">Upper BYEs (top seeds)
          <input type="number" min={0} max={5} value={byeUpper} onChange={(e)=>setByeUpper(clampN(+e.target.value||0,0))} className="w-24 border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col">Lower BYEs (top seeds)
          <input type="number" min={0} max={5} value={byeLower} onChange={(e)=>setByeLower(clampN(+e.target.value||0,0))} className="w-24 border rounded px-2 py-1" />
        </label>
        <button className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm" onClick={onBuild}>Build Playoffs</button>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-slate-50 border text-sm">
        <div className="font-medium text-slate-700 mb-1">Redemption Rally (Combined Upper + Lower)</div>
        <p className="text-xs text-slate-500 mb-2">Pulls <strong>losers from Round 1 and Round 2</strong> (with entered scores) across both divisions. You can optionally randomize partners before building the bracket. RR uses Courts 6–10 by default.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={rrRandomize} onChange={(e)=>setRrRandomize(e.target.checked)} /> Randomize partners for RR</label>
          <button className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm" onClick={buildCombinedRR}>Build / Refresh Redemption Rally</button>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">Upper uses top <span className="font-semibold">{upperK}</span> guys & girls (by individual pool results). <strong>Seeding is based on the pair's combined W then PD.</strong> BYEs limited by available bracket spots (power-of-two gap).</div>
    </section>
  );
}

/* ========================= Header (Sunny Sports Performance) ========================= */

function SunnyLogo(){
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width="28" height="28" viewBox="0 0 48 48" className="drop-shadow-sm">
        <defs>
          <radialGradient id="g" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff"/>
            <stop offset="100%" stopColor="#93c5fd"/>
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="48" height="48" rx="10" fill="url(#g)"/>
        {/* sun */}
        <circle cx="24" cy="24" r="8" fill="#fde68a" stroke="#f59e0b" strokeWidth="1"/>
        {Array.from({length:12}).map((_,i)=>{
          const ang = (i*Math.PI*2)/12; const x1=24+Math.cos(ang)*11; const y1=24+Math.sin(ang)*11; const x2=24+Math.cos(ang)*16; const y2=24+Math.sin(ang)*16; return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"/>;
        })}
      </svg>
      <div className="leading-tight">
        <div className="font-bold text-sky-800">Sunny Sports Performance</div>
        <div className="text-[11px] text-slate-500">Blind Draw Tourney</div>
      </div>
    </div>
  );
}

/* ========================= App ========================= */

export default function BlindDrawTourneyApp(){
  const [guysText, setGuysText] = useState('');
  const [girlsText, setGirlsText] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [brackets, setBrackets] = useState<BracketMatch[]>([]);

  // Autosave
  useEffect(()=>{
    try{
      const raw = localStorage.getItem('sunnysports.autosave');
      if(raw){
        const data = JSON.parse(raw);
        if(typeof data.guysText==='string') setGuysText(data.guysText);
        if(typeof data.girlsText==='string') setGirlsText(data.girlsText);
        if(Array.isArray(data.matches)) setMatches(data.matches);
        if(Array.isArray(data.brackets)) setBrackets(data.brackets);
      }
    }catch{}
  },[]);
  useEffect(()=>{
    try{
      localStorage.setItem('sunnysports.autosave', JSON.stringify({guysText, girlsText, matches, brackets}));
    }catch{}
  },[guysText,girlsText,matches,brackets]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-sky-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <SunnyLogo/>
          <span className="text-xs text-slate-500">Autosaves locally</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
        {/* Leaderboard first */}
        <Leaderboard matches={matches} guysText={guysText} girlsText={girlsText} />

        {/* Matches & Results next */}
        <MatchesView matches={matches} setMatches={setMatches} />

        {/* Round generator */}
        <section className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2"><RoundGenerator guysText={guysText} girlsText={girlsText} matches={matches} setMatches={setMatches} /></div>
          <div className="space-y-4">
            <LinedTextarea id="guys" label="Guys" value={guysText} onChange={(e)=>setGuysText(e.target.value)} placeholder="One name per line" />
            <LinedTextarea id="girls" label="Girls" value={girlsText} onChange={(e)=>setGirlsText(e.target.value)} placeholder="One name per line" />
          </div>
        </section>

        {/* Playoffs */}
        <PlayoffBuilder matches={matches} guysText={guysText} girlsText={girlsText} setBrackets={setBrackets} />
        <BracketView brackets={brackets} setBrackets={setBrackets} />

        <footer className="text-center text-xs text-slate-400 py-6">© {new Date().getFullYear()} Sunny Sports Performance</footer>
      </div>
    </main>
  );
}

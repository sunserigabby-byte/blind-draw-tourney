import React from 'react';
import { slug } from '../utils';

// Tap-to-toggle list of players sitting out the playoffs entirely.
// Shared by both playoff formats (fixed-team bracket and rotating teams).
export function PlayoffExclusions({
  allPlayers,
  excluded,
  setExcluded,
}: {
  allPlayers: string[];
  excluded: string[];
  setExcluded: (names: string[]) => void;
}) {
  const excludedSet = new Set(excluded.map(slug));
  const toggle = (name: string) => {
    const has = excludedSet.has(slug(name));
    setExcluded(has ? excluded.filter(n => slug(n) !== slug(name)) : [...excluded, name]);
  };

  return (
    <details className="bg-white/95 rounded-xl shadow ring-1 ring-slate-200 px-4 py-3 text-[12px]" open={excluded.length > 0}>
      <summary className="cursor-pointer text-slate-700 font-medium">
        Not playing playoffs{excluded.length > 0 ? `: ${excluded.join(', ')}` : ' (tap to choose)'}
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {allPlayers.map(name => {
          const out = excludedSet.has(slug(name));
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={'px-2 py-1 rounded-full border text-[11px] ' +
                (out ? 'bg-red-50 border-red-300 text-red-700 line-through' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">Tap a name to take them out of the playoffs; tap again to put them back.</p>
    </details>
  );
}

import React, { useState } from 'react';
import { slug } from '../utils';

/**
 * Reusable panel that lets an admin toggle individual players as
 * "held out" of the next generated round(s).  Held players will be
 * excluded from team assignment and recorded in the round's sitOuts.
 */
export function HoldPanel({
  guys,
  girls,
  heldOut,
  onToggle,
  onClear,
}: {
  guys: string[];
  girls: string[];
  heldOut: Set<string>;
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = heldOut.size;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <button
        className="flex items-center gap-2 text-[12px] font-medium text-slate-600 hover:text-slate-800"
        onClick={() => setExpanded(e => !e)}
      >
        Hold Players Out of Next Round(s)
        {count > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
            {count} held
          </span>
        )}
        <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-slate-500">
              Checked players sit out the next generated round(s). Their absence is tracked for fairness rotation.
            </p>
            {count > 0 && (
              <button
                className="text-[11px] text-slate-400 hover:text-slate-600 underline ml-3 shrink-0"
                onClick={onClear}
              >
                Clear all
              </button>
            )}
          </div>

          {guys.length === 0 && girls.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No players registered yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[12px]">
              {guys.map(name => {
                const held = heldOut.has(slug(name));
                return (
                  <label key={name} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={held}
                      onChange={() => onToggle(name)}
                      className="accent-amber-500"
                    />
                    <span className={held ? 'line-through text-amber-600' : 'text-slate-700'}>{name}</span>
                    <span className="text-[9px] text-blue-400 font-medium">M</span>
                  </label>
                );
              })}
              {girls.map(name => {
                const held = heldOut.has(slug(name));
                return (
                  <label key={name} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={held}
                      onChange={() => onToggle(name)}
                      className="accent-amber-500"
                    />
                    <span className={held ? 'line-through text-amber-600' : 'text-slate-700'}>{name}</span>
                    <span className="text-[9px] text-pink-400 font-medium">F</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

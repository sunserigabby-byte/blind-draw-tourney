import React from 'react';
import type { ScoreSettings } from '../types';

export function ScoreSettingsPanel({
  settings,
  onChange,
}: {
  settings: ScoreSettings;
  onChange: (s: ScoreSettings) => void;
}) {
  const capMode = settings.cap === null ? 'none' : 'custom';

  return (
    <div className="flex items-center gap-3 flex-wrap text-[12px]">
      <label className="flex items-center gap-1.5">
        <span className="text-slate-600 font-medium">Play to:</span>
        <input
          type="number"
          min={1}
          value={settings.playTo}
          onChange={e => {
            const v = Math.max(1, parseInt(e.target.value) || 1);
            onChange({ ...settings, playTo: v });
          }}
          className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] font-semibold text-center"
        />
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-slate-600 font-medium">Cap:</span>
        <select
          value={capMode}
          onChange={e => {
            if (e.target.value === 'none') {
              onChange({ ...settings, cap: null });
            } else {
              onChange({ ...settings, cap: settings.playTo + 2 });
            }
          }}
          className="border border-slate-300 rounded px-1.5 py-1 text-[12px]"
        >
          <option value="none">No cap</option>
          <option value="custom">Cap at...</option>
        </select>
      </label>

      {settings.cap !== null && (
        <label className="flex items-center gap-1">
          <input
            type="number"
            min={settings.playTo}
            value={settings.cap}
            onChange={e => {
              const v = Math.max(settings.playTo, parseInt(e.target.value) || settings.playTo);
              onChange({ ...settings, cap: v });
            }}
            className="w-14 border border-slate-300 rounded px-2 py-1 text-[12px] font-semibold text-center"
          />
        </label>
      )}

      <span className="text-[11px] text-slate-400">
        Win by 2{settings.cap !== null ? `, or first to ${settings.cap}` : ''}
      </span>
    </div>
  );
}

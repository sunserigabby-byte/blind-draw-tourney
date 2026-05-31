import React from 'react';

export type SidebarTabKey = 'DOUBLES' | 'QUADS' | 'TRIPLES' | 'KOB' | 'MICKEY';
export type SidebarSection = 'HOME' | 'TEAMS' | 'POOLS' | 'PLAYOFFS';

export const SIDEBAR_DIVISIONS: { key: SidebarTabKey; label: string; blindDraw: boolean }[] = [
  { key: 'DOUBLES', label: 'Revco Doubles', blindDraw: true },
  { key: 'QUADS', label: 'Revco Quads', blindDraw: true },
  { key: 'TRIPLES', label: 'Revco Triples', blindDraw: true },
  { key: 'KOB', label: 'KOB / QOB', blindDraw: true },
  // Mickey & Minnie isn't a pure blind draw — teams are pre-formed from
  // sign-up pairs + free agents and stay together through the event.
  { key: 'MICKEY', label: 'Mickey & Minnie', blindDraw: false },
];

export const SIDEBAR_SECTIONS: { key: SidebarSection; label: string }[] = [
  { key: 'HOME', label: 'Home' },
  { key: 'TEAMS', label: 'Teams' },
  { key: 'POOLS', label: 'Pools' },
  { key: 'PLAYOFFS', label: 'Playoffs' },
];

export function Sidebar({
  activeTab,
  setActiveTab,
  activeSection,
  setActiveSection,
  open,
  onClose,
}: {
  activeTab: SidebarTabKey;
  setActiveTab: (k: SidebarTabKey) => void;
  activeSection: SidebarSection;
  setActiveSection: (s: SidebarSection) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={
          'fixed md:sticky md:top-0 md:self-start top-0 left-0 h-screen md:h-screen w-64 bg-white border-r border-slate-200 z-40 transition-transform duration-200 overflow-y-auto ' +
          (open ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between md:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Menu</span>
            <button
              onClick={onClose}
              className="text-slate-500 text-2xl leading-none px-2"
              aria-label="Close menu"
            >
              ×
            </button>
          </div>

          <nav className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2 pt-1 pb-1">Formats</div>
            {SIDEBAR_DIVISIONS.map(d => {
              const isActive = activeTab === d.key;
              return (
                <div key={d.key}>
                  <button
                    className={
                      'w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md text-[13px] font-medium transition-colors ' +
                      (isActive ? 'bg-sky-50 text-sky-900' : 'hover:bg-slate-50 text-slate-700')
                    }
                    onClick={() => {
                      const wasActive = activeTab === d.key;
                      setActiveTab(d.key);
                      if (!wasActive) setActiveSection('HOME');
                      // On mobile, dismiss the drawer after a top-level pick if we're already on this division
                      if (wasActive) onClose();
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{d.label}</span>
                      {d.blindDraw && (
                        <span className="text-[8.5px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold shrink-0">
                          Blind Draw
                        </span>
                      )}
                    </div>
                    <span className={'text-[10px] shrink-0 ' + (isActive ? 'text-sky-700' : 'text-slate-400')}>
                      {isActive ? '▾' : '▸'}
                    </span>
                  </button>
                  {isActive && (
                    <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-slate-200 pl-2">
                      {SIDEBAR_SECTIONS.map(s => {
                        const sub = activeSection === s.key;
                        return (
                          <button
                            key={s.key}
                            className={
                              'w-full text-left px-2 py-1 rounded text-[12px] transition-colors ' +
                              (sub ? 'bg-sky-100 text-sky-900 font-medium' : 'text-slate-600 hover:bg-slate-50')
                            }
                            onClick={() => { setActiveSection(s.key); onClose(); }}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

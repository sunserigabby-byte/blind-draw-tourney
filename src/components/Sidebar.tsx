import React from 'react';

export type SidebarTabKey = 'DOUBLES' | 'QUADS' | 'TRIPLES' | 'KOB' | 'MICKEY' | 'MICKEYBD';
export type SidebarSection = 'HOME' | 'TEAMS' | 'POOLS' | 'PLAYOFFS';
export type SidebarDivision = 'UPPER' | 'LOWER';

export const SIDEBAR_DIVISIONS: { key: SidebarTabKey; label: string; blindDraw: boolean }[] = [
  { key: 'DOUBLES', label: 'Revco Doubles', blindDraw: true },
  { key: 'QUADS', label: 'Revco Quads', blindDraw: true },
  { key: 'TRIPLES', label: 'Revco Triples', blindDraw: true },
  { key: 'KOB', label: 'KOB / QOB', blindDraw: true },
  // Mickey & Minnie isn't a pure blind draw — teams are pre-formed from
  // sign-up pairs + free agents and stay together through the event.
  { key: 'MICKEY', label: 'Mickey & Minnie', blindDraw: false },
  // Mickey & Minnie Blind Draw — teams re-randomize every round; each
  // round plays a single match with Mickey + Minnie sets back-to-back.
  { key: 'MICKEYBD', label: 'Mickey & Minnie Blind Draw', blindDraw: true },
];

export const SIDEBAR_SECTIONS: { key: SidebarSection; label: string }[] = [
  { key: 'HOME', label: 'Home' },
  { key: 'TEAMS', label: 'Teams' },
  { key: 'POOLS', label: 'Pools' },
  { key: 'PLAYOFFS', label: 'Playoffs' },
];

const DIVISION_GROUPS: { key: SidebarDivision; label: string }[] = [
  { key: 'UPPER', label: 'Upper Division' },
  { key: 'LOWER', label: 'Lower Division' },
];

export function Sidebar({
  activeTab,
  setActiveTab,
  activeDivision,
  setActiveDivision,
  activeSection,
  setActiveSection,
  open,
  onClose,
}: {
  activeTab: SidebarTabKey;
  setActiveTab: (k: SidebarTabKey) => void;
  activeDivision: SidebarDivision;
  setActiveDivision: (d: SidebarDivision) => void;
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
              const isActiveFormat = activeTab === d.key;
              return (
                <div key={d.key}>
                  <button
                    className={
                      'w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md text-[13px] font-medium transition-colors ' +
                      (isActiveFormat ? 'bg-sky-50 text-sky-900' : 'hover:bg-slate-50 text-slate-700')
                    }
                    onClick={() => {
                      const wasActive = activeTab === d.key;
                      setActiveTab(d.key);
                      if (!wasActive) setActiveSection('HOME');
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
                    <span className={'text-[10px] shrink-0 ' + (isActiveFormat ? 'text-sky-700' : 'text-slate-400')}>
                      {isActiveFormat ? '▾' : '▸'}
                    </span>
                  </button>

                  {isActiveFormat && (
                    <div className="ml-3 mt-1 mb-1 space-y-2 border-l border-slate-200 pl-2">
                      {DIVISION_GROUPS.map(div => {
                        const isActiveDiv = activeDivision === div.key;
                        return (
                          <div key={div.key} className="space-y-0.5">
                            <div className={
                              'px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold ' +
                              (isActiveDiv ? 'text-sky-700' : 'text-slate-500')
                            }>
                              {div.label}
                            </div>
                            {SIDEBAR_SECTIONS.map(s => {
                              const isHere = isActiveDiv && activeSection === s.key;
                              return (
                                <button
                                  key={s.key}
                                  className={
                                    'w-full text-left px-3 py-1 rounded text-[12px] transition-colors ' +
                                    (isHere
                                      ? 'bg-sky-100 text-sky-900 font-semibold'
                                      : 'text-slate-600 hover:bg-slate-50')
                                  }
                                  onClick={() => {
                                    setActiveDivision(div.key);
                                    setActiveSection(s.key);
                                    onClose();
                                  }}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
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

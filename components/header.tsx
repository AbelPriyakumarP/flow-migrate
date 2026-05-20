"use client";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg shadow-indigo-500/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 7h10v10" />
              <path d="M7 17 17 7" />
            </svg>
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 opacity-40 blur-md -z-10" />
          </div>
          <div>
            <h1 className="text-[16px] font-bold tracking-tight text-white">
              FlowMigrate
            </h1>
            <p className="text-[11px] font-medium text-slate-400">
              Enterprise Workflow Migration Bridge
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.07] px-3.5 py-2 backdrop-blur-sm border border-white/[0.08]">
              <div className="h-2 w-2 rounded-full bg-[var(--aws-color)] shadow-sm shadow-orange-400/40" />
              <span className="text-[12px] font-semibold text-orange-300">AWS</span>
            </div>
            <div className="flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                <defs>
                  <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#60a5fa" />
                  </linearGradient>
                </defs>
                <path d="M5 12h14" stroke="url(#arrowGrad)" />
                <path d="m12 5 7 7-7 7" stroke="url(#arrowGrad)" />
              </svg>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.07] px-3.5 py-2 backdrop-blur-sm border border-white/[0.08]">
              <div className="h-2 w-2 rounded-full bg-[var(--azure-color)] shadow-sm shadow-blue-400/40" />
              <span className="text-[12px] font-semibold text-blue-300">Azure</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/20">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
            <span className="text-[11px] font-semibold text-emerald-300">Ready</span>
          </div>
        </div>
      </div>
    </header>
  );
}

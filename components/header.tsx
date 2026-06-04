"use client";

import { useTheme } from "@/hooks/useTheme";
import Link from "next/link";

interface HeaderProps {
  onShowShortcuts?: () => void;
}

export default function Header({ onShowShortcuts }: HeaderProps) {
  const { theme, toggleTheme, mounted } = useTheme();

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

          {/* Docs link */}
          <Link
            href="/docs"
            className="btn-press flex h-9 items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 border border-white/[0.08] text-slate-300 hover:bg-white/[0.12] hover:text-white transition-all text-[12px] font-semibold"
            title="Documentation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span className="hidden sm:inline">Docs</span>
          </Link>

          {/* Keyboard shortcuts */}
          {onShowShortcuts && (
            <button
              onClick={onShowShortcuts}
              className="btn-press flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] border border-white/[0.08] text-slate-300 hover:bg-white/[0.12] hover:text-white transition-all"
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.001" />
                <path d="M10 8h.001" />
                <path d="M14 8h.001" />
                <path d="M18 8h.001" />
                <path d="M8 12h.001" />
                <path d="M12 12h.001" />
                <path d="M16 12h.001" />
                <path d="M7 16h10" />
              </svg>
            </button>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="btn-press flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] border border-white/[0.08] text-slate-300 hover:bg-white/[0.12] hover:text-white transition-all"
            title={mounted ? `Switch to ${theme === "light" ? "dark" : "light"} mode` : "Toggle theme"}
            aria-label="Toggle dark mode"
          >
            {(!mounted || theme === "light") ? (
              /* Moon icon - show in light mode */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              /* Sun icon - show in dark mode */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/20">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
            <span className="text-[11px] font-semibold text-emerald-300">Ready</span>
          </div>
        </div>
      </div>
    </header>
  );
}

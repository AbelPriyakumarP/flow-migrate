"use client";

import Link from "next/link";
import { useTheme } from "@/hooks/useTheme";

interface HeaderProps {
  onShowShortcuts?: () => void;
  onShowLog?: () => void;
  logCount?: number;
  isLoading?: boolean;
}

export default function Header({ onShowShortcuts, onShowLog, logCount = 0, isLoading }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className="relative z-30 flex items-center justify-between border-b px-5 shrink-0"
      style={{
        height: "var(--header-height)",
        borderColor: "var(--border-subtle)",
        background: "var(--header-bg)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Left: Brand */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent-gradient)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text-bright)" }}>
            FlowMigrate
          </span>
          <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
            Pro
          </span>
        </div>
      </div>

      {/* Center: Nav */}
      <nav className="absolute left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-1">
        <Link
          href="/docs"
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--text-muted)" }}
        >
          Docs
        </Link>
        <button
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--text-muted)" }}
          onClick={onShowShortcuts}
        >
          Shortcuts
        </button>
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <div className="theme-toggle-knob">
            {theme === "light" ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </div>
        </button>

        {onShowLog && (
          <button
            onClick={onShowLog}
            className="btn-press relative flex h-8 items-center gap-2 rounded-lg px-2.5 transition-all hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--text-muted)" }}
            title="Migration Log"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            {(logCount > 0 || isLoading) && (
              <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${isLoading ? "animate-pulse" : ""}`} style={{ background: "var(--accent)" }}>
                {isLoading ? "..." : logCount}
              </span>
            )}
          </button>
        )}

        {onShowShortcuts && (
          <button
            onClick={onShowShortcuts}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--text-muted)" }}
            title="Keyboard Shortcuts (?)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.001" /><path d="M10 8h.001" /><path d="M14 8h.001" /><path d="M18 8h.001" />
              <path d="M8 12h.001" /><path d="M12 12h.001" /><path d="M16 12h.001" />
              <path d="M7 16h10" />
            </svg>
          </button>
        )}

        <div className="ml-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "var(--success-bg)", border: "1px solid rgba(34, 211, 238, 0.12)" }}>
          <div className="status-dot" />
          <span className="text-[10px] font-semibold" style={{ color: "var(--success)" }}>Online</span>
        </div>
      </div>
    </header>
  );
}

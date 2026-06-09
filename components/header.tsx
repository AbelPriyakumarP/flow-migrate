"use client";

import Link from "next/link";

interface HeaderProps {
  onShowShortcuts?: () => void;
  onShowLog?: () => void;
  logCount?: number;
  isLoading?: boolean;
}

export default function Header({ onShowShortcuts, onShowLog, logCount = 0, isLoading }: HeaderProps) {
  return (
    <header
      className="relative z-30 flex items-center justify-between border-b px-4 shrink-0"
      style={{
        height: "var(--header-height)",
        borderColor: "var(--border-subtle)",
        background: "rgba(11, 13, 26, 0.8)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent-gradient)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
          </svg>
        </div>
        <span className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text-bright)" }}>
          FlowMigrate
        </span>
        <div className="ml-1 flex items-center gap-0.5 rounded-md px-2 py-0.5" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
        </div>
      </div>

      {/* Center: Nav links */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-5">
        <Link
          href="/docs"
          className="flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:text-[var(--text-accent)]"
          style={{ color: "var(--text-muted)" }}
        >
          Documentation
        </Link>
        <span style={{ color: "var(--border-subtle)" }}>|</span>
        <button
          className="flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:text-[var(--text-accent)]"
          style={{ color: "var(--text-muted)" }}
          onClick={onShowShortcuts}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          Export Config
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Migration Log icon */}
        {onShowLog && (
          <button
            onClick={onShowLog}
            className="btn-press relative flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--text-muted)" }}
            title="Migration Log"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
            </svg>
            {(logCount > 0 || isLoading) && (
              <span className={`absolute -top-0.5 -right-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white ${isLoading ? "animate-pulse" : ""}`} style={{ background: "var(--accent)" }}>
                {isLoading ? "~" : logCount}
              </span>
            )}
          </button>
        )}

        {/* Keyboard shortcuts */}
        {onShowShortcuts && (
          <button
            onClick={onShowShortcuts}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--text-muted)" }}
            title="Keyboard Shortcuts"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.001" /><path d="M10 8h.001" /><path d="M14 8h.001" /><path d="M18 8h.001" />
              <path d="M8 12h.001" /><path d="M12 12h.001" /><path d="M16 12h.001" />
              <path d="M7 16h10" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

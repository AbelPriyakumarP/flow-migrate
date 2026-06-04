"use client";

import { useState, useRef, useEffect } from "react";
import type { MigrationSnapshot } from "@/hooks/useVersionHistory";

interface VersionHistoryPanelProps {
  snapshots: MigrationSnapshot[];
  isLoading: boolean;
  onLoad: (snapshot: MigrationSnapshot) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function lineCount(code: string): number {
  return code ? code.split("\n").length : 0;
}

export default function VersionHistoryPanel({
  snapshots,
  isLoading,
  onLoad,
  onDelete,
  onClearAll,
}: VersionHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div ref={panelRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`btn-press group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
          snapshots.length > 0
            ? "border-violet-300 bg-gradient-to-br from-violet-50 to-purple-50 shadow-sm shadow-violet-200/50 hover:shadow-md hover:shadow-violet-200/60"
            : "border-[var(--card-border)] shadow-sm hover:shadow-md"
        }`}
        style={snapshots.length === 0 ? { background: "var(--card)" } : undefined}
        title={snapshots.length > 0 ? `${snapshots.length} saved migration${snapshots.length !== 1 ? "s" : ""}` : "Migration History"}
        aria-label="Migration history"
        aria-expanded={isOpen}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={snapshots.length > 0 ? "rgb(124,58,237)" : "var(--muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>

        {snapshots.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
            {snapshots.length > 9 ? "9+" : snapshots.length}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-12 z-50 w-[380px] rounded-2xl border border-[var(--card-border)] shadow-xl animate-scaleIn origin-top-right overflow-hidden"
          style={{ background: "var(--card)" }}
          role="dialog"
          aria-label="Migration History"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3" style={{ background: "var(--subtle-bg)" }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(124,58,237)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h3 className="text-[13px] font-bold" style={{ color: "var(--foreground)" }}>Migration History</h3>
                <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {snapshots.length > 0
                    ? `${snapshots.length} saved migration${snapshots.length !== 1 ? "s" : ""}`
                    : "Auto-saved after each migration"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 transition-colors hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              </div>
            )}

            {/* Empty */}
            {!isLoading && snapshots.length === 0 && (
              <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 shadow-sm mb-2.5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(124,58,237)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <p className="text-[12px] font-semibold" style={{ color: "var(--foreground)" }}>No history yet</p>
                <p className="text-[10px] max-w-[260px] leading-relaxed mt-1" style={{ color: "var(--muted)" }}>
                  Migrations are automatically saved here. Run a migration to get started.
                </p>
              </div>
            )}

            {/* Snapshots */}
            {!isLoading && snapshots.length > 0 && (
              <div>
                {/* Clear all bar */}
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "var(--divider)" }}>
                  <span className="text-[10px] font-medium" style={{ color: "var(--muted)" }}>
                    Sorted by most recent
                  </span>
                  <button
                    onClick={onClearAll}
                    className="rounded-md border px-1.5 py-0.5 text-[9px] font-medium transition-colors hover:border-red-300 hover:text-red-600"
                    style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}
                  >
                    Clear All
                  </button>
                </div>

                {/* Snapshot list */}
                <div className="divide-y" style={{ borderColor: "var(--divider)" }}>
                  {snapshots.map((snap) => {
                    const dirLabel = snap.direction === "aws-to-azure" ? "AWS → Azure" : "Azure → AWS";
                    const dirColor = snap.direction === "aws-to-azure" ? "var(--aws-color)" : "var(--azure-color)";

                    return (
                      <div key={snap.id} className="group px-4 py-3 transition-colors hover:opacity-90">
                        <div className="flex items-start gap-3">
                          {/* Direction indicator */}
                          <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white mt-0.5"
                            style={{ backgroundColor: dirColor }}
                          >
                            {snap.direction === "aws-to-azure" ? "A→Z" : "Z→A"}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold truncate" style={{ color: "var(--foreground)" }}>
                                {snap.label}
                              </span>
                              <span className="text-[9px] flex-shrink-0" style={{ color: "var(--muted)" }}>
                                {timeAgo(snap.timestamp)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                                {dirLabel}
                              </span>
                              <span className="text-[10px]" style={{ color: "var(--muted)", opacity: 0.5 }}>·</span>
                              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                                {lineCount(snap.sourceCode)} → {lineCount(snap.outputCode)} lines
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { onLoad(snap); setIsOpen(false); }}
                              className="rounded-md px-2 py-1 text-[10px] font-bold text-violet-600 transition-colors hover:bg-violet-50"
                              title="Load this migration"
                            >
                              Load
                            </button>
                            <button
                              onClick={() => onDelete(snap.id)}
                              className="rounded p-1 transition-colors hover:bg-red-50"
                              title="Delete"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

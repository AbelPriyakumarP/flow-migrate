"use client";

import { useMemo, useState, useCallback } from "react";
import { lineByLineDiff, diffStats, type DiffLine } from "@/lib/json-diff";

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

interface DiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  leftCode: string;
  rightCode: string;
  leftLabel?: string;
  rightLabel?: string;
}

export default function DiffViewer({
  isOpen,
  onClose,
  leftCode,
  rightCode,
  leftLabel = "Source",
  rightLabel = "Output",
}: DiffViewerProps) {
  const [mode, setMode] = useState<"unified" | "split">("unified");

  const diffLines = useMemo(
    () => lineByLineDiff(leftCode, rightCode),
    [leftCode, rightCode]
  );

  const stats = useMemo(() => diffStats(diffLines), [diffLines]);

  const handleCopyDiff = useCallback(() => {
    const text = diffLines
      .map((l) => {
        const prefix = l.type === "added" ? "+ " : l.type === "removed" ? "- " : "  ";
        return prefix + l.content;
      })
      .join("\n");
    copyToClipboard(text);
  }, [diffLines]);

  if (!isOpen) return null;

  // Split view: separate left (removed+unchanged) and right (added+unchanged)
  const leftLines: (DiffLine | null)[] = [];
  const rightLines: (DiffLine | null)[] = [];

  if (mode === "split") {
    let li = 0, ri = 0;
    for (const line of diffLines) {
      if (line.type === "unchanged") {
        leftLines.push(line);
        rightLines.push(line);
        li++; ri++;
      } else if (line.type === "removed") {
        leftLines.push(line);
        rightLines.push(null);
        li++;
      } else {
        leftLines.push(null);
        rightLines.push(line);
        ri++;
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex h-[80vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] shadow-2xl animate-scaleIn"
        style={{ background: "var(--card)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Diff Viewer"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-3" style={{ background: "var(--subtle-bg)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(79,70,229)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <rect x="2" y="3" width="7" height="18" rx="1" />
                <rect x="15" y="3" width="7" height="18" rx="1" />
              </svg>
            </div>
            <div>
              <h3 className="text-[14px] font-bold" style={{ color: "var(--foreground)" }}>
                Diff Viewer
              </h3>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                {leftLabel} vs {rightLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="flex items-center gap-2">
              {stats.added > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  +{stats.added}
                </span>
              )}
              {stats.removed > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  -{stats.removed}
                </span>
              )}
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                {stats.unchanged} unchanged
              </span>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--card-border)" }}>
              <button
                onClick={() => setMode("unified")}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  mode === "unified" ? "bg-indigo-100 text-indigo-700" : ""
                }`}
                style={mode !== "unified" ? { color: "var(--muted)" } : undefined}
              >
                Unified
              </button>
              <button
                onClick={() => setMode("split")}
                className={`px-2.5 py-1 text-[10px] font-semibold border-l transition-colors ${
                  mode === "split" ? "bg-indigo-100 text-indigo-700" : ""
                }`}
                style={{ borderColor: "var(--card-border)", ...(mode !== "split" ? { color: "var(--muted)" } : {}) }}
              >
                Split
              </button>
            </div>

            {/* Copy */}
            <button
              onClick={handleCopyDiff}
              className="rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors hover:border-indigo-300"
              style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}
            >
              Copy Diff
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 transition-colors hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto scrollbar-thin font-mono text-[12px] leading-6">
          {mode === "unified" ? (
            <UnifiedView lines={diffLines} />
          ) : (
            <SplitView leftLines={leftLines} rightLines={rightLines} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Unified View ────────────────────────────

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line, i) => {
          const bg =
            line.type === "added"
              ? "rgba(16,185,129,0.08)"
              : line.type === "removed"
                ? "rgba(239,68,68,0.08)"
                : "transparent";
          const textColor =
            line.type === "added"
              ? "var(--success)"
              : line.type === "removed"
                ? "var(--danger)"
                : "var(--foreground)";
          const prefix =
            line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

          return (
            <tr key={i} style={{ background: bg }}>
              <td
                className="select-none px-3 text-right opacity-40"
                style={{ color: "var(--muted)", width: 50, minWidth: 50 }}
              >
                {line.lineNumber}
              </td>
              <td
                className="select-none px-1 text-center font-bold"
                style={{ color: textColor, width: 20 }}
              >
                {prefix}
              </td>
              <td className="px-2 whitespace-pre" style={{ color: textColor }}>
                {line.content || " "}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Split View ──────────────────────────────

function SplitView({
  leftLines,
  rightLines,
}: {
  leftLines: (DiffLine | null)[];
  rightLines: (DiffLine | null)[];
}) {
  const maxLen = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex-1 overflow-auto border-r" style={{ borderColor: "var(--card-border)" }}>
        <table className="w-full border-collapse">
          <tbody>
            {Array.from({ length: maxLen }, (_, i) => {
              const line = leftLines[i];
              const bg = line?.type === "removed" ? "rgba(239,68,68,0.08)" : "transparent";
              const color = line?.type === "removed" ? "var(--danger)" : "var(--foreground)";

              return (
                <tr key={i} style={{ background: bg }}>
                  <td className="select-none px-2 text-right opacity-40" style={{ color: "var(--muted)", width: 40 }}>
                    {line?.lineNumber || ""}
                  </td>
                  <td className="px-2 whitespace-pre" style={{ color }}>
                    {line?.content ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {Array.from({ length: maxLen }, (_, i) => {
              const line = rightLines[i];
              const bg = line?.type === "added" ? "rgba(16,185,129,0.08)" : "transparent";
              const color = line?.type === "added" ? "var(--success)" : "var(--foreground)";

              return (
                <tr key={i} style={{ background: bg }}>
                  <td className="select-none px-2 text-right opacity-40" style={{ color: "var(--muted)", width: 40 }}>
                    {line?.lineNumber || ""}
                  </td>
                  <td className="px-2 whitespace-pre" style={{ color }}>
                    {line?.content ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

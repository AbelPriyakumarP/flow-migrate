"use client";

import { useState, useRef, useEffect } from "react";
import type { Correction, CorrectionPattern } from "@/lib/corrections";
import { PATTERN_LABELS } from "@/lib/corrections";

interface CorrectionsPanelProps {
  corrections: Correction[];
  onClear: () => void;
  onRemove: (id: string) => void;
  direction: "aws-to-azure" | "azure-to-aws";
}

const PATTERN_COLORS: Record<CorrectionPattern, { bg: string; text: string; dot: string }> = {
  "wrong-action-type": { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  "wrong-service-mapping": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "missing-field": { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  "wrong-expression": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "wrong-property-value": { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  "structural-issue": { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
};

const PATTERN_ICONS: Record<CorrectionPattern, string> = {
  "wrong-action-type": "⊘",
  "wrong-service-mapping": "⇄",
  "missing-field": "+",
  "wrong-expression": "fx",
  "wrong-property-value": "≠",
  "structural-issue": "⌗",
};

export default function CorrectionsPanel({
  corrections,
  onClear,
  onRemove,
  direction,
}: CorrectionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedPattern, setExpandedPattern] = useState<CorrectionPattern | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Filter to current direction
  const relevant = corrections.filter((c) => c.direction === direction);
  const totalFrequency = relevant.reduce((sum, c) => sum + c.frequency, 0);

  // Group by pattern
  const groups = new Map<CorrectionPattern, Correction[]>();
  for (const c of relevant) {
    const arr = groups.get(c.pattern) || [];
    arr.push(c);
    groups.set(c.pattern, arr);
  }

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={panelRef} className="relative">
      {/* Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`btn-press group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
          relevant.length > 0
            ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm shadow-amber-200/50 hover:shadow-md hover:shadow-amber-200/60"
            : "border-[var(--card-border)] bg-white shadow-sm hover:border-slate-300 hover:shadow-md"
        }`}
        title={relevant.length > 0 ? `${relevant.length} correction${relevant.length !== 1 ? "s" : ""} active` : "Feedback Corrections"}
        aria-label="Feedback corrections"
        aria-expanded={isOpen}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={relevant.length > 0 ? "rgb(217,119,6)" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>

        {/* Badge count */}
        {relevant.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
            {relevant.length}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-[380px] rounded-2xl border border-[var(--card-border)] shadow-xl animate-scaleIn origin-top-right overflow-hidden" style={{ background: "var(--card)" }} role="dialog" aria-label="Feedback corrections">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(217,119,6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-[13px] font-bold text-slate-800">Feedback Corrections</h3>
                <p className="text-[10px] text-slate-400">
                  {relevant.length > 0
                    ? `${relevant.length} pattern${relevant.length !== 1 ? "s" : ""} from ${totalFrequency} edit${totalFrequency !== 1 ? "s" : ""}`
                    : "Teach the AI from your edits"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
            {/* Empty state */}
            {relevant.length === 0 && (
              <div className="flex flex-col items-center justify-center px-5 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm mb-2.5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(217,119,6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <p className="text-[12px] font-semibold text-slate-600 mb-1">No corrections yet</p>
                <p className="text-[10px] text-slate-400 max-w-[280px] leading-relaxed">
                  Edit the migrated output to fix issues, then click &quot;Submit Corrections&quot; to teach the AI.
                </p>
                <div className="flex items-center gap-2.5 mt-3">
                  {[
                    { n: "1", label: "Migrate", color: "bg-slate-100 text-slate-500" },
                    { n: "2", label: "Edit", color: "bg-slate-100 text-slate-500" },
                    { n: "3", label: "Submit", color: "bg-amber-100 text-amber-600" },
                    { n: "4", label: "Learns", color: "bg-indigo-100 text-indigo-600" },
                  ].map((step, i) => (
                    <div key={step.n} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="3"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                      )}
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold ${step.color}`}>{step.n}</span>
                      <span className="text-[9px] text-slate-400">{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active corrections */}
            {relevant.length > 0 && (
              <div className="divide-y divide-slate-100">
                {/* Active banner */}
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50/50">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgb(79,70,229)" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  <span className="text-[10px] font-medium text-indigo-700 flex-1">
                    Applied automatically to migrations
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onClear(); }}
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                {/* Pattern Groups */}
                {Array.from(groups.entries())
                  .sort(([, a], [, b]) => {
                    const freqA = a.reduce((s, c) => s + c.frequency, 0);
                    const freqB = b.reduce((s, c) => s + c.frequency, 0);
                    return freqB - freqA;
                  })
                  .map(([pattern, items]) => {
                    const colors = PATTERN_COLORS[pattern];
                    const icon = PATTERN_ICONS[pattern];
                    const totalFreq = items.reduce((s, c) => s + c.frequency, 0);
                    const isPatternOpen = expandedPattern === pattern;

                    return (
                      <div key={pattern}>
                        <button
                          onClick={() => setExpandedPattern(isPatternOpen ? null : pattern)}
                          className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors ${isPatternOpen ? colors.bg : "hover:bg-slate-50"}`}
                        >
                          <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold text-white ${colors.dot}`}>
                            {icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] font-semibold ${colors.text}`}>
                              {PATTERN_LABELS[pattern]}
                            </span>
                            <span className="ml-1.5 text-[9px] text-slate-400">
                              {items.length}x
                            </span>
                          </div>
                          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${colors.bg} ${colors.text}`}>
                            {totalFreq >= 3 ? "HIGH" : totalFreq >= 2 ? "MED" : "LOW"}
                          </span>
                          <svg
                            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
                            className={`transition-transform ${isPatternOpen ? "rotate-180" : ""}`}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>

                        {isPatternOpen && (
                          <div className="px-4 pb-2 pt-1">
                            <div className="ml-7 space-y-1">
                              {items
                                .sort((a, b) => b.frequency - a.frequency)
                                .map((correction) => (
                                  <div
                                    key={correction.id}
                                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 group"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] leading-relaxed text-slate-700">
                                        {correction.naturalLanguage}
                                      </p>
                                      <div className="mt-0.5 flex items-center gap-1.5">
                                        <span className="text-[8px] text-slate-400">
                                          {correction.sourceType} → {correction.targetType}
                                        </span>
                                        <span className="text-[8px] text-slate-300">·</span>
                                        <span className="text-[8px] text-slate-400">
                                          {correction.frequency}x
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => onRemove(correction.id)}
                                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 hover:bg-red-50"
                                      title="Remove correction"
                                      aria-label="Remove correction"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                                        <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import type { DetectionResult, Platform } from "@/lib/detect-platform";

interface PlatformSelectorProps {
  detection: DetectionResult | null;
  target: Platform;
  onTargetChange: (platform: Platform) => void;
}

export default function PlatformSelector({
  detection,
  target,
  onTargetChange,
}: PlatformSelectorProps) {
  const platformIcon = (platform: Platform | "unknown") => {
    if (platform === "aws-step-functions") {
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/60 shadow-sm">
          <span className="text-[14px] font-extrabold text-[var(--aws-color)]">A</span>
        </div>
      );
    }
    if (platform === "azure-logic-apps") {
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200/60 shadow-sm">
          <span className="text-[13px] font-extrabold text-[var(--azure-color)]">Az</span>
        </div>
      );
    }
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/60 shadow-sm">
        <span className="text-[14px] text-slate-400">?</span>
      </div>
    );
  };

  return (
    <div className="card-premium flex flex-wrap items-center gap-5 px-6 py-4">
      {/* Source */}
      <div className="flex items-center gap-3.5">
        {platformIcon(detection?.platform || "unknown")}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Source</p>
          {detection && detection.platform !== "unknown" ? (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[14px] font-bold text-slate-800">{detection.label}</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                detection.confidence === "high"
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                  : "bg-amber-50 text-amber-600 border border-amber-200/60"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  detection.confidence === "high" ? "bg-emerald-500" : "bg-amber-500"
                }`} />
                {detection.confidence}
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-slate-400 mt-0.5">Auto-detected from input</p>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 border border-indigo-200/40 shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </div>

      {/* Target */}
      <div className="flex items-center gap-3.5">
        {platformIcon(target)}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Target</p>
          <select
            value={target}
            onChange={(e) => onTargetChange(e.target.value as Platform)}
            className="mt-0.5 rounded-md border-none bg-transparent p-0 text-[14px] font-bold text-slate-800 outline-none focus:ring-0 cursor-pointer"
          >
            <option value="azure-logic-apps">Azure Logic Apps</option>
            <option value="aws-step-functions">AWS Step Functions</option>
          </select>
        </div>
      </div>
    </div>
  );
}

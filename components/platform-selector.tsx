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
  return (
    <div className="flex items-center gap-3">
      {/* Source chip */}
      <div className="flex items-center gap-2.5 rounded-xl border px-4 py-2" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: detection?.platform === "aws-step-functions" ? "var(--aws-bg)" : detection?.platform === "azure-logic-apps" ? "var(--azure-bg)" : "var(--accent-bg)", border: "1px solid var(--border-subtle)" }}>
          {detection?.platform === "aws-step-functions" ? (
            <span className="text-[10px] font-extrabold" style={{ color: "var(--aws-color)" }}>A</span>
          ) : detection?.platform === "azure-logic-apps" ? (
            <span className="text-[10px] font-extrabold" style={{ color: "var(--azure-color)" }}>Az</span>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          )}
        </div>
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--accent)" }}>Source</p>
          <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {detection && detection.platform !== "unknown" ? detection.label : "Auto-detected"}
          </p>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </div>

      {/* Target chip */}
      <div className="flex items-center gap-2.5 rounded-xl border px-4 py-2" style={{ borderColor: "var(--border-accent)", background: "var(--bg-elevated)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: target === "azure-logic-apps" ? "var(--azure-bg)" : "var(--aws-bg)", border: "1px solid var(--border-primary)" }}>
          {target === "azure-logic-apps" ? (
            <span className="text-[10px] font-extrabold" style={{ color: "var(--azure-color)" }}>Az</span>
          ) : (
            <span className="text-[10px] font-extrabold" style={{ color: "var(--aws-color)" }}>A</span>
          )}
        </div>
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--accent)" }}>Target</p>
          <select
            value={target}
            onChange={(e) => onTargetChange(e.target.value as Platform)}
            className="bg-transparent text-[12px] font-semibold outline-none cursor-pointer border-none p-0"
            style={{ color: "var(--text-primary)" }}
          >
            <option value="azure-logic-apps">Azure Logic Apps</option>
            <option value="aws-step-functions">AWS Step Functions</option>
          </select>
        </div>
      </div>

      {/* Platform toggle pills */}
      <div className="ml-2 flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
        <button
          onClick={() => onTargetChange("aws-step-functions")}
          className="px-3 py-1.5 text-[11px] font-bold transition-all"
          style={{
            background: target === "aws-step-functions" ? "var(--aws-bg)" : "transparent",
            color: target === "aws-step-functions" ? "var(--aws-color)" : "var(--text-muted)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          AWS
        </button>
        <button
          onClick={() => onTargetChange("azure-logic-apps")}
          className="px-3 py-1.5 text-[11px] font-bold transition-all"
          style={{
            background: target === "azure-logic-apps" ? "var(--azure-bg)" : "transparent",
            color: target === "azure-logic-apps" ? "var(--azure-color)" : "var(--text-muted)",
          }}
        >
          Azure
        </button>
      </div>
    </div>
  );
}

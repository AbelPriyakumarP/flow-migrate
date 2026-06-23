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
  const sourceIsAws = detection?.platform === "aws-step-functions";
  const sourceIsAzure = detection?.platform === "azure-logic-apps";
  const detected = sourceIsAws || sourceIsAzure;

  return (
    <div className="flex items-center gap-2">
      {/* Source */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-[7px] transition-all"
        style={{
          background: detected ? (sourceIsAws ? "var(--aws-bg)" : "var(--azure-bg)") : "var(--bg-card)",
          border: `1px solid ${detected ? (sourceIsAws ? "rgba(255,153,0,0.15)" : "rgba(56,189,248,0.15)") : "var(--border-subtle)"}`,
        }}
      >
        <div
          className="h-2 w-2 rounded-full transition-colors"
          style={{ background: detected ? (sourceIsAws ? "var(--aws-color)" : "var(--azure-color)") : "var(--text-muted)", boxShadow: detected ? `0 0 6px ${sourceIsAws ? "rgba(255,153,0,0.3)" : "rgba(56,189,248,0.3)"}` : "none" }}
        />
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {detected ? (sourceIsAws ? "AWS Step Functions" : "Azure Logic Apps") : "Source"}
        </span>
      </div>

      {/* Arrow */}
      <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "var(--hover-bg)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </div>

      {/* Target */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-[7px] transition-all"
        style={{
          background: target === "azure-logic-apps" ? "var(--azure-bg)" : "var(--aws-bg)",
          border: `1px solid ${target === "azure-logic-apps" ? "rgba(56,189,248,0.15)" : "rgba(255,153,0,0.15)"}`,
        }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: target === "azure-logic-apps" ? "var(--azure-color)" : "var(--aws-color)", boxShadow: `0 0 6px ${target === "azure-logic-apps" ? "rgba(56,189,248,0.3)" : "rgba(255,153,0,0.3)"}` }}
        />
        <select
          value={target}
          onChange={(e) => onTargetChange(e.target.value as Platform)}
          className="bg-transparent text-[12px] font-semibold outline-none cursor-pointer border-none p-0"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
        >
          <option value="azure-logic-apps">Azure Logic Apps</option>
          <option value="aws-step-functions">AWS Step Functions</option>
        </select>
      </div>
    </div>
  );
}

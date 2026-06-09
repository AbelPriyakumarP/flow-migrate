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
    <div className="flex items-center gap-2.5">
      {/* Source */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{
          background: detected ? (sourceIsAws ? "var(--aws-bg)" : "var(--azure-bg)") : "var(--bg-card)",
          border: `1px solid ${detected ? (sourceIsAws ? "rgba(255,153,0,0.2)" : "rgba(56,189,248,0.2)") : "var(--border-subtle)"}`,
        }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: detected ? (sourceIsAws ? "var(--aws-color)" : "var(--azure-color)") : "var(--text-muted)" }}
        />
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {detected ? (sourceIsAws ? "AWS Step Functions" : "Azure Logic Apps") : "Source"}
        </span>
      </div>

      {/* Arrow */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>

      {/* Target */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{
          background: target === "azure-logic-apps" ? "var(--azure-bg)" : "var(--aws-bg)",
          border: `1px solid ${target === "azure-logic-apps" ? "rgba(56,189,248,0.2)" : "rgba(255,153,0,0.2)"}`,
        }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: target === "azure-logic-apps" ? "var(--azure-color)" : "var(--aws-color)" }}
        />
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
  );
}

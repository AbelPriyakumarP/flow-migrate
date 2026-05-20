"use client";

import { Fragment, useState } from "react";
import type { ComparisonResult, StepMapping, StepStatus } from "@/lib/comparison";

interface ComparisonViewProps {
  comparison: ComparisonResult;
  direction: "aws-to-azure" | "azure-to-aws";
}

const STATUS_CONFIG: Record<StepStatus, { bg: string; border: string; dot: string; label: string; icon: string }> = {
  green: { bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", label: "Exact Match", icon: "✓" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", label: "Review", icon: "⚠" },
  red: { bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", label: "Gap Found", icon: "✗" },
};

const TYPE_LABELS: Record<string, string> = {
  Task: "Task", Choice: "Choice", Parallel: "Parallel", Map: "Map",
  Pass: "Pass", Wait: "Wait", Succeed: "Succeed", Fail: "Fail",
  If: "If", Switch: "Switch", Select: "Select", Foreach: "Foreach",
  Function: "Function", Http: "Http", ApiConnection: "API Connection",
  Compose: "Compose", Terminate: "Terminate", Scope: "Scope",
};

export default function ComparisonView({ comparison, direction }: ComparisonViewProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const { mappings, summary, overallStatus } = comparison;

  if (mappings.length === 0) return null;

  const sourcePlatform = direction === "aws-to-azure" ? "AWS" : "Azure";
  const targetPlatform = direction === "aws-to-azure" ? "Azure" : "AWS";
  const overallConfig = STATUS_CONFIG[overallStatus];

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--card-border)] bg-gradient-to-r from-slate-50 to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(79,70,229)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L3 3" /><path d="m15 9 6-6" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Behavioral Comparison</h3>
            <p className="text-[11px] text-slate-500">Step-by-step mapping from {sourcePlatform} → {targetPlatform}</p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex items-center gap-2">
          {summary.green > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {summary.green} exact
            </span>
          )}
          {summary.amber > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {summary.amber} review
            </span>
          )}
          {summary.red > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {summary.red} gaps
            </span>
          )}
          {mappings.filter(m => m.needsManualConfig).length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              {mappings.filter(m => m.needsManualConfig).length} TODO
            </span>
          )}
        </div>
      </div>

      {/* Overall Status Bar */}
      <div className={`flex items-center gap-2 px-5 py-2.5 text-xs font-medium ${overallConfig.bg} border-b ${overallConfig.border}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold ${overallConfig.dot}`}>
          {overallConfig.icon}
        </span>
        <span className="text-slate-700">
          {overallStatus === "green" && "All steps map correctly — behavioral parity confirmed"}
          {overallStatus === "amber" && "Some steps need review — check amber items before deployment"}
          {overallStatus === "red" && "Logic gaps detected — fix red items before deployment"}
        </span>
      </div>

      {/* Step Mappings */}
      <div className="divide-y divide-slate-100">
        {mappings.map((mapping) => (
          <StepRow
            key={mapping.sourceStep}
            mapping={mapping}
            isExpanded={expandedStep === mapping.sourceStep}
            onToggle={() => setExpandedStep(expandedStep === mapping.sourceStep ? null : mapping.sourceStep)}
            sourcePlatform={sourcePlatform}
            targetPlatform={targetPlatform}
          />
        ))}
      </div>
    </div>
  );
}

function StepRow({
  mapping,
  isExpanded,
  onToggle,
  sourcePlatform,
  targetPlatform,
}: {
  mapping: StepMapping;
  isExpanded: boolean;
  onToggle: () => void;
  sourcePlatform: string;
  targetPlatform: string;
}) {
  const config = STATUS_CONFIG[mapping.status];

  return (
    <div className={`transition-colors ${isExpanded ? config.bg : "hover:bg-slate-50"}`}>
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3 text-left"
      >
        {/* Status indicator */}
        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold ${config.dot}`}>
          {config.icon}
        </span>

        {/* Source step */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-slate-800">{mapping.sourceStep}</span>
          <span className="flex-shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
            {TYPE_LABELS[mapping.sourceType] || mapping.sourceType}
          </span>
        </div>

        {/* Arrow */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(148,163,184)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>

        {/* Target step */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mapping.targetStep ? (
            <Fragment>
              <span className="truncate text-[13px] font-medium text-slate-800">{mapping.targetStep}</span>
              <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                mapping.status === "green" ? "bg-emerald-200 text-emerald-700" :
                mapping.status === "amber" ? "bg-amber-200 text-amber-700" :
                "bg-red-200 text-red-700"
              }`}>
                {TYPE_LABELS[mapping.targetType || ""] || mapping.targetType || "?"}
              </span>
              {mapping.needsManualConfig && (
                <span className="flex-shrink-0 rounded bg-violet-200 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                  TODO
                </span>
              )}
            </Fragment>
          ) : (
            <span className="text-[13px] italic text-slate-400">inlined / nested</span>
          )}
        </div>

        {/* Expand icon */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(148,163,184)" strokeWidth="2" strokeLinecap="round"
          className={`flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-5 pb-4 pt-0">
          <div className="ml-9 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Rule checks for {mapping.sourceStep}
              </span>
            </div>
            {mapping.ruleResults.map((result, i) => {
              const rConfig = STATUS_CONFIG[result.status];
              return (
                <div key={i} className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${rConfig.bg}`}>
                  <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-white text-[8px] font-bold ${rConfig.dot}`}>
                    {rConfig.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-slate-700">{result.rule}</span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{result.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

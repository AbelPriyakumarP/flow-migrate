"use client";

import type { ValidationIssue } from "@/lib/validator";

interface MigrationLogProps {
  logs: string[];
  isLoading: boolean;
  error?: string;
  validationIssues?: ValidationIssue[];
}

export default function MigrationLog({ logs, isLoading, error, validationIssues = [] }: MigrationLogProps) {
  if (!isLoading && !error && logs.length === 0 && validationIssues.length === 0) return null;

  const errors = validationIssues.filter((i) => i.severity === "error");
  const warnings = validationIssues.filter((i) => i.severity === "warning");
  const hasIssues = errors.length > 0 || warnings.length > 0;

  return (
    <div className="animate-fadeIn space-y-3">
      {/* Migration Log */}
      <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[var(--card-border)] bg-slate-50/80 px-4 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
          <span className="text-[13px] font-semibold text-slate-700">Migration Log</span>
        </div>
        <div className="space-y-1 p-3">
          {isLoading && (
            <div className="flex items-center gap-2.5 rounded-lg bg-indigo-50 px-3 py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              <span className="text-[13px] font-medium text-indigo-700">
                Analyzing workflow structure and generating migration...
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--danger-light)] px-3 py-2">
              <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
              <span className="text-[13px] text-red-700">{error}</span>
            </div>
          )}
          {logs.map((log, i) => {
            const isSuccess = log.includes("passed") || log.includes("deployment-ready");
            const isWarning = log.includes("warning") || log.includes("TODO") || log.includes("manual");
            const isError = log.includes("error");
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg px-3 py-1.5 ${
                  isSuccess ? "bg-emerald-50" : isError ? "bg-red-50" : isWarning ? "bg-amber-50" : "bg-slate-50"
                }`}
              >
                {isSuccess ? (
                  <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                ) : isError ? (
                  <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                ) : isWarning ? (
                  <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                ) : (
                  <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                )}
                <span className={`text-[13px] ${
                  isSuccess ? "text-emerald-700" : isError ? "text-red-700" : isWarning ? "text-amber-700" : "text-slate-600"
                }`}>{log}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Validation Issues */}
      {hasIssues && (
        <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[var(--card-border)] bg-slate-50/80 px-4 py-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
            <span className="text-[13px] font-semibold text-slate-700">Schema Validation</span>
            {errors.length > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                {errors.length} error{errors.length > 1 ? "s" : ""}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {warnings.length} warning{warnings.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="space-y-1 p-3">
            {errors.map((issue, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2">
                <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
                <div>
                  <p className="text-[13px] font-medium text-red-700">{issue.message}</p>
                  {issue.path && <p className="mt-0.5 text-[11px] text-red-400">{issue.path}</p>}
                </div>
              </div>
            ))}
            {warnings.map((issue, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
                <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                <div>
                  <p className="text-[13px] font-medium text-amber-700">{issue.message}</p>
                  {issue.path && <p className="mt-0.5 text-[11px] text-amber-400">{issue.path}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

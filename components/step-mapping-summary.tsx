"use client";

import { useMemo, useState } from "react";
import { safeParseJson } from "@/lib/sanitize-json";

interface StepMappingSummaryProps {
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

// A single configurable field surfaced for a step.
interface StepField {
  key: string;
  value: string;
  manual: boolean;
  hint?: string;
}

interface StepInfo {
  name: string;
  type: string;
  service: string;
  icon: string;
  color: string;
  hasRetry: boolean;
  hasCatch: boolean;
  fields: StepField[];
  manualCount: number;
}

// ── Placeholder detection ─────────────────────────────────────────────
const PLACEHOLDER_PATTERNS: { re: RegExp; hint: string }[] = [
  { re: /ACCOUNT_ID/i, hint: "Replace ACCOUNT_ID with your AWS account number" },
  { re: /\bREGION\b|us-east-1-REPLACE/i, hint: "Set the correct cloud region" },
  { re: /TODO/i, hint: "Complete this TODO before deploying" },
  { re: /REPLACE|CHANGE_ME|YOUR[_-]/i, hint: "Replace this placeholder value" },
  { re: /<[^>]+>/, hint: "Fill in the templated <…> value" },
  { re: /subscriptions\/(sub-id|YOUR)/i, hint: "Set your real Azure subscription id" },
  { re: /\$connections/i, hint: "Create & link this API connection in the Azure portal" },
  { re: /PENDING|MANUAL|GAP_NOTICE/i, hint: "Manual action required" },
  { re: /example\.com|placeholder/i, hint: "Replace the placeholder endpoint" },
];

function detectManual(value: string): string | undefined {
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.re.test(value)) return p.hint;
  }
  return undefined;
}

function compact(v: unknown, max = 80): string {
  let s: string;
  if (typeof v === "string") s = v;
  else s = JSON.stringify(v);
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── AWS state → service label ─────────────────────────────────────────
function awsServiceInfo(state: Record<string, unknown>): { service: string; icon: string; color: string } {
  const resource = String(state.Resource || "");
  const type = String(state.Type || "");
  if (resource.includes("lambda")) return { service: "AWS Lambda", icon: "fn", color: "#ED7100" };
  if (resource.includes("dynamodb")) return { service: "Amazon DynamoDB", icon: "db", color: "#4053D6" };
  if (resource.includes("sqs")) return { service: "Amazon SQS", icon: "mq", color: "#FF4F8B" };
  if (resource.includes("sns")) return { service: "Amazon SNS", icon: "ns", color: "#DE3163" };
  if (resource.includes("s3")) return { service: "Amazon S3", icon: "s3", color: "#3F8624" };
  if (resource.includes("glue")) return { service: "AWS Glue", icon: "gl", color: "#8C4FFF" };
  if (resource.includes("athena")) return { service: "Amazon Athena", icon: "at", color: "#8C4FFF" };
  if (resource.includes("ssm")) return { service: "AWS SSM", icon: "ss", color: "#DD344C" };
  if (resource.includes("states:::")) return { service: "Step Functions Task", icon: "tk", color: "#CD2264" };
  if (type === "Choice") return { service: "Choice (Branch)", icon: "if", color: "var(--accent)" };
  if (type === "Parallel") return { service: "Parallel", icon: "||", color: "var(--accent)" };
  if (type === "Map") return { service: "Map (Iterator)", icon: "[]", color: "var(--accent)" };
  if (type === "Wait") return { service: "Wait Timer", icon: "wt", color: "var(--text-muted)" };
  if (type === "Pass") return { service: "Pass", icon: "ps", color: "var(--text-muted)" };
  if (type === "Succeed") return { service: "Succeed", icon: "ok", color: "var(--success)" };
  if (type === "Fail") return { service: "Fail", icon: "!!", color: "var(--error)" };
  return { service: type || "Task", icon: "tk", color: "var(--aws-color)" };
}

// ── Azure action → service label ──────────────────────────────────────
function azureServiceInfo(action: Record<string, unknown>): { service: string; icon: string; color: string } {
  const t = String(action.type || "").toLowerCase();
  const map: Record<string, { service: string; icon: string; color: string }> = {
    http: { service: "HTTP", icon: "ht", color: "var(--azure-color)" },
    function: { service: "Azure Function", icon: "fn", color: "#0078D4" },
    apiconnection: { service: "API Connection", icon: "ap", color: "#0078D4" },
    if: { service: "Condition (If)", icon: "if", color: "var(--accent)" },
    switch: { service: "Switch", icon: "sw", color: "var(--accent)" },
    foreach: { service: "For Each", icon: "[]", color: "var(--accent)" },
    scope: { service: "Scope", icon: "sc", color: "var(--text-muted)" },
    compose: { service: "Compose", icon: "ps", color: "var(--text-muted)" },
    parsejson: { service: "Parse JSON", icon: "js", color: "var(--text-muted)" },
    terminate: { service: "Terminate", icon: "!!", color: "var(--error)" },
    wait: { service: "Delay", icon: "wt", color: "var(--text-muted)" },
  };
  return map[t] || { service: action.type ? String(action.type) : "Action", icon: "ac", color: "var(--azure-color)" };
}

// ── Field extraction ──────────────────────────────────────────────────
function awsFields(state: Record<string, unknown>): StepField[] {
  const fields: StepField[] = [];
  const push = (key: string, value: unknown) => {
    const v = compact(value);
    if (!v) return;
    fields.push({ key, value: v, manual: !!detectManual(v), hint: detectManual(v) });
  };
  if (state.Resource) push("Resource", state.Resource);
  const params = state.Parameters as Record<string, unknown> | undefined;
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) push(`Parameters.${k}`, v);
  }
  if (state.Choices) push("Choices", `${(state.Choices as unknown[]).length} branch(es)`);
  if (state.Default) push("Default", state.Default);
  if (Array.isArray(state.Retry) && state.Retry.length) push("Retry", `${(state.Retry as unknown[]).length} policy`);
  if (Array.isArray(state.Catch) && state.Catch.length) {
    const targets = (state.Catch as Record<string, unknown>[]).map((c) => c.Next).filter(Boolean).join(", ");
    push("Catch", targets || `${(state.Catch as unknown[]).length} handler(s)`);
  }
  if (state.Next) push("Next", state.Next);
  if (state.End) push("End", "true");
  return fields;
}

function azureFields(action: Record<string, unknown>): StepField[] {
  const fields: StepField[] = [];
  const push = (key: string, value: unknown) => {
    const v = compact(value);
    if (!v) return;
    fields.push({ key, value: v, manual: !!detectManual(v), hint: detectManual(v) });
  };
  const inputs = action.inputs as Record<string, unknown> | undefined;
  if (inputs && typeof inputs === "object") {
    if (inputs.method) push("method", inputs.method);
    if (inputs.uri) push("uri", inputs.uri);
    if (inputs.path) push("path", inputs.path);
    const fn = inputs.function as Record<string, unknown> | undefined;
    if (fn?.id) push("function.id", fn.id);
    const host = inputs.host as Record<string, unknown> | undefined;
    const conn = host?.connection as Record<string, unknown> | undefined;
    if (conn?.name) push("connection", conn.name);
    if (inputs.body !== undefined) push("body", inputs.body);
    if (inputs.runStatus) push("runStatus", inputs.runStatus);
  }
  const retry = action.retryPolicy as Record<string, unknown> | undefined;
  if (retry) push("retryPolicy", `${retry.type || "policy"} × ${retry.count ?? "?"}`);
  const runAfter = action.runAfter as Record<string, unknown> | undefined;
  if (runAfter && Object.keys(runAfter).length) push("runAfter", Object.keys(runAfter).join(", "));
  return fields;
}

export default function StepMappingSummary({ outputCode, direction }: StepMappingSummaryProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const data = useMemo(() => {
    const parsed = safeParseJson(outputCode);
    if (!parsed) return null;

    const isAws = direction === "azure-to-aws";
    const steps: StepInfo[] = [];

    if (isAws) {
      const states = (parsed.States || {}) as Record<string, Record<string, unknown>>;
      for (const [name, state] of Object.entries(states)) {
        const svc = awsServiceInfo(state);
        const fields = awsFields(state);
        steps.push({
          name, type: String(state.Type || ""), ...svc,
          hasRetry: Array.isArray(state.Retry) && state.Retry.length > 0,
          hasCatch: Array.isArray(state.Catch) && state.Catch.length > 0,
          fields, manualCount: fields.filter((f) => f.manual).length,
        });
      }
    } else {
      const def = (parsed.definition as Record<string, unknown>) || parsed;
      const actions = (def.actions || parsed.actions || {}) as Record<string, Record<string, unknown>>;
      for (const [name, action] of Object.entries(actions)) {
        const svc = azureServiceInfo(action);
        const fields = azureFields(action);
        steps.push({
          name, type: String(action.type || ""), ...svc,
          hasRetry: !!action.retryPolicy, hasCatch: false,
          fields, manualCount: fields.filter((f) => f.manual).length,
        });
      }
    }

    if (steps.length === 0) return null;
    const manualSteps = steps.filter((s) => s.manualCount > 0);
    const services = [...new Set(steps.map((s) => s.service))];
    return { steps, manualSteps, services, isAws, platform: isAws ? "AWS" : "Azure" };
  }, [outputCode, direction]);

  if (!data) return null;
  const { steps, manualSteps, services, platform } = data;

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <details className="glass-card-static rounded-xl overflow-hidden animate-slideUp" open>
      <summary className="flex items-center justify-between cursor-pointer px-5 py-3 select-none" style={{ background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent-bg)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          </div>
          <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Step Mapping Summary</span>
          <div className="flex items-center gap-2 ml-1">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
              {steps.length - manualSteps.length} auto
            </span>
            {manualSteps.length > 0 && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                {manualSteps.length} manual
              </span>
            )}
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
              {steps.length} {platform === "AWS" ? "states" : "actions"}
            </span>
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </summary>

      <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {/* Services used */}
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>{platform} Services Used</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {services.map((svc, i) => (
              <span key={i} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{svc}</span>
            ))}
          </div>
        </div>

        {/* State-by-state — each row expands to show its fields */}
        <div className="px-3 py-3 max-h-[420px] overflow-auto scrollbar-thin">
          <div className="px-2 mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>
              {platform === "AWS" ? "State" : "Action"} Configuration ({steps.length})
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>click a row to view fields</span>
          </div>

          <div className="space-y-1">
            {steps.map((step) => {
              const isOpen = expanded.has(step.name);
              const needsManual = step.manualCount > 0;
              return (
                <div key={step.name} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${needsManual ? "rgba(251,191,36,0.25)" : "var(--border-subtle)"}`, background: needsManual ? "var(--warning-bg)" : "transparent" }}>
                  <button onClick={() => toggle(step.name)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-black text-white" style={{ background: step.color }}>{step.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{step.name}</span>
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>{step.type}</span>
                        {step.hasRetry && <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(56,189,248,0.1)", color: "var(--azure-color)" }}>RETRY</span>}
                        {step.hasCatch && <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(251,113,133,0.1)", color: "var(--error)" }}>CATCH</span>}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{step.service} · {step.fields.length} field{step.fields.length !== 1 ? "s" : ""}</span>
                    </div>
                    {needsManual ? (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(251,191,36,0.18)", color: "var(--warning)" }}>{step.manualCount} MANUAL</span>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20,6 9,17 4,12" /></svg>AUTO
                      </span>
                    )}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-2.5 pt-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      {step.fields.length === 0 ? (
                        <p className="px-2 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>No configurable fields — this step works as-is.</p>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          {step.fields.map((f, fi) => (
                            <div key={fi} className="flex items-start gap-2 rounded-md px-2.5 py-1.5" style={{ background: f.manual ? "rgba(251,191,36,0.08)" : "var(--bg-tertiary)" }}>
                              <span className="shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold" style={{ background: "var(--bg-secondary)", color: f.manual ? "var(--warning)" : "var(--text-secondary)" }}>{f.key}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-mono break-all" style={{ color: "var(--text-secondary)" }}>{f.value}</p>
                                {f.manual && f.hint && (
                                  <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--warning)" }}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                                    {f.hint}
                                  </p>
                                )}
                              </div>
                              {f.manual ? (
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ background: "rgba(251,191,36,0.18)", color: "var(--warning)" }}>fill in</span>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 mt-0.5"><polyline points="20,6 9,17 4,12" /></svg>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Manual configuration checklist */}
        {manualSteps.length > 0 ? (
          <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--warning-bg)" }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--warning)" }}>Manual Configuration Checklist ({manualSteps.length})</span>
            <div className="mt-2 space-y-2">
              {manualSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white mt-0.5" style={{ background: "var(--warning)" }}>{i + 1}</span>
                  <div className="min-w-0">
                    <span className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{step.name}</span>
                    <span className="text-[11px] ml-1.5" style={{ color: "var(--text-muted)" }}>({step.service})</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {step.fields.filter((f) => f.manual).map((f, fi) => (
                        <li key={fi} className="text-[11px]" style={{ color: "var(--warning)" }}>
                          <span className="font-mono font-semibold">{f.key}</span> — {f.hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--success-bg)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12" /></svg>
            <span className="text-[12px] font-semibold" style={{ color: "var(--success)" }}>All steps migrated automatically — no manual configuration needed</span>
          </div>
        )}
      </div>
    </details>
  );
}

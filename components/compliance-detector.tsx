"use client";

import { useState, useMemo, useCallback } from "react";

type Severity = "critical" | "high" | "medium" | "low";
type Framework = "SOC2" | "HIPAA" | "PCI-DSS" | "GDPR" | "All";

interface ComplianceFinding {
  id: string;
  framework: string[];
  severity: Severity;
  title: string;
  description: string;
  path: string;
  remediation: string;
  autoFixable: boolean;
}

interface ComplianceDetectorProps {
  isOpen: boolean;
  onClose: () => void;
  outputCode: string;
  onApplyFix: (fixedCode: string) => void;
}

export default function ComplianceDetector({ isOpen, onClose, outputCode, onApplyFix }: ComplianceDetectorProps) {
  const [selectedFramework, setSelectedFramework] = useState<Framework>("All");
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const findings: ComplianceFinding[] = useMemo(() => {
    if (!outputCode || !scanned) return [];
    try {
      const parsed = JSON.parse(outputCode);
      return runComplianceScan(parsed);
    } catch {
      return [];
    }
  }, [outputCode, scanned]);

  const handleScan = useCallback(() => {
    setScanning(true);
    setAppliedFixes(new Set());
    setTimeout(() => { setScanning(false); setScanned(true); }, 1200);
  }, []);

  const filteredFindings = useMemo(() => {
    if (selectedFramework === "All") return findings;
    return findings.filter((f) => f.framework.includes(selectedFramework));
  }, [findings, selectedFramework]);

  const handleApplyFix = useCallback((finding: ComplianceFinding) => {
    if (!finding.autoFixable) return;
    try {
      const parsed = JSON.parse(outputCode);
      const fixed = applyComplianceFix(parsed, finding);
      onApplyFix(JSON.stringify(fixed, null, 2));
      setAppliedFixes((prev) => new Set([...prev, finding.id]));
    } catch { /* ignore */ }
  }, [outputCode, onApplyFix]);

  const handleApplyAll = useCallback(() => {
    try {
      let parsed = JSON.parse(outputCode);
      const fixable = filteredFindings.filter((f) => f.autoFixable && !appliedFixes.has(f.id));
      for (const finding of fixable) {
        parsed = applyComplianceFix(parsed, finding);
        setAppliedFixes((prev) => new Set([...prev, finding.id]));
      }
      onApplyFix(JSON.stringify(parsed, null, 2));
    } catch { /* ignore */ }
  }, [outputCode, filteredFindings, appliedFixes, onApplyFix]);

  const severityConfig: Record<Severity, { color: string; bg: string; label: string }> = {
    critical: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", label: "Critical" },
    high: { color: "#fb7185", bg: "rgba(251,113,133,0.08)", label: "High" },
    medium: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", label: "Medium" },
    low: { color: "#38bdf8", bg: "rgba(56,189,248,0.08)", label: "Low" },
  };

  const frameworks: Framework[] = ["All", "SOC2", "HIPAA", "PCI-DSS", "GDPR"];

  const stats = useMemo(() => {
    const s = { critical: 0, high: 0, medium: 0, low: 0, autoFixable: 0, fixed: appliedFixes.size };
    for (const f of filteredFindings) {
      s[f.severity]++;
      if (f.autoFixable) s.autoFixable++;
    }
    return s;
  }, [filteredFindings, appliedFixes]);

  const score = useMemo(() => {
    if (!scanned) return 0;
    if (findings.length === 0) return 100;
    const penalty = findings.reduce((sum, f) => {
      if (appliedFixes.has(f.id)) return sum;
      if (f.severity === "critical") return sum + 25;
      if (f.severity === "high") return sum + 15;
      if (f.severity === "medium") return sum + 8;
      return sum + 3;
    }, 0);
    return Math.max(0, 100 - penalty);
  }, [findings, scanned, appliedFixes]);

  const scoreColor = score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--error)";

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="fixed inset-4 sm:inset-8 z-50 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-elevated)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #22d3ee, #0ea5e9)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text-bright)" }}>Compliance Drift Detector</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Scan migrated workflows against SOC2, HIPAA, PCI-DSS & GDPR checklists
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {scanned && stats.autoFixable > 0 && stats.autoFixable > appliedFixes.size && (
              <button onClick={handleApplyAll} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold transition-all" style={{ background: "var(--accent-gradient)", color: "white" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                Fix All ({stats.autoFixable - appliedFixes.size})
              </button>
            )}
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Score & Stats */}
          <div className="w-72 shrink-0 border-r overflow-y-auto p-5 space-y-5" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
            {/* Score Ring */}
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative h-28 w-28">
                <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border-subtle)" strokeWidth="8" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${score * 3.14} ${314 - score * 3.14}`} className="transition-all duration-1000" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[28px] font-bold" style={{ color: scoreColor }}>{score}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Score</span>
                </div>
              </div>
              {!scanned ? (
                <button onClick={handleScan} disabled={!outputCode || scanning} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[12px] font-bold transition-all disabled:opacity-40" style={{ background: "var(--accent-gradient)", color: "white" }}>
                  {scanning ? (
                    <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Scanning...</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> Run Scan</>
                  )}
                </button>
              ) : (
                <button onClick={handleScan} className="text-[11px] font-semibold underline" style={{ color: "var(--accent)" }}>Re-scan</button>
              )}
            </div>

            {/* Severity Breakdown */}
            {scanned && (
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>Severity</span>
                {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => (
                  <div key={sev} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: stats[sev] > 0 ? severityConfig[sev].bg : "transparent" }}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: severityConfig[sev].color }} />
                      <span className="text-[11px] font-semibold capitalize" style={{ color: stats[sev] > 0 ? severityConfig[sev].color : "var(--text-muted)" }}>{sev}</span>
                    </div>
                    <span className="text-[12px] font-bold" style={{ color: stats[sev] > 0 ? severityConfig[sev].color : "var(--text-muted)" }}>{stats[sev]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Framework Filter */}
            {scanned && (
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>Framework</span>
                <div className="flex flex-wrap gap-1">
                  {frameworks.map((fw) => (
                    <button key={fw} onClick={() => setSelectedFramework(fw)} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all" style={{ background: selectedFramework === fw ? "var(--accent-bg)" : "transparent", color: selectedFramework === fw ? "var(--accent)" : "var(--text-muted)", border: `1px solid ${selectedFramework === fw ? "var(--border-primary)" : "var(--border-subtle)"}` }}>
                      {fw}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Findings */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {!scanned ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </div>
                <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Ready to scan</p>
                <p className="text-[12px] text-center max-w-sm" style={{ color: "var(--text-muted)" }}>
                  Run a compliance scan to check your migrated workflow against SOC2, HIPAA, PCI-DSS, and GDPR checklists
                </p>
              </div>
            ) : filteredFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--success-bg)", border: "1px solid rgba(34,211,238,0.15)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20,6 9,17 4,12" /></svg>
                </div>
                <p className="text-[15px] font-bold" style={{ color: "var(--success)" }}>All clear</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No compliance issues found for {selectedFramework}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}</span>
                  {appliedFixes.size > 0 && <span className="text-[11px] font-bold" style={{ color: "var(--success)" }}>{appliedFixes.size} fixed</span>}
                </div>
                {filteredFindings.map((finding) => {
                  const isFixed = appliedFixes.has(finding.id);
                  const sev = severityConfig[finding.severity];
                  return (
                    <div key={finding.id} className="rounded-xl overflow-hidden transition-all" style={{ border: `1px solid ${isFixed ? "rgba(34,211,238,0.2)" : sev.bg.replace("0.08", "0.2")}`, opacity: isFixed ? 0.6 : 1 }}>
                      <div className="flex items-start gap-3 px-5 py-4" style={{ background: isFixed ? "var(--success-bg)" : sev.bg }}>
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: isFixed ? "rgba(34,211,238,0.15)" : `${sev.color}15` }}>
                          {isFixed ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sev.color} strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-bold" style={{ color: isFixed ? "var(--success)" : "var(--text-bright)", textDecoration: isFixed ? "line-through" : "none" }}>{finding.title}</span>
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${sev.color}15`, color: sev.color }}>{sev.label}</span>
                            {finding.framework.map((fw) => (
                              <span key={fw} className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>{fw}</span>
                            ))}
                          </div>
                          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{finding.description}</p>
                          {finding.path && <p className="text-[10px] font-mono mt-1" style={{ color: "var(--text-muted)" }}>{finding.path}</p>}
                          <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                            <p className="text-[10px] flex-1" style={{ color: "var(--text-muted)" }}>{finding.remediation}</p>
                          </div>
                        </div>
                        {finding.autoFixable && !isFixed && (
                          <button onClick={() => handleApplyFix(finding)} className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all hover:shadow-md" style={{ background: "var(--accent-gradient)", color: "white" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                            Auto-Fix
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function runComplianceScan(parsed: Record<string, unknown>): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const actions = (parsed.actions || parsed.States || {}) as Record<string, unknown>;
  const params = (parsed.parameters || {}) as Record<string, unknown>;
  let findingIdx = 0;

  function checkAction(name: string, action: Record<string, unknown>, path: string) {
    const inputs = action.inputs as Record<string, unknown> | undefined;
    const aType = (action.type as string) || "";
    const uri = ((inputs?.uri || inputs?.path || "") as string).toString();
    const auth = (inputs?.authentication || action.authentication) as Record<string, unknown> | undefined;

    if (aType === "Http" || aType === "HTTP") {
      if (!auth && !inputs?.authentication) {
        findings.push({
          id: `f-${findingIdx++}`, framework: ["SOC2", "PCI-DSS"], severity: "critical",
          title: `HTTP action '${name}' has no authentication`,
          description: "All HTTP calls must use authentication (Managed Identity, OAuth, API Key). Unauthenticated endpoints are a security risk.",
          path: `${path}.${name}`, remediation: "Add ManagedServiceIdentity authentication with the correct audience for the target service.",
          autoFixable: true,
        });
      }

      if (uri.startsWith("http://") && !uri.includes("localhost") && !uri.includes("169.254.169.254")) {
        findings.push({
          id: `f-${findingIdx++}`, framework: ["SOC2", "HIPAA", "PCI-DSS"], severity: "critical",
          title: `HTTP action '${name}' uses unencrypted HTTP`,
          description: "All external communication must use HTTPS/TLS. Plain HTTP transmits data in cleartext, violating encryption-in-transit requirements.",
          path: `${path}.${name}.inputs.uri`, remediation: "Change http:// to https:// in the URI.",
          autoFixable: true,
        });
      }

      if (!inputs?.retryPolicy) {
        findings.push({
          id: `f-${findingIdx++}`, framework: ["SOC2"], severity: "medium",
          title: `HTTP action '${name}' missing retry policy`,
          description: "SOC2 availability controls require retry policies on external calls to handle transient failures.",
          path: `${path}.${name}.inputs`, remediation: "Add exponential retry policy with count: 3, interval: PT30S.",
          autoFixable: true,
        });
      }
    }

    if (inputs?.body) {
      const bodyStr = JSON.stringify(inputs.body);
      const sensitivePatterns = [/password/i, /secret/i, /api[_-]?key/i, /token(?!.*variable)/i, /credential/i, /private[_-]?key/i];
      for (const pattern of sensitivePatterns) {
        if (pattern.test(bodyStr)) {
          const matched = bodyStr.match(pattern)?.[0] || "sensitive data";
          if (!bodyStr.includes("@parameters(") && !bodyStr.includes("@variables(") && !bodyStr.includes("listKeys") && !bodyStr.includes("vault.azure.net")) {
            findings.push({
              id: `f-${findingIdx++}`, framework: ["SOC2", "HIPAA", "PCI-DSS", "GDPR"], severity: "critical",
              title: `Possible hardcoded secret in '${name}'`,
              description: `Found '${matched}' pattern in action body. Hardcoded secrets violate all major compliance frameworks.`,
              path: `${path}.${name}.inputs.body`, remediation: "Move the secret to Azure Key Vault and reference it via @parameters() or Key Vault linked service.",
              autoFixable: false,
            });
          }
        }
      }
    }

    if (aType === "ServiceProvider" || (uri && /servicebus/i.test(uri))) {
      if (!auth || (auth.type !== "ManagedServiceIdentity" && auth.type !== "ActiveDirectoryOAuth")) {
        findings.push({
          id: `f-${findingIdx++}`, framework: ["SOC2", "PCI-DSS"], severity: "high",
          title: `Service Bus action '${name}' missing Managed Identity auth`,
          description: "Service Bus connections should use Managed Identity authentication instead of connection strings.",
          path: `${path}.${name}`, remediation: "Configure ManagedServiceIdentity authentication with audience https://servicebus.azure.net/.",
          autoFixable: true,
        });
      }
    }

    if (inputs && typeof inputs.body === "object") {
      const body = inputs.body as Record<string, unknown>;
      const hasPII = /\b(ssn|social.security|date.of.birth|dob|phone.number|email.address|patient.id|medical.record)\b/i.test(JSON.stringify(body));
      if (hasPII) {
        findings.push({
          id: `f-${findingIdx++}`, framework: ["HIPAA", "GDPR"], severity: "high",
          title: `Potential PII/PHI in '${name}' action body`,
          description: "Action body may contain personally identifiable or protected health information. Ensure data is encrypted and access is logged.",
          path: `${path}.${name}.inputs.body`, remediation: "Apply data masking, ensure encryption at rest, and enable diagnostic logging.",
          autoFixable: false,
        });
      }
    }

    const runAfter = action.runAfter as Record<string, unknown> | undefined;
    if (runAfter) {
      for (const [dep, statuses] of Object.entries(runAfter)) {
        const statusList = statuses as string[];
        if (statusList.includes("Failed") && !statusList.includes("Succeeded")) {
          // This is an error handler - check it has alerting
        }
      }
    }

    if (action.actions) {
      for (const [subName, subAction] of Object.entries(action.actions as Record<string, unknown>)) {
        checkAction(subName, subAction as Record<string, unknown>, `${path}.${name}.actions`);
      }
    }
    if (action.else && (action.else as Record<string, unknown>).actions) {
      for (const [subName, subAction] of Object.entries((action.else as Record<string, unknown>).actions as Record<string, unknown>)) {
        checkAction(subName, subAction as Record<string, unknown>, `${path}.${name}.else.actions`);
      }
    }
  }

  for (const [name, action] of Object.entries(actions)) {
    checkAction(name, action as Record<string, unknown>, "actions");
  }

  // Check for missing diagnostic logging
  const actionNames = Object.keys(actions);
  const hasLogging = actionNames.some((n) => /log|monitor|diagnostic|audit/i.test(n));
  if (!hasLogging && actionNames.length > 0) {
    findings.push({
      id: `f-${findingIdx++}`, framework: ["SOC2", "HIPAA"], severity: "medium",
      title: "No audit logging actions detected",
      description: "Compliance frameworks require audit logging for all workflow executions. No logging/monitoring actions found.",
      path: "actions", remediation: "Add Azure Monitor diagnostic logging actions to track execution status and errors.",
      autoFixable: false,
    });
  }

  // Check for missing error handling at top level
  const hasTerminate = actionNames.some((n) => /terminate|fail|error/i.test(n));
  const hasErrorHandler = Object.values(actions).some((a) => {
    const ra = (a as Record<string, unknown>).runAfter as Record<string, unknown> | undefined;
    return ra && Object.values(ra).some((statuses) => (statuses as string[]).includes("Failed"));
  });
  if (!hasTerminate && !hasErrorHandler && actionNames.length > 3) {
    findings.push({
      id: `f-${findingIdx++}`, framework: ["SOC2"], severity: "medium",
      title: "No error handling or termination actions",
      description: "Workflow lacks explicit error handling. Failures may go undetected, violating operational monitoring requirements.",
      path: "actions", remediation: "Add Scope-based error handling with Terminate actions and alert notifications.",
      autoFixable: false,
    });
  }

  // Check for CORS/network exposure
  const triggers = parsed.triggers as Record<string, unknown> | undefined;
  if (triggers) {
    for (const [tName, trigger] of Object.entries(triggers)) {
      const t = trigger as Record<string, unknown>;
      if (t.type === "Request" || t.kind === "Http") {
        const conditions = t.conditions as Record<string, unknown> | undefined;
        if (!conditions) {
          findings.push({
            id: `f-${findingIdx++}`, framework: ["SOC2", "PCI-DSS"], severity: "high",
            title: `HTTP trigger '${tName}' has no access restrictions`,
            description: "HTTP triggers should have IP restrictions or authentication to prevent unauthorized access.",
            path: `triggers.${tName}`, remediation: "Add trigger conditions with allowed IP ranges or require SAS token authentication.",
            autoFixable: false,
          });
        }
      }
    }
  }

  // Check parameters for default empty values (potential misconfiguration)
  for (const [pName, pVal] of Object.entries(params)) {
    const p = pVal as Record<string, unknown>;
    if (p.type === "SecureString" && p.defaultValue) {
      findings.push({
        id: `f-${findingIdx++}`, framework: ["SOC2", "PCI-DSS"], severity: "critical",
        title: `SecureString parameter '${pName}' has a default value`,
        description: "SecureString parameters should not have default values as they may be exposed in deployment templates.",
        path: `parameters.${pName}`, remediation: "Remove the defaultValue from this SecureString parameter.",
        autoFixable: true,
      });
    }
  }

  return findings.sort((a, b) => {
    const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}

function applyComplianceFix(parsed: Record<string, unknown>, finding: ComplianceFinding): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(parsed));
  const actions = (result.actions || result.States || {}) as Record<string, unknown>;

  const pathParts = finding.path.split(".");
  const actionName = pathParts.length >= 2 ? pathParts[1] : "";

  function findAction(name: string, actionsObj: Record<string, unknown>): Record<string, unknown> | null {
    if (actionsObj[name]) return actionsObj[name] as Record<string, unknown>;
    for (const val of Object.values(actionsObj)) {
      const a = val as Record<string, unknown>;
      if (a.actions) {
        const found = findAction(name, a.actions as Record<string, unknown>);
        if (found) return found;
      }
      if (a.else && (a.else as Record<string, unknown>).actions) {
        const found = findAction(name, (a.else as Record<string, unknown>).actions as Record<string, unknown>);
        if (found) return found;
      }
    }
    return null;
  }

  const action = actionName ? findAction(actionName, actions) : null;

  if (finding.title.includes("no authentication") && action) {
    const inputs = (action.inputs || {}) as Record<string, unknown>;
    inputs.authentication = { type: "ManagedServiceIdentity", audience: "https://management.azure.com/" };
    action.inputs = inputs;
  }

  if (finding.title.includes("unencrypted HTTP") && action) {
    const inputs = (action.inputs || {}) as Record<string, unknown>;
    if (typeof inputs.uri === "string") {
      inputs.uri = inputs.uri.replace(/^http:\/\//i, "https://");
    }
  }

  if (finding.title.includes("missing retry policy") && action) {
    const inputs = (action.inputs || {}) as Record<string, unknown>;
    inputs.retryPolicy = { type: "exponential", count: 3, interval: "PT30S", minimumInterval: "PT15S", maximumInterval: "PT5M" };
    action.inputs = inputs;
  }

  if (finding.title.includes("missing Managed Identity") && action) {
    const inputs = (action.inputs || {}) as Record<string, unknown>;
    inputs.authentication = { type: "ManagedServiceIdentity", audience: "https://servicebus.azure.net/" };
    action.inputs = inputs;
  }

  if (finding.title.includes("SecureString parameter")) {
    const pName = finding.path.split(".").pop() || "";
    const params = result.parameters as Record<string, unknown>;
    if (params[pName]) {
      delete (params[pName] as Record<string, unknown>).defaultValue;
    }
  }

  return result;
}

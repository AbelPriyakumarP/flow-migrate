"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";

type SimStatus = "idle" | "running" | "completed" | "failed";
type ActionResult = "pending" | "running" | "succeeded" | "failed" | "skipped";

interface SimulatedAction {
  name: string;
  type: string;
  status: ActionResult;
  startTime?: number;
  endTime?: number;
  mockResponse?: Record<string, unknown>;
  error?: string;
  dependsOn: string[];
}

interface PlaygroundProps {
  isOpen: boolean;
  onClose: () => void;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

const MOCK_ENDPOINTS: Record<string, { latency: number; successRate: number; response: Record<string, unknown> }> = {
  Http: { latency: 200, successRate: 0.95, response: { statusCode: 200, body: { status: "ok" } } },
  HTTP: { latency: 200, successRate: 0.95, response: { statusCode: 200, body: { status: "ok" } } },
  Function: { latency: 350, successRate: 0.98, response: { statusCode: 200, body: { result: "success", refreshId: "pbi-ref-001" } } },
  ServiceProvider: { latency: 150, successRate: 0.97, response: { messageId: "msg-001", sequenceNumber: 1 } },
  Scope: { latency: 50, successRate: 1.0, response: { status: "Succeeded" } },
  If: { latency: 10, successRate: 1.0, response: { evaluated: true } },
  Switch: { latency: 10, successRate: 1.0, response: { matched: "default" } },
  Foreach: { latency: 100, successRate: 0.96, response: { iterationsCompleted: 5, status: "Succeeded" } },
  Until: { latency: 800, successRate: 0.92, response: { iterationsCompleted: 3, life_cycle_state: "TERMINATED", result_state: "SUCCESS" } },
  Wait: { latency: 50, successRate: 1.0, response: { waited: true } },
  Delay: { latency: 50, successRate: 1.0, response: { delayed: true } },
  Compose: { latency: 5, successRate: 1.0, response: { output: {} } },
  InitializeVariable: { latency: 5, successRate: 1.0, response: { initialized: true } },
  SetVariable: { latency: 5, successRate: 1.0, response: { set: true } },
  Terminate: { latency: 5, successRate: 1.0, response: { terminated: true } },
  ApiConnection: { latency: 300, successRate: 0.94, response: { statusCode: 200, body: {} } },
};

export default function MigrationPlayground({ isOpen, onClose, outputCode, direction }: PlaygroundProps) {
  const [simStatus, setSimStatus] = useState<SimStatus>("idle");
  const [actions, setActions] = useState<SimulatedAction[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [failureRate, setFailureRate] = useState(5);
  const [speed, setSpeed] = useState(1);
  const abortRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const parsedActions = useMemo(() => {
    try {
      const parsed = JSON.parse(outputCode);
      const acts = parsed.actions || parsed.States || parsed.definition?.actions || {};
      return acts as Record<string, Record<string, unknown>>;
    } catch { return {}; }
  }, [outputCode]);

  const initActions = useCallback(() => {
    const result: SimulatedAction[] = [];
    for (const [name, action] of Object.entries(parsedActions)) {
      const runAfter = (action.runAfter || {}) as Record<string, unknown>;
      result.push({
        name,
        type: (action.type as string) || "Task",
        status: "pending",
        dependsOn: Object.keys(runAfter),
        mockResponse: undefined,
      });
    }
    return result;
  }, [parsedActions]);

  const handleRun = useCallback(async () => {
    abortRef.current = false;
    const initial = initActions();
    setActions(initial);
    setLogs([`[${new Date().toLocaleTimeString()}] Simulation started — ${initial.length} actions to execute`]);
    setSimStatus("running");
    setSelectedAction(null);

    const completed = new Set<string>();
    const actionMap = new Map(initial.map((a) => [a.name, a]));
    let allDone = false;
    let iteration = 0;

    while (!allDone && !abortRef.current && iteration < 100) {
      iteration++;
      const ready = initial.filter((a) =>
        a.status === "pending" && a.dependsOn.every((dep) => completed.has(dep))
      );

      if (ready.length === 0 && initial.some((a) => a.status === "pending")) {
        const remaining = initial.filter((a) => a.status === "pending");
        for (const a of remaining) {
          a.status = "skipped";
          setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] SKIPPED: '${a.name}' — unresolved dependencies`]);
        }
        break;
      }

      if (ready.length === 0) { allDone = true; break; }

      for (const action of ready) {
        if (abortRef.current) break;
        action.status = "running";
        action.startTime = Date.now();
        setActions([...initial]);
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] RUNNING: '${action.name}' (${action.type})`]);

        const endpoint = MOCK_ENDPOINTS[action.type] || MOCK_ENDPOINTS.Http;
        const adjustedLatency = Math.max(20, endpoint.latency / speed + (Math.random() * 100 / speed));

        await new Promise((resolve) => setTimeout(resolve, adjustedLatency));

        const adjustedSuccessRate = 1 - (failureRate / 100);
        const succeeded = Math.random() < adjustedSuccessRate;

        action.endTime = Date.now();

        if (succeeded) {
          action.status = "succeeded";
          action.mockResponse = { ...endpoint.response, _simulatedLatency: `${Math.round(adjustedLatency)}ms` };
          completed.add(action.name);
          setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] SUCCEEDED: '${action.name}' (${Math.round(adjustedLatency)}ms)`]);
        } else {
          action.status = "failed";
          action.error = `Simulated failure: ${action.type} endpoint returned 500`;
          action.mockResponse = { statusCode: 500, error: "InternalServerError", message: "Simulated transient failure" };
          setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] FAILED: '${action.name}' — simulated transient error`]);

          const dependents = initial.filter((a) => a.dependsOn.includes(action.name) && a.status === "pending");
          for (const dep of dependents) {
            const runAfter = (parsedActions[dep.name]?.runAfter || {}) as Record<string, string[]>;
            const depStatuses = runAfter[action.name] || ["Succeeded"];
            if (depStatuses.includes("Failed")) {
              completed.add(action.name);
            }
          }
        }

        setActions([...initial]);
      }

      allDone = initial.every((a) => a.status !== "pending");
    }

    const failedCount = initial.filter((a) => a.status === "failed").length;
    const skippedCount = initial.filter((a) => a.status === "skipped").length;
    const succeededCount = initial.filter((a) => a.status === "succeeded").length;
    const totalTime = initial.reduce((sum, a) => sum + ((a.endTime || 0) - (a.startTime || 0)), 0);

    setSimStatus(failedCount > 0 ? "failed" : "completed");
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Simulation complete — ${succeededCount} succeeded, ${failedCount} failed, ${skippedCount} skipped (${totalTime}ms total)`,
    ]);
  }, [initActions, failureRate, speed, parsedActions]);

  const handleStop = useCallback(() => { abortRef.current = true; setSimStatus("idle"); }, []);
  const handleReset = useCallback(() => { abortRef.current = true; setSimStatus("idle"); setActions([]); setLogs([]); setSelectedAction(null); }, []);

  const selectedActionData = useMemo(() => actions.find((a) => a.name === selectedAction), [actions, selectedAction]);

  const stats = useMemo(() => {
    const s = { total: actions.length, succeeded: 0, failed: 0, running: 0, pending: 0, skipped: 0 };
    for (const a of actions) s[a.status]++;
    return s;
  }, [actions]);

  const progress = actions.length > 0 ? Math.round(((stats.succeeded + stats.failed + stats.skipped) / stats.total) * 100) : 0;

  const statusColors: Record<ActionResult, string> = {
    pending: "var(--text-muted)",
    running: "var(--accent)",
    succeeded: "var(--success)",
    failed: "var(--error)",
    skipped: "var(--warning)",
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="fixed inset-4 sm:inset-6 z-50 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-elevated)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #10b981, #22d3ee)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text-bright)" }}>Live Migration Playground</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Simulate workflow execution against mock Azure endpoints
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Speed Control */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Speed</span>
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                {[1, 2, 5, 10].map((s) => (
                  <button key={s} onClick={() => setSpeed(s)} className="px-2 py-1 text-[10px] font-bold transition-all" style={{ background: speed === s ? "var(--accent-bg)" : "transparent", color: speed === s ? "var(--accent)" : "var(--text-muted)" }}>
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Failure Rate */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Chaos</span>
              <input type="range" min="0" max="50" value={failureRate} onChange={(e) => setFailureRate(Number(e.target.value))} className="w-16 h-1 accent-[var(--error)]" />
              <span className="text-[10px] font-mono w-8" style={{ color: "var(--error)" }}>{failureRate}%</span>
            </div>

            {/* Action Buttons */}
            {simStatus === "running" ? (
              <button onClick={handleStop} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold" style={{ background: "var(--danger-bg)", color: "var(--error)", border: "1px solid rgba(251,113,133,0.2)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                Stop
              </button>
            ) : (
              <button onClick={handleRun} disabled={Object.keys(parsedActions).length === 0} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, #10b981, #22d3ee)", color: "white" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                {simStatus === "idle" ? "Run Simulation" : "Re-run"}
              </button>
            )}
            <button onClick={handleReset} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }} title="Reset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {actions.length > 0 && (
          <div className="shrink-0 h-1.5" style={{ background: "var(--border-subtle)" }}>
            <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: stats.failed > 0 ? "var(--error)" : "linear-gradient(90deg, #10b981, #22d3ee)" }} />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Action List */}
          <div className="w-80 shrink-0 border-r overflow-y-auto" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
            {/* Stats */}
            {actions.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 p-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="rounded-lg p-2 text-center" style={{ background: "var(--success-bg)" }}>
                  <span className="text-[14px] font-bold block" style={{ color: "var(--success)" }}>{stats.succeeded}</span>
                  <span className="text-[8px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Pass</span>
                </div>
                <div className="rounded-lg p-2 text-center" style={{ background: "var(--danger-bg)" }}>
                  <span className="text-[14px] font-bold block" style={{ color: "var(--error)" }}>{stats.failed}</span>
                  <span className="text-[8px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Fail</span>
                </div>
                <div className="rounded-lg p-2 text-center" style={{ background: "var(--accent-bg)" }}>
                  <span className="text-[14px] font-bold block" style={{ color: "var(--accent)" }}>{stats.running + stats.pending}</span>
                  <span className="text-[8px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Queue</span>
                </div>
              </div>
            )}

            <div className="p-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-2" style={{ color: "var(--text-muted)" }}>
                Actions ({Object.keys(parsedActions).length})
              </span>
            </div>

            {actions.length > 0 ? (
              <div className="px-2 pb-3 space-y-0.5">
                {actions.map((action) => (
                  <button key={action.name} onClick={() => setSelectedAction(action.name)} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all" style={{ background: selectedAction === action.name ? "var(--accent-bg)" : "transparent", border: selectedAction === action.name ? "1px solid var(--border-primary)" : "1px solid transparent" }}>
                    <div className="relative">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center ${action.status === "running" ? "animate-pulse" : ""}`} style={{ background: `${statusColors[action.status]}20`, border: `1.5px solid ${statusColors[action.status]}` }}>
                        {action.status === "succeeded" && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={statusColors.succeeded} strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>}
                        {action.status === "failed" && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={statusColors.failed} strokeWidth="3"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>}
                        {action.status === "running" && <div className="h-2 w-2 rounded-full" style={{ background: statusColors.running }} />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold block truncate" style={{ color: selectedAction === action.name ? "var(--text-bright)" : "var(--text-primary)" }}>{action.name}</span>
                      <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{action.type}</span>
                    </div>
                    {action.endTime && action.startTime && (
                      <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{action.endTime - action.startTime}ms</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2 pb-3 space-y-0.5">
                {Object.entries(parsedActions).map(([name, action]) => (
                  <div key={name} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                    <div className="h-5 w-5 rounded-full" style={{ background: "var(--border-subtle)" }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold block truncate" style={{ color: "var(--text-muted)" }}>{name}</span>
                      <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{(action.type as string) || "Task"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Detail/Response View */}
            {selectedActionData ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: `${statusColors[selectedActionData.status]}15` }}>
                    <div className="h-3 w-3 rounded-full" style={{ background: statusColors[selectedActionData.status] }} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold" style={{ color: "var(--text-bright)" }}>{selectedActionData.name}</h3>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Type: {selectedActionData.type} — Status: {selectedActionData.status}</p>
                  </div>
                </div>

                {selectedActionData.dependsOn.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Dependencies</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedActionData.dependsOn.map((dep) => {
                        const depAction = actions.find((a) => a.name === dep);
                        return (
                          <button key={dep} onClick={() => setSelectedAction(dep)} className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all hover:opacity-80" style={{ background: depAction ? `${statusColors[depAction.status]}15` : "var(--bg-surface)", color: depAction ? statusColors[depAction.status] : "var(--text-muted)", border: `1px solid ${depAction ? `${statusColors[depAction.status]}30` : "var(--border-subtle)"}` }}>
                            {dep}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedActionData.mockResponse && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                    <div className="px-4 py-2.5" style={{ background: "var(--bg-card)" }}>
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: selectedActionData.status === "failed" ? "var(--error)" : "var(--success)" }}>
                        {selectedActionData.status === "failed" ? "Error Response" : "Mock Response"}
                      </span>
                    </div>
                    <pre className="p-4 text-[11px] font-mono leading-relaxed overflow-auto" style={{ color: "var(--editor-text)", background: "var(--editor-bg)", maxHeight: "250px" }}>
                      {JSON.stringify(selectedActionData.mockResponse, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedActionData.error && (
                  <div className="rounded-xl p-4" style={{ background: "var(--danger-bg)", border: "1px solid rgba(251,113,133,0.15)" }}>
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--error)" }}>Error</span>
                    <p className="text-[12px] mt-1" style={{ color: "var(--error)" }}>{selectedActionData.error}</p>
                  </div>
                )}

                {selectedActionData.startTime && selectedActionData.endTime && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <span className="text-[14px] font-bold block" style={{ color: "var(--text-bright)" }}>{selectedActionData.endTime - selectedActionData.startTime}ms</span>
                      <span className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>Latency</span>
                    </div>
                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <span className="text-[14px] font-bold block" style={{ color: "var(--text-bright)" }}>{selectedActionData.dependsOn.length}</span>
                      <span className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>Dependencies</span>
                    </div>
                    <div className="rounded-xl p-3 text-center" style={{ background: `${statusColors[selectedActionData.status]}10`, border: `1px solid ${statusColors[selectedActionData.status]}20` }}>
                      <span className="text-[14px] font-bold block capitalize" style={{ color: statusColors[selectedActionData.status] }}>{selectedActionData.status}</span>
                      <span className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>Result</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                {actions.length === 0 ? (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
                        <path d="m12 15-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
                      </svg>
                    </div>
                    <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Ready to simulate</p>
                    <p className="text-[12px] text-center max-w-sm" style={{ color: "var(--text-muted)" }}>
                      Run a simulation to test your migrated workflow against mock Azure endpoints. Adjust chaos rate to simulate transient failures.
                    </p>
                  </>
                ) : (
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Select an action to view details</p>
                )}
              </div>
            )}

            {/* Execution Log */}
            {logs.length > 0 && (
              <div className="shrink-0 border-t overflow-hidden" style={{ borderColor: "var(--border-subtle)", maxHeight: "180px" }}>
                <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--bg-card)" }}>
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Execution Log</span>
                  <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{logs.length} entries</span>
                </div>
                <div className="overflow-y-auto px-4 py-2 space-y-0.5" style={{ maxHeight: "140px", background: "var(--editor-bg)" }}>
                  {logs.map((log, i) => (
                    <p key={i} className="text-[10px] font-mono" style={{ color: log.includes("FAILED") ? "var(--error)" : log.includes("SUCCEEDED") ? "var(--success)" : log.includes("RUNNING") ? "var(--accent)" : "var(--text-muted)" }}>
                      {log}
                    </p>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

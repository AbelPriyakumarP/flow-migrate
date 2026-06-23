"use client";

import { useState, useCallback, useMemo } from "react";

interface ReverseMigrationProps {
  isOpen: boolean;
  onClose: () => void;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

export default function ReverseMigration({ isOpen, onClose, outputCode, direction }: ReverseMigrationProps) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [reverseCode, setReverseCode] = useState("");
  const [mappingLog, setMappingLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const handleGenerate = useCallback(() => {
    if (!outputCode) return;
    setGenerating(true);
    setMappingLog([]);

    setTimeout(() => {
      try {
        const parsed = JSON.parse(outputCode);
        const log: string[] = [];
        let result: Record<string, unknown>;

        if (direction === "aws-to-azure") {
          result = reverseAzureToAws(parsed, log);
        } else {
          result = reverseAwsToAzure(parsed, log);
        }

        setReverseCode(JSON.stringify(result, null, 2));
        setMappingLog(log);
        setGenerated(true);
      } catch (err) {
        setMappingLog(["Error: Failed to parse workflow JSON"]);
      }
      setGenerating(false);
    }, 1500);
  }, [outputCode, direction]);

  const handleDownload = useCallback(() => {
    if (!reverseCode) return;
    const blob = new Blob([reverseCode], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = direction === "aws-to-azure" ? "rollback-step-functions.json" : "rollback-logic-apps.json";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }, [reverseCode, direction]);

  const handleCopy = useCallback(() => {
    if (reverseCode) navigator.clipboard.writeText(reverseCode).catch(() => {});
  }, [reverseCode]);

  const actionCount = useMemo(() => {
    try {
      const parsed = JSON.parse(reverseCode || "{}");
      return Object.keys(parsed.States || parsed.actions || {}).length;
    } catch { return 0; }
  }, [reverseCode]);

  const targetLabel = direction === "aws-to-azure" ? "AWS Step Functions (ASL)" : "Azure Logic Apps";
  const sourceLabel = direction === "aws-to-azure" ? "Azure Logic Apps" : "AWS Step Functions";

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="fixed inset-4 sm:inset-8 z-50 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-elevated)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="1,4 1,10 7,10" />
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text-bright)" }}>Reverse Migration Generator</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Generate rollback {targetLabel} definition from {sourceLabel} output
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Info Panel */}
          <div className="w-80 shrink-0 border-r overflow-y-auto p-5 space-y-5" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
            {/* Direction Flow */}
            <div className="space-y-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>Rollback Direction</span>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: direction === "aws-to-azure" ? "var(--azure-bg)" : "var(--aws-bg)", border: `1px solid ${direction === "aws-to-azure" ? "rgba(56,189,248,0.15)" : "rgba(255,153,0,0.15)"}` }}>
                  <div className="h-3 w-3 rounded-full" style={{ background: direction === "aws-to-azure" ? "var(--azure-color)" : "var(--aws-color)" }} />
                  <span className="text-[11px] font-bold" style={{ color: direction === "aws-to-azure" ? "var(--azure-color)" : "var(--aws-color)" }}>{sourceLabel}</span>
                  <span className="text-[9px] ml-auto rounded px-1.5 py-0.5" style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}>Current</span>
                </div>
                <div className="flex justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
                </div>
                <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: direction === "aws-to-azure" ? "var(--aws-bg)" : "var(--azure-bg)", border: `1px solid ${direction === "aws-to-azure" ? "rgba(255,153,0,0.15)" : "rgba(56,189,248,0.15)"}` }}>
                  <div className="h-3 w-3 rounded-full" style={{ background: direction === "aws-to-azure" ? "var(--aws-color)" : "var(--azure-color)" }} />
                  <span className="text-[11px] font-bold" style={{ color: direction === "aws-to-azure" ? "var(--aws-color)" : "var(--azure-color)" }}>{targetLabel}</span>
                  <span className="text-[9px] ml-auto rounded px-1.5 py-0.5" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>Rollback</span>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button onClick={handleGenerate} disabled={!outputCode || generating} className="w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "white" }}>
              {generating ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Generating Rollback...</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg> Generate Rollback</>
              )}
            </button>

            {/* Stats */}
            {generated && (
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>Rollback Stats</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <span className="text-[18px] font-bold block" style={{ color: "var(--text-bright)" }}>{actionCount}</span>
                    <span className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>{direction === "aws-to-azure" ? "States" : "Actions"}</span>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <span className="text-[18px] font-bold block" style={{ color: "var(--text-bright)" }}>{mappingLog.length}</span>
                    <span className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>Mappings</span>
                  </div>
                </div>
              </div>
            )}

            {/* Mapping Log Toggle */}
            {generated && mappingLog.length > 0 && (
              <div>
                <button onClick={() => setShowLog(!showLog)} className="flex items-center gap-2 text-[11px] font-semibold w-full" style={{ color: "var(--accent)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showLog ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
                  {showLog ? "Hide" : "Show"} Mapping Log ({mappingLog.length})
                </button>
                {showLog && (
                  <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                    {mappingLog.map((log, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
                        <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: log.includes("→") ? "var(--success)" : log.includes("Warning") ? "var(--warning)" : "var(--text-muted)" }} />
                        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Warning Banner */}
            {generated && (
              <div className="rounded-xl p-3" style={{ background: "var(--warning-bg)", border: "1px solid rgba(251,191,36,0.15)" }}>
                <div className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                  <div>
                    <p className="text-[10px] font-bold" style={{ color: "var(--warning)" }}>Review Required</p>
                    <p className="text-[9px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      This is a best-effort reverse mapping. Test thoroughly before deploying as a rollback. Some Azure-specific features may not have direct AWS equivalents.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Code */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {generated && reverseCode ? (
              <>
                {/* Code toolbar */}
                <div className="shrink-0 flex items-center justify-between border-b px-5 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-card)" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: direction === "aws-to-azure" ? "var(--aws-color)" : "var(--azure-color)" }} />
                    <span className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>
                      {direction === "aws-to-azure" ? "step-functions-rollback.json" : "logic-apps-rollback.json"}
                    </span>
                    <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                      {(reverseCode.length / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                      Copy
                    </button>
                    <button onClick={handleDownload} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all" style={{ background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                      Download
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-5">
                  <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap" style={{ color: "var(--editor-text)" }}>{reverseCode}</pre>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                </div>
                <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Generate a rollback definition</p>
                <p className="text-[12px] text-center max-w-sm" style={{ color: "var(--text-muted)" }}>
                  Creates a reverse {targetLabel} workflow from your migrated {sourceLabel} output for disaster recovery
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function reverseAzureToAws(parsed: Record<string, unknown>, log: string[]): Record<string, unknown> {
  const actions = (parsed.actions || {}) as Record<string, unknown>;
  const states: Record<string, unknown> = {};
  const actionNames = Object.keys(actions);
  let firstState = "";

  log.push("Starting Azure Logic Apps → AWS Step Functions reverse mapping");

  for (let i = 0; i < actionNames.length; i++) {
    const name = actionNames[i];
    const action = actions[name] as Record<string, unknown>;
    const aType = (action.type as string) || "";
    const stateName = name.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (i === 0) firstState = stateName;

    const stateType = "Task";
    const state: Record<string, unknown> = { Type: stateType };

    if (aType === "If" || aType === "Switch") {
      state.Type = "Choice";
      state.Choices = [{ Variable: `$.${stateName}_result`, StringEquals: "true", Next: actionNames[i + 1]?.replace(/[^a-zA-Z0-9_-]/g, "_") || "End" }];
      state.Default = actionNames[i + 1]?.replace(/[^a-zA-Z0-9_-]/g, "_") || "End";
      log.push(`${aType} '${name}' → Choice state`);
    } else if (aType === "Foreach") {
      state.Type = "Map";
      state.ItemsPath = "$.items";
      state.Iterator = { StartAt: "ProcessItem", States: { ProcessItem: { Type: "Pass", End: true } } };
      log.push(`Foreach '${name}' → Map state`);
    } else if (aType === "Wait" || aType === "Delay") {
      state.Type = "Wait";
      state.Seconds = 60;
      log.push(`Wait '${name}' → Wait state (60s default)`);
    } else if (aType === "Terminate") {
      state.Type = "Fail";
      state.Error = "WorkflowTerminated";
      state.Cause = `Terminated at action ${name}`;
      log.push(`Terminate '${name}' → Fail state`);
    } else if (aType === "Function") {
      state.Type = "Task";
      state.Resource = "arn:aws:lambda:REGION:ACCOUNT:function:REPLACE_FUNCTION_NAME";
      log.push(`Function '${name}' → Lambda Task (requires ARN)`);
    } else if (aType === "Http" || aType === "HTTP") {
      state.Type = "Task";
      state.Resource = "arn:aws:states:::http:invoke";
      const inputs = action.inputs as Record<string, unknown> | undefined;
      state.Parameters = {
        ApiEndpoint: inputs?.uri || "https://REPLACE",
        Method: inputs?.method || "GET",
        Authentication: { ConnectionArn: "arn:aws:events:REGION:ACCOUNT:connection/REPLACE" },
      };
      log.push(`HTTP '${name}' → HTTP Task (needs connection ARN)`);
    } else if (aType === "Scope") {
      state.Type = "Parallel";
      state.Branches = [{ StartAt: "ScopeEntry", States: { ScopeEntry: { Type: "Pass", End: true } } }];
      log.push(`Scope '${name}' → Parallel state`);
    } else if (aType === "Until") {
      state.Type = "Wait";
      state.Seconds = 60;
      log.push(`Until '${name}' → Wait state (polling approximation)`);
    } else {
      state.Type = "Task";
      state.Resource = `arn:aws:states:::REPLACE_SERVICE:${name}`;
      log.push(`${aType} '${name}' → Task state (needs service ARN)`);
    }

    if (action.inputs && (action.inputs as Record<string, unknown>).retryPolicy) {
      const rp = (action.inputs as Record<string, unknown>).retryPolicy as Record<string, unknown>;
      state.Retry = [{ ErrorEquals: ["States.ALL"], MaxAttempts: rp.count || 3, IntervalSeconds: 30, BackoffRate: 2.0 }];
      log.push(`  Retry policy mapped for '${name}'`);
    }

    if (i < actionNames.length - 1) {
      if (state.Type !== "Choice") {
        state.Next = actionNames[i + 1].replace(/[^a-zA-Z0-9_-]/g, "_");
      }
    } else {
      if (state.Type !== "Choice" && state.Type !== "Fail") {
        state.End = true;
      }
    }

    states[stateName] = state;
  }

  log.push(`Reverse mapping complete: ${Object.keys(states).length} states generated`);

  return {
    Comment: `Rollback: Reverse-generated from Azure Logic Apps (${new Date().toISOString()})`,
    StartAt: firstState || "Start",
    States: states,
  };
}

function reverseAwsToAzure(parsed: Record<string, unknown>, log: string[]): Record<string, unknown> {
  const states = (parsed.States || {}) as Record<string, unknown>;
  const actions: Record<string, unknown> = {};

  log.push("Starting AWS Step Functions → Azure Logic Apps reverse mapping");

  const stateNames = Object.keys(states);
  let prevName = "";

  for (const name of stateNames) {
    const state = states[name] as Record<string, unknown>;
    const sType = (state.Type as string) || "";
    const action: Record<string, unknown> = { type: "Http" };

    if (sType === "Choice") {
      action.type = "If";
      action.expression = { and: [{ equals: ["@variables('result')", "true"] }] };
      action.actions = {};
      action.else = { actions: {} };
      log.push(`Choice '${name}' → If action`);
    } else if (sType === "Map") {
      action.type = "Foreach";
      action.foreach = "@body('previous')";
      action.actions = {};
      log.push(`Map '${name}' → Foreach action`);
    } else if (sType === "Wait") {
      action.type = "Wait";
      action.inputs = { interval: { count: (state.Seconds as number) || 60, unit: "Second" } };
      log.push(`Wait '${name}' → Delay action`);
    } else if (sType === "Fail") {
      action.type = "Terminate";
      action.inputs = { runStatus: "Failed", runError: { code: state.Error || "Error", message: state.Cause || "Workflow failed" } };
      log.push(`Fail '${name}' → Terminate action`);
    } else if (sType === "Parallel") {
      action.type = "Scope";
      action.actions = {};
      log.push(`Parallel '${name}' → Scope action`);
    } else if (sType === "Pass") {
      action.type = "Compose";
      action.inputs = state.Result || {};
      log.push(`Pass '${name}' → Compose action`);
    } else {
      action.type = "Http";
      const resource = (state.Resource as string) || "";
      if (resource.includes("lambda")) {
        action.type = "Function";
        action.inputs = { function: { id: "/subscriptions/REPLACE/resourceGroups/REPLACE/providers/Microsoft.Web/sites/REPLACE/functions/REPLACE" } };
        log.push(`Lambda Task '${name}' → Function action (needs resource ID)`);
      } else {
        action.inputs = { method: "POST", uri: "https://REPLACE_ENDPOINT", body: state.Parameters || {} };
        log.push(`Task '${name}' → HTTP action (needs endpoint)`);
      }
    }

    if (prevName) {
      action.runAfter = { [prevName]: ["Succeeded"] };
    }

    if (state.Retry) {
      const retries = state.Retry as Record<string, unknown>[];
      if (retries[0]) {
        const inputs = (action.inputs || {}) as Record<string, unknown>;
        inputs.retryPolicy = { type: "exponential", count: retries[0].MaxAttempts || 3, interval: "PT30S" };
        action.inputs = inputs;
        log.push(`  Retry policy mapped for '${name}'`);
      }
    }

    actions[name] = action;
    prevName = name;
  }

  log.push(`Reverse mapping complete: ${Object.keys(actions).length} actions generated`);

  return {
    definition: {
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } },
      },
      actions,
    },
  };
}

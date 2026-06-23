"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

interface ReplayStep {
  category: string;
  description: string;
  changes: string[];
  beforeSnippet: string;
  afterSnippet: string;
  timestamp: number;
}

interface MigrationReplayProps {
  isOpen: boolean;
  onClose: () => void;
  migrationLog: string[];
  sourceCode: string;
  outputCode: string;
}

export default function MigrationReplay({ isOpen, onClose, migrationLog, sourceCode, outputCode }: MigrationReplayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [expandedDiff, setExpandedDiff] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const steps: ReplayStep[] = useMemo(() => {
    const catRegex = /^(CAT-\d+):\s*(.+)/;
    const grouped: Record<string, string[]> = {};
    const catOrder: string[] = [];

    for (const log of migrationLog) {
      const match = log.match(catRegex);
      if (match) {
        const cat = match[1];
        const desc = match[2];
        if (!grouped[cat]) {
          grouped[cat] = [];
          catOrder.push(cat);
        }
        grouped[cat].push(desc);
      }
    }

    return catOrder.map((cat, idx) => {
      const changes = grouped[cat];
      const catNum = parseInt(cat.replace("CAT-", ""));
      const description = getCategoryLabel(catNum);

      let beforeSnippet = "";
      let afterSnippet = "";

      if (changes.length > 0) {
        const firstChange = changes[0];
        if (firstChange.includes("→")) {
          const parts = firstChange.split("→");
          beforeSnippet = parts[0].trim().substring(0, 120);
          afterSnippet = parts[1].trim().substring(0, 120);
        } else {
          beforeSnippet = "Original workflow state";
          afterSnippet = firstChange.substring(0, 120);
        }
      }

      return {
        category: cat,
        description,
        changes,
        beforeSnippet,
        afterSnippet,
        timestamp: idx * 100,
      };
    });
  }, [migrationLog]);

  const totalSteps = steps.length;

  useEffect(() => {
    if (isPlaying && currentStep < totalSteps - 1) {
      intervalRef.current = setTimeout(() => {
        setCurrentStep((s) => s + 1);
      }, 1800 / playbackSpeed);
    } else if (currentStep >= totalSteps - 1) {
      setIsPlaying(false);
    }
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current); };
  }, [isPlaying, currentStep, totalSteps, playbackSpeed]);

  useEffect(() => {
    if (!isOpen) { setCurrentStep(0); setIsPlaying(false); }
  }, [isOpen]);

  useEffect(() => {
    if (timelineRef.current && steps.length > 0) {
      const activeEl = timelineRef.current.querySelector(`[data-step="${currentStep}"]`);
      if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentStep, steps.length]);

  const handlePlay = useCallback(() => {
    if (currentStep >= totalSteps - 1) setCurrentStep(0);
    setIsPlaying(true);
  }, [currentStep, totalSteps]);

  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleReset = useCallback(() => { setIsPlaying(false); setCurrentStep(0); }, []);

  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const currentStepData = steps[currentStep];

  const getCategoryColor = (catNum: number): string => {
    if (catNum <= 15) return "#6366f1";
    if (catNum <= 30) return "#0ea5e9";
    if (catNum <= 40) return "#8b5cf6";
    return "#22d3ee";
  };

  const getCategoryPhase = (catNum: number): string => {
    if (catNum <= 15) return "Foundation";
    if (catNum <= 30) return "Enhancement";
    if (catNum <= 40) return "Enterprise";
    return "Security & Ops";
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="fixed inset-4 sm:inset-8 z-50 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-elevated)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--accent-gradient)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text-bright)" }}>Migration Replay</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {totalSteps} transformation{totalSteps !== 1 ? "s" : ""} applied — Step {currentStep + 1} of {totalSteps}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Speed Control */}
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
              {[0.5, 1, 2].map((speed) => (
                <button key={speed} onClick={() => setPlaybackSpeed(speed)} className="px-3 py-1.5 text-[10px] font-bold transition-all" style={{ background: playbackSpeed === speed ? "var(--accent-bg)" : "transparent", color: playbackSpeed === speed ? "var(--accent)" : "var(--text-muted)", borderRight: speed !== 2 ? "1px solid var(--border-subtle)" : "none" }}>
                  {speed}x
                </button>
              ))}
            </div>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="shrink-0 h-1" style={{ background: "var(--border-subtle)" }}>
          <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: "var(--accent-gradient)" }} />
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Timeline Sidebar */}
          <div ref={timelineRef} className="w-72 shrink-0 border-r overflow-y-auto" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
            <div className="p-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-2" style={{ color: "var(--text-muted)" }}>Timeline</span>
            </div>
            <div className="px-2 pb-4 space-y-0.5">
              {steps.map((step, idx) => {
                const catNum = parseInt(step.category.replace("CAT-", ""));
                const color = getCategoryColor(catNum);
                const isActive = idx === currentStep;
                const isPast = idx < currentStep;

                return (
                  <button key={idx} data-step={idx} onClick={() => { setCurrentStep(idx); setIsPlaying(false); }} className="w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all" style={{ background: isActive ? "var(--accent-bg)" : "transparent", border: isActive ? "1px solid var(--border-primary)" : "1px solid transparent" }}>
                    <div className="mt-0.5 relative">
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: isPast || isActive ? color : "var(--bg-card)", color: isPast || isActive ? "white" : "var(--text-muted)", border: `1.5px solid ${isPast || isActive ? color : "var(--border-subtle)"}` }}>
                        {isPast ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>
                        ) : (
                          <span>{catNum}</span>
                        )}
                      </div>
                      {idx < steps.length - 1 && (
                        <div className="absolute top-7 left-1/2 -translate-x-1/2 w-px h-4" style={{ background: isPast ? color : "var(--border-subtle)" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold block truncate" style={{ color: isActive ? "var(--text-bright)" : isPast ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {step.category}
                      </span>
                      <span className="text-[9px] block truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {step.description}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold shrink-0 rounded-full px-1.5 py-0.5 mt-0.5" style={{ background: `${color}15`, color }}>
                      {step.changes.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail View */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentStepData ? (
              <>
                {/* Step Header */}
                <div className="shrink-0 px-6 py-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: `${getCategoryColor(parseInt(currentStepData.category.replace("CAT-", "")))}20`, color: getCategoryColor(parseInt(currentStepData.category.replace("CAT-", ""))) }}>
                        {getCategoryPhase(parseInt(currentStepData.category.replace("CAT-", "")))}
                      </span>
                      <span className="text-[20px] font-bold" style={{ color: "var(--text-bright)" }}>{currentStepData.category}</span>
                    </div>
                  </div>
                  <h3 className="text-[14px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{currentStepData.description}</h3>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    {currentStepData.changes.length} change{currentStepData.changes.length !== 1 ? "s" : ""} applied in this step
                  </p>
                </div>

                {/* Changes List */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-2">
                    {currentStepData.changes.map((change, i) => {
                      const hasArrow = change.includes("→");
                      return (
                        <div key={i} className="rounded-xl p-4 transition-all animate-fadeIn" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", animationDelay: `${i * 60}ms` }}>
                          <div className="flex items-start gap-3">
                            <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: "var(--success-bg)" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              {hasArrow ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(251,113,133,0.08)", color: "var(--error)", textDecoration: "line-through" }}>
                                      {change.split("→")[0].trim().substring(0, 80)}
                                    </span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                                      {change.split("→")[1].trim().substring(0, 80)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{change}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Before/After Diff Preview */}
                  {(currentStepData.beforeSnippet || currentStepData.afterSnippet) && (
                    <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                      <button onClick={() => setExpandedDiff(!expandedDiff)} className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[var(--hover-bg)]" style={{ background: "var(--bg-card)" }}>
                        <span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>Transformation Summary</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transform: expandedDiff ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                      {expandedDiff && (
                        <div className="grid grid-cols-2 gap-px" style={{ background: "var(--border-subtle)" }}>
                          <div className="p-4" style={{ background: "var(--bg-primary)" }}>
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--error)" }}>Before</span>
                            <p className="text-[11px] font-mono mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{currentStepData.beforeSnippet || "—"}</p>
                          </div>
                          <div className="p-4" style={{ background: "var(--bg-primary)" }}>
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--success)" }}>After</span>
                            <p className="text-[11px] font-mono mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{currentStepData.afterSnippet || "—"}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-muted)" }}>No migration data to replay</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>Run a migration first to see the replay</p>
              </div>
            )}
          </div>
        </div>

        {/* Playback Controls */}
        <div className="shrink-0 flex items-center justify-between border-t px-6 py-3" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }} title="Reset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
            </button>
            <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-30" style={{ color: "var(--text-muted)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" x2="5" y1="19" y2="5" /></svg>
            </button>

            {isPlaying ? (
              <button onClick={handlePause} className="flex h-10 w-10 items-center justify-center rounded-xl transition-all" style={{ background: "var(--accent-gradient)", color: "white" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              </button>
            ) : (
              <button onClick={handlePlay} disabled={totalSteps === 0} className="flex h-10 w-10 items-center justify-center rounded-xl transition-all disabled:opacity-30" style={{ background: "var(--accent-gradient)", color: "white" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              </button>
            )}

            <button onClick={() => setCurrentStep(Math.min(totalSteps - 1, currentStep + 1))} disabled={currentStep >= totalSteps - 1} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-30" style={{ color: "var(--text-muted)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" x2="19" y1="5" y2="19" /></svg>
            </button>
          </div>

          {/* Step Dots */}
          <div className="flex items-center gap-1 max-w-[50%] overflow-hidden">
            {steps.map((_, idx) => {
              const catNum = parseInt(steps[idx].category.replace("CAT-", ""));
              return (
                <button key={idx} onClick={() => { setCurrentStep(idx); setIsPlaying(false); }} className="h-2 rounded-full transition-all" style={{ width: idx === currentStep ? "16px" : "6px", background: idx <= currentStep ? getCategoryColor(catNum) : "var(--border-subtle)" }} />
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
              {String(currentStep + 1).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
            </span>
            <div className="h-4 w-px" style={{ background: "var(--border-subtle)" }} />
            <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </>
  );
}

function getCategoryLabel(catNum: number): string {
  const labels: Record<number, string> = {
    1: "ASL → Logic Apps structure conversion",
    2: "State type → Action type mapping",
    3: "Event-based trigger conversion",
    4: "Retry policy normalization",
    5: "Error handler → runAfter mapping",
    6: "Parallel/Map state → Foreach/Parallel",
    7: "Wait/Timer state conversion",
    8: "Choice state → Switch/If actions",
    9: "Input/Output processing → compose/parse",
    10: "ARN → Azure Resource ID mapping",
    11: "IAM Role → Managed Identity",
    12: "S3 URI → ADLS Gen2 path",
    13: "Foreach concurrency configuration",
    14: "CloudFront URL → Azure CDN",
    15: "DynamoDB → Cosmos DB references",
    16: "SQS → Service Bus queue mapping",
    17: "SNS → Event Grid topic mapping",
    18: "Lambda → Azure Function conversion",
    19: "ECS/Fargate → Container Instance",
    20: "Kinesis → Event Hub mapping",
    21: "Glue → Data Factory pipeline",
    22: "SageMaker → Azure ML mapping",
    23: "Step Functions API → Logic Apps API",
    24: "CloudWatch → Azure Monitor",
    25: "Secrets Manager → Key Vault",
    26: "EventBridge → Event Grid rules",
    27: "CodeBuild → DevOps Pipeline",
    28: "Athena → Synapse Analytics",
    29: "Redshift → Synapse SQL Pool",
    30: "EMR → HDInsight/Databricks",
    31: "Silver/Gold → Databricks Workflow + polling",
    32: "Dynamic parameter injection",
    33: "QuickSight → Power BI refresh",
    34: "AWS → Azure operational terminology",
    35: "AWS service endpoint migration",
    36: "Managed Identity token injection",
    37: "Service Bus dead-letter handling",
    38: "GlueCatalog/S3FileIO → ADLS/Delta",
    39: "AWS CLI → Azure CLI mapping",
    40: "Console URL → Azure Portal mapping",
    41: "Retry & dead-letter policies",
    42: "Azure Monitor integration",
    43: "Power BI Function-based refresh",
    44: "Run correlation injection",
    45: "Conditional execution (Scope pattern)",
    46: "Pre-deployment ARM validation",
    47: "Rollback plan generation",
    48: "Security hardening (RBAC, Key Vault, VNet)",
  };
  return labels[catNum] || `Category ${catNum} transformation`;
}

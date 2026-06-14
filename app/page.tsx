"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Header from "@/components/header";
import CodeEditor from "@/components/code-editor";
import MigrationLog from "@/components/migration-log";
import PlatformSelector from "@/components/platform-selector";
import { detectPlatform, type DetectionResult, type Platform } from "@/lib/detect-platform";
import { AWS_SAMPLE, AZURE_SAMPLE } from "@/lib/samples";
import type { ValidationIssue } from "@/lib/validator";
import type { ComparisonResult } from "@/lib/comparison";
import { processCorrections } from "@/lib/corrections";
import WorkflowGraphView from "@/components/workflow-graph-view";
import CorrectionsPanel from "@/components/corrections-panel";
import { useCorrections } from "@/hooks/useCorrections";
import AiAssistant from "@/components/ai-assistant";
import SmartUploadModal from "@/components/smart-upload-modal";
import { useKeyboardShortcuts, type ShortcutConfig } from "@/hooks/useKeyboardShortcuts";
import KeyboardShortcutsModal from "@/components/keyboard-shortcuts-modal";
import { useVersionHistory, type MigrationSnapshot } from "@/hooks/useVersionHistory";
import VersionHistoryPanel from "@/components/version-history-panel";
import DiffViewer from "@/components/diff-viewer";
import BatchMigrationModal from "@/components/batch-migration-modal";
import IaCExportModal from "@/components/iac-export-modal";
import StepMappingSummary from "@/components/step-mapping-summary";

type ActiveModule = "code" | "workflow" | "manual" | "errors";

export default function Home() {
  const [sourceCode, setSourceCode] = useState("");
  const [outputCode, setOutputCode] = useState("");
  const [originalAiOutput, setOriginalAiOutput] = useState("");
  const [target, setTarget] = useState<Platform>("azure-logic-apps");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [migrationDirection, setMigrationDirection] = useState<"aws-to-azure" | "azure-to-aws">("aws-to-azure");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasUserEdits, setHasUserEdits] = useState(false);
  const [isSubmittingCorrections, setIsSubmittingCorrections] = useState(false);
  const [correctionsFeedback, setCorrectionsFeedback] = useState("");
  const [showSmartUpload, setShowSmartUpload] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [showIaCExport, setShowIaCExport] = useState(false);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>("code");
  const [apiLatency, setApiLatency] = useState<number | null>(null);

  const { corrections, correctionCount, activeCount, addCorrections, removeCorrection, clearCorrections, getPromptBlock } = useCorrections();
  const { snapshots, isLoading: versionsLoading, saveSnapshot, removeSnapshot, clearAll: clearAllSnapshots } = useVersionHistory();

  useEffect(() => {
    if (sourceCode.trim()) {
      const result = detectPlatform(sourceCode);
      setDetection(result);
      if (result.platform === "aws-step-functions") setTarget("azure-logic-apps");
      else if (result.platform === "azure-logic-apps") setTarget("aws-step-functions");
    } else {
      setDetection(null);
    }
  }, [sourceCode]);

  const handleMigrate = useCallback(async () => {
    if (!sourceCode.trim()) return;
    setIsLoading(true); setError(""); setLogs([]); setOutputCode(""); setOriginalAiOutput("");
    setValidationIssues([]); setComparison(null); setHasUserEdits(false); setCorrectionsFeedback("");
    const startTime = Date.now();

    try {
      const correctionsPrompt = getPromptBlock(migrationDirection);
      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode, targetPlatform: target, corrections: correctionsPrompt || null }),
      });
      setApiLatency(Date.now() - startTime);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Migration failed"); return; }
      const dir = data.direction || migrationDirection;
      setOutputCode(data.outputCode); setOriginalAiOutput(data.outputCode); setLogs(data.migrationLog || []);
      setValidationIssues(data.validationIssues || []); setComparison(data.comparison || null); setMigrationDirection(data.direction || "aws-to-azure");
      if (correctionsPrompt) setLogs((prev) => [...prev, `${activeCount(data.direction || migrationDirection)} learned correction(s) applied`]);
      saveSnapshot({ direction: dir, sourceCode, outputCode: data.outputCode, migrationLog: data.migrationLog || [], validationIssues: data.validationIssues || [] });
    } catch (err) { setError(err instanceof Error ? err.message : "Network error"); } finally { setIsLoading(false); }
  }, [sourceCode, target, getPromptBlock, migrationDirection, activeCount, saveSnapshot]);

  const handleOutputChange = useCallback((val: string) => { setOutputCode(val); setHasUserEdits(val !== originalAiOutput && originalAiOutput !== ""); }, [originalAiOutput]);

  const handleSubmitCorrections = useCallback(() => {
    if (!hasUserEdits || !originalAiOutput || !outputCode) return;
    setIsSubmittingCorrections(true);
    try {
      const incoming = processCorrections(originalAiOutput, outputCode, migrationDirection);
      if (incoming.length > 0) { addCorrections(incoming); setOriginalAiOutput(outputCode); setHasUserEdits(false); setCorrectionsFeedback(`${incoming.length} correction${incoming.length !== 1 ? "s" : ""} learned!`); }
      else { setCorrectionsFeedback("No meaningful differences detected"); }
      setTimeout(() => setCorrectionsFeedback(""), 3000);
    } catch { setCorrectionsFeedback("Failed to process corrections"); setTimeout(() => setCorrectionsFeedback(""), 3000); }
    finally { setIsSubmittingCorrections(false); }
  }, [hasUserEdits, originalAiOutput, outputCode, migrationDirection, addCorrections]);

  const loadSample = useCallback((type: "aws" | "azure") => {
    setSourceCode(type === "aws" ? AWS_SAMPLE : AZURE_SAMPLE);
    setOutputCode(""); setOriginalAiOutput(""); setLogs([]); setError(""); setValidationIssues([]); setHasUserEdits(false); setCorrectionsFeedback("");
  }, []);

  const handleClear = useCallback(() => {
    setSourceCode(""); setOutputCode(""); setOriginalAiOutput(""); setLogs([]); setError(""); setDetection(null);
    setValidationIssues([]); setComparison(null); setHasUserEdits(false); setCorrectionsFeedback("");
  }, []);

  const handleLoadSnapshot = useCallback((snap: MigrationSnapshot) => {
    setSourceCode(snap.sourceCode); setOutputCode(snap.outputCode); setOriginalAiOutput(snap.outputCode);
    setLogs(snap.migrationLog); setValidationIssues(snap.validationIssues); setMigrationDirection(snap.direction);
    setHasUserEdits(false); setCorrectionsFeedback(""); setError(""); setComparison(null);
  }, []);

  const handleSmartUploadGenerated = useCallback((code: string) => {
    setSourceCode(code); setOutputCode(""); setOriginalAiOutput(""); setLogs([]); setError("");
    setValidationIssues([]); setComparison(null); setHasUserEdits(false); setCorrectionsFeedback(""); setShowSmartUpload(false);
  }, []);

  const handleBatchLoadResult = useCallback((outputCode: string, sourceCode: string, direction: "aws-to-azure" | "azure-to-aws") => {
    setSourceCode(sourceCode); setOutputCode(outputCode); setOriginalAiOutput(outputCode); setMigrationDirection(direction);
    setLogs(["Loaded from batch migration results"]); setHasUserEdits(false); setError(""); setComparison(null); setValidationIssues([]);
  }, []);

  const canMigrate = detection !== null && detection.platform !== "unknown" && detection.platform !== target && !isLoading;
  const activeCorrectionCount = activeCount(migrationDirection);

  const handleDownloadOutput = useCallback(() => {
    if (!outputCode) return;
    try {
      const blob = new Blob([outputCode], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = migrationDirection === "azure-to-aws" ? "step-functions-definition.json" : "logic-app-definition.json";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    } catch {
      const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(outputCode);
      window.open(dataUri, "_blank");
    }
  }, [outputCode, migrationDirection]);

  const shortcutsConfig: ShortcutConfig[] = useMemo(() => [
    { key: "enter", metaOrCtrl: true, label: "Migrate Workflow", description: "Run migration on the source workflow", action: () => { if (canMigrate) handleMigrate(); }, enabled: canMigrate },
    { key: "s", metaOrCtrl: true, label: "Download Output", description: "Download the migrated output as JSON", action: handleDownloadOutput, enabled: !!outputCode },
    { key: "c", metaOrCtrl: true, shift: true, label: "Clear Workspace", description: "Clear all editors and reset state", action: handleClear },
    { key: "?", label: "Keyboard Shortcuts", description: "Show this shortcuts panel", action: () => setShowShortcuts((v) => !v) },
    { key: "1", metaOrCtrl: true, label: "Code Editor", description: "Switch to Code module", action: () => setActiveModule("code") },
    { key: "2", metaOrCtrl: true, label: "Workflow Graph", description: "Switch to Workflow module", action: () => setActiveModule("workflow") },
    { key: "3", metaOrCtrl: true, label: "Manual Actions", description: "Switch to Manual Solutions module", action: () => setActiveModule("manual") },
    { key: "4", metaOrCtrl: true, label: "Error Log", description: "Switch to Error Log module", action: () => setActiveModule("errors") },
  ], [canMigrate, handleMigrate, handleDownloadOutput, handleClear, outputCode]);

  const { shortcutList } = useKeyboardShortcuts(shortcutsConfig);

  const errorCount = validationIssues.filter((i) => i.severity === "error").length;
  const warningCount = validationIssues.filter((i) => i.severity === "warning").length;
  const totalIssues = errorCount + warningCount;
  const manualTodos = logs.filter((l) => l.includes("TODO") || l.includes("MANUAL") || l.includes("GAP_NOTICE") || l.includes("REPLACE") || l.includes("PENDING") || l.includes("⚠")).length;

  const sidebarNav: Array<{ id: ActiveModule; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: "code", label: "Workflows",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
    },
    {
      id: "workflow", label: "Resources",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="5" r="3" /><line x1="12" y1="8" x2="12" y2="14" /><circle cx="6" cy="19" r="3" /><circle cx="18" cy="19" r="3" /><line x1="12" y1="14" x2="6" y2="16" /><line x1="12" y1="14" x2="18" y2="16" /></svg>,
    },
    {
      id: "manual", label: "Manual Fixes",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
      badge: manualTodos > 0 ? manualTodos : undefined,
    },
    {
      id: "errors", label: "Migration Log",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>,
      badge: totalIssues > 0 ? totalIssues : undefined,
    },
  ];

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="grid-background" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <Header onShowShortcuts={() => setShowShortcuts(true)} onShowLog={() => setShowLogDrawer(true)} logCount={logs.length} isLoading={isLoading} />

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* ─── Sidebar ─────────────────────────────────────────────── */}
        <aside
          className="hidden md:flex w-[var(--sidebar-width)] flex-col border-r shrink-0"
          style={{ borderColor: "var(--border-subtle)", background: "var(--sidebar-bg)", backdropFilter: "blur(20px)" }}
        >
          {/* Logo */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-gradient)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
              </div>
              <div>
                <span className="text-[13px] font-bold tracking-tight" style={{ color: "var(--text-bright)" }}>Migration Studio</span>
                <p className="text-[9px] mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>v3.2 — Enterprise</p>
              </div>
            </div>
          </div>

          {/* Section label */}
          <div className="px-5 mt-3 mb-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>Modules</span>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5 px-3">
            {sidebarNav.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveModule(item.id)}
                  className={`sidebar-nav-item group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${isActive ? "active" : ""}`}
                >
                  <div className={`transition-colors ${isActive ? "text-[var(--accent-hover)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`}>
                    {item.icon}
                  </div>
                  <span className={`text-[12px] font-semibold ${isActive ? "text-[var(--text-bright)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`}>
                    {item.label}
                  </span>
                  {item.badge && item.badge > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[9px] font-bold text-white" style={{ background: item.id === "errors" && errorCount > 0 ? "var(--error)" : "var(--warning)" }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex-1" />

          {/* Bottom actions */}
          <div className="border-t px-3 py-3 space-y-0.5" style={{ borderColor: "var(--border-subtle)" }}>
            <button
              onClick={() => setShowBatch(true)}
              className="sidebar-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" />
              </svg>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>Batch Mode</span>
            </button>
          </div>
        </aside>

        {/* ─── Main ────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div
            className="flex items-center gap-3 border-b px-4 py-2.5 sm:px-5 shrink-0"
            style={{ borderColor: "var(--border-subtle)", background: "var(--toolbar-bar-bg)", backdropFilter: "blur(12px)" }}
          >
            <PlatformSelector detection={detection} target={target} onTargetChange={setTarget} />

            <div className="ml-auto flex items-center gap-2">
              {/* Sample buttons */}
              <div className="hidden sm:flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                <button onClick={() => loadSample("aws")} className="btn-press flex items-center gap-2 px-3 py-2 text-[11px] font-semibold transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", borderRight: "1px solid var(--border-subtle)" }}>
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--aws-color)" }} /> AWS
                </button>
                <button onClick={() => loadSample("azure")} className="btn-press flex items-center gap-2 px-3 py-2 text-[11px] font-semibold transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)" }}>
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--azure-color)" }} /> Azure
                </button>
              </div>

              <VersionHistoryPanel snapshots={snapshots} isLoading={versionsLoading} onLoad={handleLoadSnapshot} onDelete={removeSnapshot} onClearAll={clearAllSnapshots} />
              <CorrectionsPanel corrections={corrections} onClear={clearCorrections} onRemove={removeCorrection} direction={migrationDirection} />

              {/* Execute button */}
              <button
                onClick={handleMigrate}
                disabled={!canMigrate}
                className={`btn-execute btn-press flex items-center gap-2 rounded-xl px-5 py-2.5 text-[12px] font-bold tracking-wide transition-all ${canMigrate ? "" : "opacity-40 cursor-not-allowed"}`}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Migrating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                    Migrate
                  </>
                )}
              </button>

              <button onClick={handleClear} className="btn-press flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }} title="Clear workspace">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
              </button>
            </div>
          </div>

          {/* Active corrections indicator */}
          {activeCorrectionCount > 0 && (
            <div className="flex items-center gap-2 border-b px-5 py-1.5 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--accent-bg)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>{activeCorrectionCount} correction{activeCorrectionCount !== 1 ? "s" : ""} active</span>
            </div>
          )}

          {/* ── Content Area ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto">
            {/* Code Editor Module */}
            {activeModule === "code" && (
              <div className="flex flex-col gap-4 p-4 sm:p-5 animate-fadeIn h-full">
                <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2 min-h-0" style={{ height: "calc(100vh - 200px)" }}>
                  <CodeEditor
                    value={sourceCode} onChange={setSourceCode} label="Source Workflow" onSmartUpload={() => setShowSmartUpload(true)}
                    badge={detection && detection.platform !== "unknown" ? { text: detection.platform === "aws-step-functions" ? "ASL" : "Logic Apps", variant: detection.platform === "aws-step-functions" ? "aws" : "azure" } : undefined}
                  />
                  <CodeEditor
                    value={outputCode} onChange={handleOutputChange} label="Migrated Output" showEditBadge={hasUserEdits} showDownload={!!outputCode}
                    onExportIaC={outputCode ? () => setShowIaCExport(true) : undefined}
                    badge={outputCode ? { text: target === "aws-step-functions" ? "ASL" : "Logic Apps", variant: target === "aws-step-functions" ? "aws" : "azure" } : undefined}
                  />
                </div>

                {/* Export Bar */}
                {outputCode && (
                  <div className="glass-card-static rounded-xl overflow-hidden animate-slideUp">
                    <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--bg-secondary)" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: validationIssues.filter(i => i.severity === "error").length === 0 ? "var(--success-bg)" : "var(--danger-bg)" }}>
                          {validationIssues.filter(i => i.severity === "error").length === 0 ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12" /></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" /></svg>
                          )}
                        </div>
                        <div>
                          <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
                            {validationIssues.filter(i => i.severity === "error").length === 0 ? "Deploy Ready" : `${validationIssues.filter(i => i.severity === "error").length} Error${validationIssues.filter(i => i.severity === "error").length > 1 ? "s" : ""} — Fix Before Deploy`}
                          </span>
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {migrationDirection === "azure-to-aws" ? "AWS Step Functions ASL" : "Azure Logic Apps"} — {(() => { try { return Object.keys(JSON.parse(outputCode).States || JSON.parse(outputCode).actions || {}).length; } catch { return 0; } })()} {migrationDirection === "azure-to-aws" ? "states" : "actions"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(outputCode).catch(() => {});
                          }}
                          className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all hover:bg-[var(--hover-bg)]"
                          style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                          Copy JSON
                        </button>
                        <button
                          onClick={handleDownloadOutput}
                          className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all hover:bg-[var(--hover-bg)]"
                          style={{ color: "var(--accent)", border: "1px solid var(--border-primary)" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                          Download
                        </button>
                        {outputCode && (
                          <button
                            onClick={() => setShowIaCExport(true)}
                            className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all hover:bg-[var(--hover-bg)]"
                            style={{ color: "var(--success)", border: "1px solid rgba(34,211,238,0.2)" }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 14a1 1 0 01-.78-1.63l9.9-10.2a.5.5 0 01.86.46l-1.92 6.02A1 1 0 0013 10h7a1 1 0 01.78 1.63l-9.9 10.2a.5.5 0 01-.86-.46l1.92-6.02A1 1 0 0011 14z" /></svg>
                            Export IaC
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step Mapping Summary */}
                {outputCode && <StepMappingSummary outputCode={outputCode} direction={migrationDirection} />}

                {/* Corrections bar */}
                {hasUserEdits && (
                  <div className="glass-card-static flex items-center justify-between gap-3 px-5 py-3 animate-slideUp">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--warning-bg)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                      </div>
                      <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Output edited — submit corrections to improve future migrations</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {correctionsFeedback && <span className="text-[11px] font-bold animate-fadeIn" style={{ color: "var(--success)" }}>{correctionsFeedback}</span>}
                      <button onClick={handleSubmitCorrections} disabled={isSubmittingCorrections} className="btn-press rounded-lg px-4 py-2 text-[11px] font-bold text-black shadow-md transition-all hover:shadow-lg disabled:opacity-50" style={{ background: "var(--warning)" }}>
                        {isSubmittingCorrections ? "Learning..." : "Submit"}
                      </button>
                    </div>
                  </div>
                )}
                {correctionsFeedback && !hasUserEdits && (
                  <div className="flex items-center justify-center">
                    <span className="rounded-full px-4 py-1.5 text-[12px] font-semibold animate-fadeIn" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{correctionsFeedback}</span>
                  </div>
                )}
                {outputCode && (
                  <div className="flex justify-center">
                    <button onClick={() => setShowDiff(true)} className="btn-press flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18" /><rect x="2" y="3" width="7" height="18" rx="1" /><rect x="15" y="3" width="7" height="18" rx="1" /></svg>
                      View Diff
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Workflow Graph Module */}
            {activeModule === "workflow" && (
              <div className="p-4 sm:p-5 animate-fadeIn h-full">
                {outputCode ? (
                  <WorkflowGraphView sourceCode={sourceCode} outputCode={outputCode} direction={migrationDirection} comparison={comparison} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><circle cx="12" cy="5" r="3" /><line x1="12" y1="8" x2="12" y2="14" /><circle cx="6" cy="19" r="3" /><circle cx="18" cy="19" r="3" /><line x1="12" y1="14" x2="6" y2="16" /><line x1="12" y1="14" x2="18" y2="16" /></svg>
                    </div>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--text-muted)" }}>No workflow to visualize</p>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>Run a migration first to see the resource graph</p>
                  </div>
                )}
              </div>
            )}

            {/* Manual Fixes Module */}
            {activeModule === "manual" && (
              <div className="p-4 sm:p-5 animate-fadeIn space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--warning-bg)", border: "1px solid rgba(251,191,36,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Manual Process Solutions</h2>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Items that require manual configuration</p>
                  </div>
                </div>

                {(() => {
                  const todoItems = logs.filter((l) => l.includes("TODO") || l.includes("MANUAL") || l.includes("GAP_NOTICE") || l.includes("REPLACE") || l.includes("PENDING") || l.includes("SCHEDULE_PENDING") || l.includes("MIGRATED_FROM") || l.includes("RENAMED_FROM") || l.includes("⚠"));
                  if (todoItems.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--success-bg)", border: "1px solid rgba(34,211,238,0.15)" }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12" /></svg>
                        </div>
                        <p className="text-[14px] font-semibold" style={{ color: "var(--success)" }}>All clear</p>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{outputCode ? "No manual actions required" : "Run a migration to check for action items"}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {todoItems.map((item, i) => {
                        const isGap = item.includes("GAP_NOTICE");
                        const isPending = item.includes("PENDING") || item.includes("SCHEDULE");
                        const isReplace = item.includes("REPLACE");
                        const variant = isGap ? "error" : isPending ? "warning" : isReplace ? "info" : "warning";
                        const colors = {
                          error: { bg: "rgba(251,113,133,0.06)", border: "rgba(251,113,133,0.15)", text: "#fb7185", badge: "rgba(251,113,133,0.12)" },
                          warning: { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.15)", text: "#fbbf24", badge: "rgba(251,191,36,0.12)" },
                          info: { bg: "rgba(56,189,248,0.06)", border: "rgba(56,189,248,0.15)", text: "#38bdf8", badge: "rgba(56,189,248,0.12)" },
                        };
                        const c = colors[variant];
                        return (
                          <div key={i} className="flex items-start gap-3 rounded-xl p-4" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: c.badge }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.text} strokeWidth="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                            </div>
                            <p className="flex-1 text-[13px] font-medium" style={{ color: c.text }}>{item}</p>
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: c.badge, color: c.text }}>
                              {isGap ? "Gap" : isPending ? "Pending" : "Action"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Migration Log Module */}
            {activeModule === "errors" && (
              <div className="p-4 sm:p-5 animate-fadeIn space-y-4 overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
                {/* Validation Section */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: errorCount > 0 ? "var(--danger-bg)" : "var(--success-bg)", border: `1px solid ${errorCount > 0 ? "rgba(251,113,133,0.15)" : "rgba(34,211,238,0.15)"}` }}>
                    {errorCount > 0 ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12" /></svg>
                    )}
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Schema Validation {totalIssues > 0 ? `(${totalIssues})` : ""}</h2>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""} must be fixed`
                        : warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? "s" : ""} to review`
                        : outputCode ? "No validation issues" : "Run a migration to validate"}
                    </p>
                  </div>
                </div>

                {validationIssues.filter((i) => i.severity === "error").map((issue, i) => (
                  <div key={`e-${i}`} className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--danger-bg)", border: "1px solid rgba(251,113,133,0.15)" }}>
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,113,133,0.12)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" /></svg>
                    </div>
                    <div className="flex-1"><p className="text-[13px] font-medium" style={{ color: "var(--error)" }}>{issue.message}</p>{issue.path && <p className="mt-1 text-[11px] font-mono" style={{ color: "rgba(251,113,133,0.6)" }}>{issue.path}</p>}</div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(251,113,133,0.12)", color: "var(--error)" }}>Error</span>
                  </div>
                ))}

                {validationIssues.filter((i) => i.severity === "warning").map((issue, i) => (
                  <div key={`w-${i}`} className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--warning-bg)", border: "1px solid rgba(251,191,36,0.15)" }}>
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,191,36,0.1)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                    </div>
                    <div className="flex-1"><p className="text-[13px] font-medium" style={{ color: "var(--warning)" }}>{issue.message}</p>{issue.path && <p className="mt-1 text-[11px] font-mono" style={{ color: "rgba(251,191,36,0.5)" }}>{issue.path}</p>}</div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(251,191,36,0.1)", color: "var(--warning)" }}>Warning</span>
                  </div>
                ))}

                {error && (
                  <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--danger-bg)", border: "1px solid rgba(251,113,133,0.15)" }}>
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,113,133,0.12)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" /></svg>
                    </div>
                    <p className="flex-1 text-[13px] font-medium" style={{ color: "var(--error)" }}>{error}</p>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(251,113,133,0.12)", color: "var(--error)" }}>API Error</span>
                  </div>
                )}

                {totalIssues === 0 && !error && !logs.length && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--success-bg)", border: "1px solid rgba(34,211,238,0.15)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12" /></svg>
                    </div>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--text-muted)" }}>Ready to validate</p>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Run a migration to see the log</p>
                  </div>
                )}

                {/* Full Migration Log */}
                {logs.length > 0 && (
                  <>
                    <div className="mt-6 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Full Migration Log ({logs.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {logs.map((logEntry, i) => {
                        const isWarning = logEntry.includes("⚠") || logEntry.includes("MANUAL") || logEntry.includes("TODO") || logEntry.includes("REPLACE") || logEntry.includes("PENDING");
                        const isSuccess = logEntry.includes("✓") || logEntry.includes("passed") || logEntry.includes("Valid JSON") || logEntry.includes("restored");
                        const isInfo = logEntry.includes("──") || logEntry.includes("Source:") || logEntry.includes("Target:") || logEntry.includes("Post-processor") || logEntry.includes("ASL post-processor");
                        const isPii = logEntry.includes("PII") || logEntry.includes("redact");

                        let dotColor = "var(--text-muted)";
                        let textColor = "var(--text-secondary)";
                        let bg = "transparent";
                        let badge = "";

                        if (isWarning) {
                          dotColor = "var(--warning)"; textColor = "var(--warning)"; bg = "var(--warning-bg)"; badge = "Action";
                        } else if (isSuccess) {
                          dotColor = "var(--success)"; textColor = "var(--success)";
                        } else if (isPii) {
                          dotColor = "var(--accent)"; textColor = "var(--text-accent)";
                        } else if (isInfo) {
                          textColor = "var(--text-muted)";
                        }

                        return (
                          <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2" style={{ background: bg }}>
                            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
                            <p className="flex-1 text-[12px] font-medium leading-relaxed" style={{ color: textColor }}>{logEntry}</p>
                            {badge && <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(251,191,36,0.1)", color: "var(--warning)" }}>{badge}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="shrink-0 flex items-center justify-between border-t px-4" style={{ height: "var(--statusbar-height)", borderColor: "var(--border-subtle)", background: "var(--statusbar-bg)" }}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="status-dot" />
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Connected</span>
              </div>
              {apiLatency !== null && (
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{apiLatency}ms</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Gemini 3.5 Flash</span>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)", opacity: 0.4 }}>v3.2.0</span>
            </div>
          </div>
        </main>
      </div>

      {/* Log Drawer */}
      {showLogDrawer && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setShowLogDrawer(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[90vw] flex-col border-l shadow-2xl animate-slideInRight" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                <span className="text-[14px] font-bold" style={{ color: "var(--text-bright)" }}>Migration Log</span>
                {logs.length > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>{logs.length}</span>}
              </div>
              <button onClick={() => setShowLogDrawer(false)} className="btn-press flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 scrollbar-thin">
              <MigrationLog logs={logs} isLoading={isLoading} error={error} validationIssues={validationIssues} />
              {!isLoading && logs.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No migration logs yet</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <SmartUploadModal isOpen={showSmartUpload} onClose={() => setShowSmartUpload(false)} onGenerated={handleSmartUploadGenerated} />
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} shortcuts={shortcutList} />
      <IaCExportModal isOpen={showIaCExport} onClose={() => setShowIaCExport(false)} outputCode={outputCode} direction={migrationDirection} />
      <BatchMigrationModal isOpen={showBatch} onClose={() => setShowBatch(false)} targetPlatform={target} onLoadResult={handleBatchLoadResult} />
      <DiffViewer isOpen={showDiff} onClose={() => setShowDiff(false)} leftCode={sourceCode} rightCode={outputCode} leftLabel="Source" rightLabel="Migrated Output" />

      {/* AI Assistant */}
      <AiAssistant sourceCode={sourceCode} outputCode={outputCode} direction={migrationDirection} comparison={comparison} corrections={corrections} />
    </div>
  );
}

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
import ComparisonView from "@/components/comparison-view";
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
import { useCustomRules } from "@/hooks/useCustomRules";
import CustomRulesPanel from "@/components/custom-rules-panel";
import { applyPreRules, applyPostRules } from "@/lib/custom-rules";
import BatchMigrationModal from "@/components/batch-migration-modal";
import IaCExportModal from "@/components/iac-export-modal";

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
  const [mobileTab, setMobileTab] = useState<"source" | "output">("source");
  const [showIaCExport, setShowIaCExport] = useState(false);

  const {
    corrections,
    correctionCount,
    activeCount,
    addCorrections,
    removeCorrection,
    clearCorrections,
    getPromptBlock,
  } = useCorrections();

  const {
    snapshots,
    isLoading: versionsLoading,
    saveSnapshot,
    removeSnapshot,
    clearAll: clearAllSnapshots,
  } = useVersionHistory();

  const {
    rules: customRules,
    addRule,
    updateRule,
    removeRule: removeCustomRule,
    toggleRule,
    clearAll: clearAllRules,
    activeCount: activeRuleCount,
  } = useCustomRules();

  useEffect(() => {
    if (sourceCode.trim()) {
      const result = detectPlatform(sourceCode);
      setDetection(result);
      if (result.platform === "aws-step-functions") {
        setTarget("azure-logic-apps");
      } else if (result.platform === "azure-logic-apps") {
        setTarget("aws-step-functions");
      }
    } else {
      setDetection(null);
    }
  }, [sourceCode]);

  const handleMigrate = useCallback(async () => {
    if (!sourceCode.trim()) return;
    setIsLoading(true);
    setError("");
    setLogs([]);
    setOutputCode("");
    setOriginalAiOutput("");
    setValidationIssues([]);
    setComparison(null);
    setHasUserEdits(false);
    setCorrectionsFeedback("");

    try {
      const correctionsPrompt = getPromptBlock(migrationDirection);

      // Apply pre-processing custom rules
      const processedSource = applyPreRules(sourceCode, customRules, migrationDirection);

      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCode: processedSource,
          targetPlatform: target,
          corrections: correctionsPrompt || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Migration failed");
        return;
      }

      // Apply post-processing custom rules
      const dir = data.direction || migrationDirection;
      const finalOutput = applyPostRules(data.outputCode, customRules, dir);

      setOutputCode(finalOutput);
      setOriginalAiOutput(finalOutput);
      setLogs(data.migrationLog || []);
      setValidationIssues(data.validationIssues || []);
      setComparison(data.comparison || null);
      setMigrationDirection(data.direction || "aws-to-azure");

      if (correctionsPrompt) {
        setLogs((prev) => [
          ...prev,
          `${activeCount(data.direction || migrationDirection)} learned correction(s) applied to this migration`,
        ]);
      }

      const ruleCount = activeRuleCount(dir);
      if (ruleCount > 0) {
        setLogs((prev) => [
          ...prev,
          `${ruleCount} custom rule(s) applied to this migration`,
        ]);
      }

      // Auto-save to version history
      saveSnapshot({
        direction: dir,
        sourceCode,
        outputCode: finalOutput,
        migrationLog: data.migrationLog || [],
        validationIssues: data.validationIssues || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [sourceCode, target, getPromptBlock, migrationDirection, activeCount, customRules, activeRuleCount]);

  const handleOutputChange = useCallback(
    (val: string) => {
      setOutputCode(val);
      setHasUserEdits(val !== originalAiOutput && originalAiOutput !== "");
    },
    [originalAiOutput]
  );

  const handleSubmitCorrections = useCallback(() => {
    if (!hasUserEdits || !originalAiOutput || !outputCode) return;
    setIsSubmittingCorrections(true);

    try {
      const incoming = processCorrections(originalAiOutput, outputCode, migrationDirection);
      if (incoming.length > 0) {
        addCorrections(incoming);
        setOriginalAiOutput(outputCode);
        setHasUserEdits(false);
        setCorrectionsFeedback(`${incoming.length} correction${incoming.length !== 1 ? "s" : ""} learned!`);
        setTimeout(() => setCorrectionsFeedback(""), 3000);
      } else {
        setCorrectionsFeedback("No meaningful differences detected");
        setTimeout(() => setCorrectionsFeedback(""), 3000);
      }
    } catch {
      setCorrectionsFeedback("Failed to process corrections");
      setTimeout(() => setCorrectionsFeedback(""), 3000);
    } finally {
      setIsSubmittingCorrections(false);
    }
  }, [hasUserEdits, originalAiOutput, outputCode, migrationDirection, addCorrections]);

  const loadSample = useCallback((type: "aws" | "azure") => {
    setSourceCode(type === "aws" ? AWS_SAMPLE : AZURE_SAMPLE);
    setOutputCode("");
    setOriginalAiOutput("");
    setLogs([]);
    setError("");
    setValidationIssues([]);
    setHasUserEdits(false);
    setCorrectionsFeedback("");
  }, []);

  const handleClear = useCallback(() => {
    setSourceCode("");
    setOutputCode("");
    setOriginalAiOutput("");
    setLogs([]);
    setError("");
    setDetection(null);
    setValidationIssues([]);
    setComparison(null);
    setHasUserEdits(false);
    setCorrectionsFeedback("");
  }, []);

  const handleLoadSnapshot = useCallback((snap: MigrationSnapshot) => {
    setSourceCode(snap.sourceCode);
    setOutputCode(snap.outputCode);
    setOriginalAiOutput(snap.outputCode);
    setLogs(snap.migrationLog);
    setValidationIssues(snap.validationIssues);
    setMigrationDirection(snap.direction);
    setHasUserEdits(false);
    setCorrectionsFeedback("");
    setError("");
    setComparison(null);
  }, []);

  const handleSmartUploadGenerated = useCallback((code: string) => {
    setSourceCode(code);
    setOutputCode("");
    setOriginalAiOutput("");
    setLogs([]);
    setError("");
    setValidationIssues([]);
    setComparison(null);
    setHasUserEdits(false);
    setCorrectionsFeedback("");
    setShowSmartUpload(false);
  }, []);

  const handleBatchLoadResult = useCallback(
    (outputCode: string, sourceCode: string, direction: "aws-to-azure" | "azure-to-aws") => {
      setSourceCode(sourceCode);
      setOutputCode(outputCode);
      setOriginalAiOutput(outputCode);
      setMigrationDirection(direction);
      setLogs(["Loaded from batch migration results"]);
      setHasUserEdits(false);
      setError("");
      setComparison(null);
      setValidationIssues([]);
    },
    []
  );

  const canMigrate =
    detection !== null &&
    detection.platform !== "unknown" &&
    detection.platform !== target &&
    !isLoading;

  const activeCorrectionCount = activeCount(migrationDirection);

  // Download output handler for shortcut
  const handleDownloadOutput = useCallback(() => {
    if (!outputCode) return;
    const blob = new Blob([outputCode], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "migrated-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [outputCode]);

  // Keyboard shortcuts
  const shortcutsConfig: ShortcutConfig[] = useMemo(
    () => [
      {
        key: "enter",
        metaOrCtrl: true,
        label: "Migrate Workflow",
        description: "Run migration on the source workflow",
        action: () => { if (canMigrate) handleMigrate(); },
        enabled: canMigrate,
      },
      {
        key: "s",
        metaOrCtrl: true,
        label: "Download Output",
        description: "Download the migrated output as JSON",
        action: handleDownloadOutput,
        enabled: !!outputCode,
      },
      {
        key: "c",
        metaOrCtrl: true,
        shift: true,
        label: "Clear Workspace",
        description: "Clear all editors and reset state",
        action: handleClear,
      },
      {
        key: "?",
        label: "Keyboard Shortcuts",
        description: "Show this shortcuts panel",
        action: () => setShowShortcuts((v) => !v),
      },
    ],
    [canMigrate, handleMigrate, handleDownloadOutput, handleClear, outputCode]
  );

  const { shortcutList } = useKeyboardShortcuts(shortcutsConfig);

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--background)]">
      <Header onShowShortcuts={() => setShowShortcuts(true)} />

      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6">
        {/* Top Controls */}
        <div className="flex flex-wrap items-start gap-2 sm:gap-3 animate-fadeIn">
          <PlatformSelector
            detection={detection}
            target={target}
            onTargetChange={setTarget}
          />

          <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="card-premium hidden sm:flex overflow-hidden">
              <button
                onClick={() => loadSample("aws")}
                className="btn-press flex items-center gap-2 border-r border-[var(--card-border)] px-4 py-2.5 text-[11px] font-semibold transition-colors"
                style={{ color: "var(--muted)" }}
              >
                <div className="h-2 w-2 rounded-full bg-[var(--aws-color)] shadow-sm shadow-orange-400/30" />
                AWS Sample
              </button>
              <button
                onClick={() => loadSample("azure")}
                className="btn-press flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold transition-colors"
                style={{ color: "var(--muted)" }}
              >
                <div className="h-2 w-2 rounded-full bg-[var(--azure-color)] shadow-sm shadow-blue-400/30" />
                Azure Sample
              </button>
            </div>
            {/* Mobile-only compact samples */}
            <div className="card-premium flex sm:hidden overflow-hidden">
              <button onClick={() => loadSample("aws")} className="btn-press flex items-center gap-1.5 border-r border-[var(--card-border)] px-3 py-2 text-[10px] font-semibold" style={{ color: "var(--muted)" }}>
                <div className="h-2 w-2 rounded-full bg-[var(--aws-color)]" />
                AWS
              </button>
              <button onClick={() => loadSample("azure")} className="btn-press flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold" style={{ color: "var(--muted)" }}>
                <div className="h-2 w-2 rounded-full bg-[var(--azure-color)]" />
                Azure
              </button>
            </div>
            <VersionHistoryPanel
              snapshots={snapshots}
              isLoading={versionsLoading}
              onLoad={handleLoadSnapshot}
              onDelete={removeSnapshot}
              onClearAll={clearAllSnapshots}
            />
            <button
              onClick={() => setShowBatch(true)}
              className="btn-press card-premium flex items-center gap-2 px-3.5 py-2.5 text-[11px] font-semibold transition-all hover:shadow-md"
              style={{ color: "var(--muted)" }}
              title="Batch migrate multiple files"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M12 18v-6"/>
                <path d="m9 15 3 3 3-3"/>
              </svg>
              Batch
            </button>
            <CustomRulesPanel
              rules={customRules}
              onAdd={addRule}
              onUpdate={updateRule}
              onRemove={removeCustomRule}
              onToggle={toggleRule}
              onClearAll={clearAllRules}
              activeCount={activeRuleCount(migrationDirection)}
            />
            <CorrectionsPanel
              corrections={corrections}
              onClear={clearCorrections}
              onRemove={removeCorrection}
              direction={migrationDirection}
            />
            <button
              onClick={handleClear}
              className="btn-press card-premium px-4 py-2.5 text-[11px] font-semibold transition-colors"
              style={{ color: "var(--muted)" }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Migrate Button + Corrections Active */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            onClick={handleMigrate}
            disabled={!canMigrate}
            className={`btn-press group relative overflow-hidden rounded-2xl px-8 py-3 text-[13px] sm:px-12 sm:py-3.5 sm:text-[14px] font-bold tracking-wide transition-all ${
              canMigrate
                ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-xl shadow-indigo-500/25 hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02]"
                : "cursor-not-allowed shadow-none"
            }`}
            style={!canMigrate ? { background: "var(--hover-bg)", color: "var(--muted)" } : undefined}
            aria-busy={isLoading}
            aria-label={isLoading ? "Migrating workflow" : "Migrate workflow"}
          >
            {isLoading ? (
              <span className="flex items-center gap-3">
                <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Migrating Workflow...
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                Migrate Workflow
              </span>
            )}
            {canMigrate && !isLoading && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            )}
            {canMigrate && !isLoading && (
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 opacity-30 blur-lg -z-10 transition-opacity group-hover:opacity-50" />
            )}
          </button>

          {activeCorrectionCount > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200/50 px-4 py-2.5 text-[11px] font-bold text-indigo-700 shadow-sm animate-fadeIn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {activeCorrectionCount} correction{activeCorrectionCount !== 1 ? "s" : ""} active
            </span>
          )}

          {outputCode && (
            <button
              onClick={() => setShowDiff(true)}
              className="btn-press flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[11px] font-bold transition-all hover:shadow-md animate-fadeIn"
              style={{ borderColor: "var(--card-border)", background: "var(--card)", color: "var(--muted)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <rect x="2" y="3" width="7" height="18" rx="1" />
                <rect x="15" y="3" width="7" height="18" rx="1" />
              </svg>
              View Diff
            </button>
          )}
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
          <button
            onClick={() => setMobileTab("source")}
            className={`flex-1 px-4 py-2.5 text-[12px] font-bold transition-colors ${mobileTab === "source" ? "text-white" : ""}`}
            style={mobileTab === "source" ? { background: "var(--primary)" } : { color: "var(--muted)" }}
          >
            Source
          </button>
          <button
            onClick={() => setMobileTab("output")}
            className={`flex-1 px-4 py-2.5 text-[12px] font-bold transition-colors ${mobileTab === "output" ? "text-white" : ""}`}
            style={mobileTab === "output" ? { background: "var(--primary)" } : { color: "var(--muted)" }}
          >
            Output {outputCode ? "✓" : ""}
          </button>
        </div>

        {/* Editor Panels */}
        <div className="grid flex-1 grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          {/* Source — always visible on desktop, conditional on mobile */}
          <div className={`${mobileTab === "source" ? "" : "hidden"} lg:block`}>
            <CodeEditor
              value={sourceCode}
              onChange={setSourceCode}
              label="Source Workflow"
              onSmartUpload={() => setShowSmartUpload(true)}
              badge={
                detection && detection.platform !== "unknown"
                  ? {
                      text: detection.platform === "aws-step-functions" ? "ASL" : "Logic Apps",
                      variant: detection.platform === "aws-step-functions" ? "aws" : "azure",
                    }
                  : undefined
              }
            />
          </div>
          {/* Output — always visible on desktop, conditional on mobile */}
          <div className={`${mobileTab === "output" ? "" : "hidden"} lg:block`}>
            <CodeEditor
              value={outputCode}
              onChange={handleOutputChange}
              label="Migrated Output"
              showEditBadge={hasUserEdits}
              showDownload={!!outputCode}
              onExportIaC={outputCode ? () => setShowIaCExport(true) : undefined}
              badge={
                outputCode
                  ? {
                      text: target === "aws-step-functions" ? "ASL" : "Logic Apps",
                      variant: target === "aws-step-functions" ? "aws" : "azure",
                    }
                  : undefined
              }
            />
          </div>
        </div>

        {/* Submit Corrections Bar */}
        {hasUserEdits && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-4 py-3 sm:px-6 sm:py-4 shadow-md shadow-amber-100/50 animate-slideUp">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(217,119,6)" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-bold text-amber-800">
                  You&apos;ve edited the output — teach the AI your corrections
                </p>
                <p className="text-[11px] text-amber-600/80 mt-0.5">
                  Submit your changes so future migrations avoid these mistakes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {correctionsFeedback && (
                <span className="text-[11px] font-bold text-emerald-600 animate-fadeIn">
                  {correctionsFeedback}
                </span>
              )}
              <button
                onClick={handleSubmitCorrections}
                disabled={isSubmittingCorrections}
                className="btn-press rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-xl disabled:opacity-50"
              >
                {isSubmittingCorrections ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Learning...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    Submit Corrections
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Corrections Feedback Toast */}
        {correctionsFeedback && !hasUserEdits && (
          <div className="flex items-center justify-center">
            <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-[12px] font-semibold text-emerald-700 shadow-sm animate-fadeIn">
              {correctionsFeedback}
            </span>
          </div>
        )}

        {/* Visual Workflow Graph */}
        {outputCode && (
          <WorkflowGraphView
            sourceCode={sourceCode}
            outputCode={outputCode}
            direction={migrationDirection}
            comparison={comparison}
          />
        )}

        {/* Behavioral Comparison */}
        {comparison && (
          <ComparisonView comparison={comparison} direction={migrationDirection} />
        )}

        {/* Migration Log + Validation */}
        <MigrationLog
          logs={logs}
          isLoading={isLoading}
          error={error}
          validationIssues={validationIssues}
        />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t px-6 py-4" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
        <div className="mx-auto flex max-w-[1480px] items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </div>
            <p className="text-[12px] font-semibold" style={{ color: "var(--muted)" }}>
              FlowMigrate
            </p>
            <span className="text-[10px]" style={{ color: "var(--card-border)" }}>|</span>
            <p className="text-[11px]" style={{ color: "var(--muted)", opacity: 0.7 }}>
              Enterprise Workflow Migration Bridge
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[11px] font-medium" style={{ color: "var(--muted)", opacity: 0.7 }}>
              Powered by Gemini 3.5 Flash
            </p>
          </div>
        </div>
      </footer>

      {/* Smart Upload Modal */}
      <SmartUploadModal
        isOpen={showSmartUpload}
        onClose={() => setShowSmartUpload(false)}
        onGenerated={handleSmartUploadGenerated}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcutList}
      />

      {/* IaC Export */}
      <IaCExportModal
        isOpen={showIaCExport}
        onClose={() => setShowIaCExport(false)}
        outputCode={outputCode}
        direction={migrationDirection}
      />

      {/* Batch Migration */}
      <BatchMigrationModal
        isOpen={showBatch}
        onClose={() => setShowBatch(false)}
        targetPlatform={target}
        onLoadResult={handleBatchLoadResult}
      />

      {/* Diff Viewer */}
      <DiffViewer
        isOpen={showDiff}
        onClose={() => setShowDiff(false)}
        leftCode={sourceCode}
        rightCode={outputCode}
        leftLabel="Source"
        rightLabel="Migrated Output"
      />

      {/* AI Assistant */}
      <AiAssistant
        sourceCode={sourceCode}
        outputCode={outputCode}
        direction={migrationDirection}
        comparison={comparison}
        corrections={corrections}
      />
    </div>
  );
}

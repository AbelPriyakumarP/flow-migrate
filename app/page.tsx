"use client";

import { useState, useCallback, useEffect } from "react";
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

  const {
    corrections,
    correctionCount,
    activeCount,
    addCorrections,
    removeCorrection,
    clearCorrections,
    getPromptBlock,
  } = useCorrections();

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

      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCode,
          targetPlatform: target,
          corrections: correctionsPrompt || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Migration failed");
        return;
      }

      setOutputCode(data.outputCode);
      setOriginalAiOutput(data.outputCode);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [sourceCode, target, getPromptBlock, migrationDirection, activeCount]);

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

  const canMigrate =
    detection !== null &&
    detection.platform !== "unknown" &&
    detection.platform !== target &&
    !isLoading;

  const activeCorrectionCount = activeCount(migrationDirection);

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--background)]">
      <Header />

      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-6 py-6">
        {/* Top Controls */}
        <div className="flex flex-wrap items-start gap-3 animate-fadeIn">
          <PlatformSelector
            detection={detection}
            target={target}
            onTargetChange={setTarget}
          />

          <div className="ml-auto flex items-center gap-2">
            <div className="card-premium flex overflow-hidden">
              <button
                onClick={() => loadSample("aws")}
                className="btn-press flex items-center gap-2 border-r border-[var(--card-border)] px-4 py-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-orange-50/50"
              >
                <div className="h-2 w-2 rounded-full bg-[var(--aws-color)] shadow-sm shadow-orange-400/30" />
                AWS Sample
              </button>
              <button
                onClick={() => loadSample("azure")}
                className="btn-press flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-blue-50/50"
              >
                <div className="h-2 w-2 rounded-full bg-[var(--azure-color)] shadow-sm shadow-blue-400/30" />
                Azure Sample
              </button>
            </div>
            <CorrectionsPanel
              corrections={corrections}
              onClear={clearCorrections}
              onRemove={removeCorrection}
              direction={migrationDirection}
            />
            <button
              onClick={handleClear}
              className="btn-press card-premium px-4 py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Migrate Button + Corrections Active */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleMigrate}
            disabled={!canMigrate}
            className={`btn-press group relative overflow-hidden rounded-2xl px-12 py-3.5 text-[14px] font-bold tracking-wide transition-all ${
              canMigrate
                ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-xl shadow-indigo-500/25 hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02]"
                : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
            }`}
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
        </div>

        {/* Editor Panels */}
        <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
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
          <CodeEditor
            value={outputCode}
            onChange={handleOutputChange}
            label="Migrated Output"
            showEditBadge={hasUserEdits}
            showDownload={!!outputCode}
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

        {/* Submit Corrections Bar */}
        {hasUserEdits && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-6 py-4 shadow-md shadow-amber-100/50 animate-slideUp">
            <div className="flex items-center gap-4">
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
      <footer className="relative z-10 border-t border-slate-200/60 bg-white/80 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </div>
            <p className="text-[12px] font-semibold text-slate-500">
              FlowMigrate
            </p>
            <span className="text-[10px] text-slate-300">|</span>
            <p className="text-[11px] text-slate-400">
              Enterprise Workflow Migration Bridge
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[11px] font-medium text-slate-400">
              Powered by Gemini 3.1 Pro
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

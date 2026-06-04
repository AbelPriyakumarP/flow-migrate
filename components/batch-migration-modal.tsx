"use client";

import { useState, useCallback, useRef } from "react";
import {
  processBatch,
  parseUploadedFiles,
  downloadResultsAsZip,
  type BatchFile,
  type BatchResult,
  type BatchProgress,
} from "@/lib/batch-processor";
import type { Platform } from "@/lib/detect-platform";

interface BatchMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlatform: Platform;
  onLoadResult?: (outputCode: string, sourceCode: string, direction: "aws-to-azure" | "azure-to-aws") => void;
}

type Stage = "upload" | "progress" | "results";

export default function BatchMigrationModal({
  isOpen,
  onClose,
  targetPlatform,
  onLoadResult,
}: BatchMigrationModalProps) {
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleClose = useCallback(() => {
    if (stage === "progress") {
      abortRef.current?.abort();
    }
    setStage("upload");
    setFiles([]);
    setProgress(null);
    setResults([]);
    onClose();
  }, [stage, onClose]);

  const handleFilesSelected = useCallback(async (fileList: FileList) => {
    const parsed = await parseUploadedFiles(fileList);
    setFiles((prev) => [...prev, ...parsed]);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        await handleFilesSelected(e.dataTransfer.files);
      }
    },
    [handleFilesSelected]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        await handleFilesSelected(e.target.files);
      }
    },
    [handleFilesSelected]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleStartMigration = useCallback(async () => {
    if (files.length === 0) return;
    setStage("progress");
    setResults([]);
    const controller = new AbortController();
    abortRef.current = controller;

    const finalResults = await processBatch(
      files,
      targetPlatform,
      (p) => setProgress(p),
      controller.signal
    );

    setResults(finalResults);
    setStage("results");
    abortRef.current = null;
  }, [files, targetPlatform]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDownloadAll = useCallback(async () => {
    await downloadResultsAsZip(results);
  }, [results]);

  const handleDownloadSingle = useCallback((result: BatchResult) => {
    if (!result.outputCode) return;
    const blob = new Blob([result.outputCode], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.outputFilename || "migrated.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (!isOpen) return null;

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  const platformLabel = (p: string) =>
    p === "aws-step-functions" ? "AWS" : p === "azure-logic-apps" ? "Azure" : "Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div
        className="relative w-full max-w-2xl animate-scaleIn overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Batch migration"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--card-border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M12 18v-6"/>
                <path d="m9 15 3 3 3-3"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--foreground)" }}>Batch Migration</h2>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                Migrate multiple workflows to {platformLabel(targetPlatform)}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="rounded-lg p-2 transition-colors" style={{ color: "var(--muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Stage: Upload */}
        {stage === "upload" && (
          <div className="p-6 space-y-4">
            {/* Drop Zone */}
            <div
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                isDragOver ? "border-indigo-400 bg-indigo-50/50" : ""
              }`}
              style={!isDragOver ? { borderColor: "var(--card-border)" } : undefined}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <svg className="mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17,8 12,3 7,8"/>
                <line x1="12" x2="12" y1="3" y2="15"/>
              </svg>
              <p className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                Drop workflow files here
              </p>
              <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                JSON files • AWS Step Functions (ASL) or Azure Logic Apps
              </p>
              <label className="mt-4 cursor-pointer rounded-lg border px-4 py-2 text-[11px] font-semibold transition-all hover:shadow-md" style={{ borderColor: "var(--card-border)", color: "var(--primary)", background: "var(--card)" }}>
                Browse Files
                <input
                  type="file"
                  accept=".json,.txt"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {files.length} file{files.length !== 1 ? "s" : ""} queued
                </p>
                <div className="max-h-[200px] overflow-y-auto scrollbar-thin space-y-1">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2"
                      style={{ background: "var(--subtle-bg)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <path d="M14 2v6h6"/>
                      </svg>
                      <span className="flex-1 truncate text-[12px] font-medium" style={{ color: "var(--foreground)" }}>
                        {file.name}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase ${
                        file.detectedPlatform === "aws-step-functions"
                          ? "bg-orange-50 text-orange-600"
                          : file.detectedPlatform === "azure-logic-apps"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-red-50 text-red-500"
                      }`}>
                        {platformLabel(file.detectedPlatform)}
                      </span>
                      <button onClick={() => removeFile(file.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Start Button */}
            {files.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleStartMigration}
                  className="btn-press rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-xl"
                >
                  <span className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 12h14"/>
                      <path d="m12 5 7 7-7 7"/>
                    </svg>
                    Migrate {files.length} File{files.length !== 1 ? "s" : ""}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stage: Progress */}
        {stage === "progress" && progress && (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-3 border-indigo-200 border-t-indigo-600" />
              <p className="text-[14px] font-bold" style={{ color: "var(--foreground)" }}>
                Migrating {progress.current} of {progress.total}
              </p>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                {progress.currentFile}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--hover-bg)" }}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>

            {/* Completed items */}
            {progress.results.length > 0 && (
              <div className="max-h-[150px] overflow-y-auto scrollbar-thin space-y-1">
                {progress.results.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "var(--subtle-bg)" }}>
                    {r.status === "success" ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
                    )}
                    <span className="text-[11px] truncate" style={{ color: "var(--foreground)" }}>{r.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={handleAbort}
                className="btn-press rounded-lg border px-4 py-2 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                style={{ borderColor: "var(--card-border)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stage: Results */}
        {stage === "results" && (
          <div className="p-6 space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-center gap-4">
              {successCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                  {successCount} succeeded
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[12px] font-bold text-red-600">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
                  {errorCount} failed
                </span>
              )}
              {skippedCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-600">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  {skippedCount} skipped
                </span>
              )}
            </div>

            {/* Results Table */}
            <div className="max-h-[300px] overflow-y-auto scrollbar-thin space-y-1">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ background: "var(--subtle-bg)" }}
                >
                  {result.status === "success" ? (
                    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                  ) : result.status === "error" ? (
                    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
                  ) : result.status === "aborted" ? (
                    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
                  ) : (
                    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate" style={{ color: "var(--foreground)" }}>
                      {result.name}
                    </p>
                    {result.error && (
                      <p className="text-[10px] text-red-500 truncate">{result.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {result.status === "success" && onLoadResult && result.outputCode && (
                      <button
                        onClick={() => {
                          const file = files.find((f) => f.id === result.id);
                          if (file && result.direction) {
                            onLoadResult(result.outputCode!, file.content, result.direction);
                            handleClose();
                          }
                        }}
                        className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-indigo-50"
                        style={{ color: "var(--primary)" }}
                      >
                        Open
                      </button>
                    )}
                    {result.status === "success" && (
                      <button
                        onClick={() => handleDownloadSingle(result)}
                        className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors"
                        style={{ color: "var(--muted)" }}
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => { setStage("upload"); setFiles([]); setResults([]); }}
                className="rounded-lg px-4 py-2 text-[11px] font-semibold transition-colors"
                style={{ color: "var(--muted)" }}
              >
                New Batch
              </button>
              {successCount > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="btn-press flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-xl"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" x2="12" y1="15" y2="3"/>
                  </svg>
                  Download All (ZIP)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

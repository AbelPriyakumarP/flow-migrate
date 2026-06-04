"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useEditorHistory } from "@/hooks/useEditorHistory";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  label: string;
  badge?: { text: string; variant: "aws" | "azure" | "neutral" };
  lineCount?: number;
  showEditBadge?: boolean;
  showDownload?: boolean;
  onSmartUpload?: () => void;
  onExportIaC?: () => void;
}

export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  label,
  badge,
  showEditBadge = false,
  showDownload = false,
  onSmartUpload,
  onExportIaC,
}: CodeEditorProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { push: pushHistory, undo, redo, reset: resetHistory, canUndo, canRedo } = useEditorHistory(value);
  const isUndoRedoRef = useRef(false);

  // Push changes to history (skip if change came from undo/redo)
  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    pushHistory(value);
  }, [value, pushHistory]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev !== null) {
      isUndoRedoRef.current = true;
      onChange(prev);
    }
  }, [undo, onChange]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next !== null) {
      isUndoRedoRef.current = true;
      onChange(next);
    }
  }, [redo, onChange]);

  // Handle Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z at textarea level
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      handleRedo();
    }
  }, [handleUndo, handleRedo]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => onChange(ev.target?.result as string);
        reader.readAsText(file);
      }
    },
    [onChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => onChange(ev.target?.result as string);
        reader.readAsText(file);
      }
    },
    [onChange]
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "migrated-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [value]);

  const lineCount = value ? value.split("\n").length : 0;
  const badgeColors = {
    aws: "bg-gradient-to-r from-orange-50 to-amber-50 text-[var(--aws-color)] border-orange-200/60",
    azure: "bg-gradient-to-r from-blue-50 to-sky-50 text-[var(--azure-color)] border-blue-200/60",
    neutral: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <div className="card-premium flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-2.5" style={{ background: "var(--toolbar-bg)" }}>
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/80 shadow-sm shadow-red-400/20" />
            <div className="h-3 w-3 rounded-full bg-amber-400/80 shadow-sm shadow-amber-400/20" />
            <div className="h-3 w-3 rounded-full bg-emerald-400/80 shadow-sm shadow-emerald-400/20" />
          </div>
          <span className="text-[13px] font-bold" style={{ color: "var(--foreground)" }}>{label}</span>
          {badge && (
            <span className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${badgeColors[badge.variant]}`}>
              {badge.text}
            </span>
          )}
          {showEditBadge && (
            <span className="rounded-lg border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 animate-fadeIn shadow-sm">
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Undo/Redo */}
          {(canUndo || canRedo) && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="btn-press rounded-md p-1.5 transition-all disabled:opacity-30"
                style={{ color: "var(--muted)" }}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="btn-press rounded-md p-1.5 transition-all disabled:opacity-30"
                style={{ color: "var(--muted)" }}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                </svg>
              </button>
            </div>
          )}

          {value && (
            <span className="mr-2 text-[11px] font-medium" style={{ color: "var(--muted)" }}>
              {lineCount} lines
            </span>
          )}
          {!readOnly && onSmartUpload && (
            <button
              onClick={onSmartUpload}
              className="btn-press rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-indigo-500/20 transition-all hover:from-indigo-600 hover:to-violet-600 hover:shadow-md hover:shadow-indigo-500/25"
            >
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" /><circle cx="12" cy="10" r="2" /></svg>
                Smart Upload
              </span>
            </button>
          )}
          {!readOnly && (
            <label className="btn-press cursor-pointer rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-[11px] font-semibold shadow-sm transition-all hover:border-indigo-300 hover:shadow-md" style={{ background: "var(--card)", color: "var(--muted)" }}>
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                Upload
              </span>
              <input type="file" accept=".json,.txt" className="hidden" onChange={handleFileSelect} />
            </label>
          )}
          {value && (
            <button
              onClick={handleCopy}
              className="btn-press rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-[11px] font-semibold shadow-sm transition-all hover:border-indigo-300 hover:shadow-md" style={{ background: "var(--card)", color: "var(--muted)" }}
            >
              {copied ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                  Copied
                </span>
              ) : "Copy"}
            </button>
          )}
          {onExportIaC && value && (
            <button
              onClick={onExportIaC}
              className="btn-press rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 text-[11px] font-bold text-emerald-600 shadow-sm transition-all hover:from-emerald-100 hover:to-teal-100 hover:shadow-md"
            >
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
                Export IaC
              </span>
            </button>
          )}
          {(readOnly || showDownload) && value && (
            <button
              onClick={handleDownload}
              className="btn-press rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-1.5 text-[11px] font-bold text-indigo-600 shadow-sm transition-all hover:from-indigo-100 hover:to-violet-100 hover:shadow-md"
            >
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Download
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div
        className={`relative flex-1 ${isDragOver ? "bg-indigo-50/50" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!readOnly) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={readOnly ? undefined : handleDrop}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-indigo-400 bg-indigo-50/90 rounded-b-2xl">
            <div className="text-center">
              <svg className="mx-auto mb-2 animate-float" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              <p className="text-sm font-bold text-indigo-600">Drop your workflow file</p>
              <p className="text-xs text-indigo-400 mt-1">JSON format</p>
            </div>
          </div>
        )}

        {!value && !readOnly && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: "var(--subtle-bg)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
            </div>
            <div className="text-center">
              <p className="text-[14px] font-semibold" style={{ color: "var(--muted)" }}>Paste workflow JSON or drag &amp; drop a file</p>
              <p className="mt-1.5 text-[12px] opacity-60" style={{ color: "var(--muted)" }}>Supports AWS Step Functions (ASL) and Azure Logic Apps</p>
              {onSmartUpload && (
                <p className="mt-3 text-[12px] text-indigo-500 font-semibold">
                  Or use <button onClick={onSmartUpload} className="underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700 pointer-events-auto transition-colors">Smart Upload</button> for images &amp; documents
                </p>
              )}
            </div>
          </div>
        )}

        {!value && readOnly && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: "var(--subtle-bg)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><path d="m5 12 7 7 7-7"/><path d="m5 5 7 7 7-7"/></svg>
            </div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--muted)" }}>Migrated output will appear here</p>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={!readOnly ? handleKeyDown : undefined}
          readOnly={readOnly}
          placeholder=""
          spellCheck={false}
          aria-label={label}
          aria-readonly={readOnly}
          className={`scrollbar-thin h-full w-full resize-none p-5 font-mono text-[13px] leading-7 outline-none ${!value ? "opacity-0" : ""}`}
          style={{ minHeight: "320px", background: "var(--editor-bg)", color: "var(--editor-text)" }}
        />
      </div>
    </div>
  );
}

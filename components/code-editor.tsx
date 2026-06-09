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

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    pushHistory(value);
  }, [value, pushHistory]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev !== null) { isUndoRedoRef.current = true; onChange(prev); }
  }, [undo, onChange]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next !== null) { isUndoRedoRef.current = true; onChange(next); }
  }, [redo, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); handleRedo(); }
  }, [handleUndo, handleRedo]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) { const reader = new FileReader(); reader.onload = (ev) => onChange(ev.target?.result as string); reader.readAsText(file); }
  }, [onChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onload = (ev) => onChange(ev.target?.result as string); reader.readAsText(file); }
  }, [onChange]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([value], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "migrated-workflow.json"; a.click(); URL.revokeObjectURL(url);
  }, [value]);

  const lineCount = value ? value.split("\n").length : 0;

  const badgeColors = {
    aws: { bg: "var(--aws-bg)", text: "var(--aws-color)", border: "rgba(255,153,0,0.2)" },
    azure: { bg: "var(--azure-bg)", text: "var(--azure-color)", border: "rgba(56,189,248,0.2)" },
    neutral: { bg: "var(--accent-bg)", text: "var(--text-muted)", border: "var(--border-subtle)" },
  };

  return (
    <div className="card-premium flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
          {badge && (
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: badgeColors[badge.variant].bg, color: badgeColors[badge.variant].text, border: `1px solid ${badgeColors[badge.variant].border}` }}>
              {badge.text}
            </span>
          )}
          {showEditBadge && (
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold animate-fadeIn" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.2)" }}>
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(canUndo || canRedo) && (
            <div className="flex items-center gap-0.5 mr-1">
              <button onClick={handleUndo} disabled={!canUndo} className="btn-press rounded-md p-1.5 transition-all hover:bg-[var(--hover-bg)] disabled:opacity-25" style={{ color: "var(--text-muted)" }} title="Undo">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </button>
              <button onClick={handleRedo} disabled={!canRedo} className="btn-press rounded-md p-1.5 transition-all hover:bg-[var(--hover-bg)] disabled:opacity-25" style={{ color: "var(--text-muted)" }} title="Redo">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>
              </button>
            </div>
          )}

          {value && <span className="mr-1.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{lineCount} ln</span>}

          {!readOnly && onSmartUpload && (
            <button onClick={onSmartUpload} className="btn-press rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
              Smart Upload
            </button>
          )}
          {!readOnly && onSmartUpload && (
            <label className="btn-press cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              Upload
              <input type="file" accept=".json,.txt" className="hidden" onChange={handleFileSelect} />
            </label>
          )}
          {value && (
            <button onClick={handleCopy} className="btn-press rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: copied ? "var(--success)" : "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
          {onExportIaC && value && (
            <button onClick={onExportIaC} className="btn-press rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--success)", border: "1px solid rgba(34,211,238,0.2)" }}>
              Export IaC
            </button>
          )}
          {(readOnly || showDownload) && value && (
            <button onClick={handleDownload} className="btn-press rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
              Download
            </button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div
        className="relative flex-1"
        onDragOver={(e) => { e.preventDefault(); if (!readOnly) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={readOnly ? undefined : handleDrop}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" style={{ background: "rgba(99,102,241,0.08)", border: "2px dashed var(--accent)" }}>
            <div className="text-center">
              <svg className="mx-auto mb-2" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              <p className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>Drop workflow file</p>
            </div>
          </div>
        )}

        {!value && onSmartUpload && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
            <div className="rounded-xl p-3" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/></svg>
            </div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>Paste workflow JSON or drop a file</p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>Supports AWS Step Functions &amp; Azure Logic Apps</p>
            <p className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
              Or use <button onClick={onSmartUpload} className="underline underline-offset-2 pointer-events-auto hover:opacity-80 transition-opacity">Smart Upload</button> for images
            </p>
          </div>
        )}

        {!value && !onSmartUpload && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
            <div className="rounded-xl p-3" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="m5 12 7 7 7-7"/><path d="m5 5 7 7 7-7"/></svg>
            </div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>Migrated output appears here</p>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={!readOnly ? handleKeyDown : undefined}
          readOnly={readOnly}
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

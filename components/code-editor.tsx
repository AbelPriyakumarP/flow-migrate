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
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return; }
    pushHistory(value);
  }, [value, pushHistory]);

  const handleUndo = useCallback(() => { const prev = undo(); if (prev !== null) { isUndoRedoRef.current = true; onChange(prev); } }, [undo, onChange]);
  const handleRedo = useCallback(() => { const next = redo(); if (next !== null) { isUndoRedoRef.current = true; onChange(next); } }, [redo, onChange]);

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

  const handleCopy = useCallback(() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [value]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([value], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "migrated-workflow.json"; a.click(); URL.revokeObjectURL(url);
  }, [value]);

  const lineCount = value ? value.split("\n").length : 0;
  const badgeColors: Record<string, string> = {
    aws: "text-[var(--aws-color)]",
    azure: "text-[var(--azure-color)]",
    neutral: "text-[var(--text-muted)]",
  };

  return (
    <div className="glass-card-static flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-2.5">
          {/* macOS dots */}
          <div className="flex gap-1.5 mr-1">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,95,87,0.7)" }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,189,46,0.7)" }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(39,201,63,0.7)" }} />
          </div>
          {/* Lock icon for source */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>{label}</span>
          {badge && (
            <span className={`rounded-md px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest ${badgeColors[badge.variant]}`} style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
              {badge.text}
            </span>
          )}
          {showEditBadge && (
            <span className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider animate-fadeIn" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.2)" }}>
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Undo/Redo */}
          {(canUndo || canRedo) && (
            <div className="flex items-center gap-0.5 mr-1">
              <button onClick={handleUndo} disabled={!canUndo} className="btn-press rounded-md p-1.5 transition-all hover:bg-[var(--hover-bg)] disabled:opacity-20" style={{ color: "var(--text-muted)" }} title="Undo">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </button>
              <button onClick={handleRedo} disabled={!canRedo} className="btn-press rounded-md p-1.5 transition-all hover:bg-[var(--hover-bg)] disabled:opacity-20" style={{ color: "var(--text-muted)" }} title="Redo">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>
              </button>
            </div>
          )}

          {value && <span className="mr-2 text-[10px] font-mono font-medium" style={{ color: "var(--text-muted)" }}>{lineCount} lines</span>}

          {/* Action buttons - ghost style */}
          {!readOnly && onSmartUpload && (
            <button onClick={onSmartUpload} className="btn-press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" /><circle cx="12" cy="10" r="2" /></svg>
              Smart Upload
            </button>
          )}
          {!readOnly && (
            <label className="btn-press cursor-pointer flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              Upload
              <input type="file" accept=".json,.txt" className="hidden" onChange={handleFileSelect} />
            </label>
          )}
          {value && (
            <button onClick={handleCopy} className="btn-press rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: copied ? "var(--success)" : "var(--text-muted)" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
          {onExportIaC && value && (
            <button onClick={onExportIaC} className="btn-press flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--success)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
              IaC
            </button>
          )}
          {(readOnly || showDownload) && value && (
            <button onClick={handleDownload} className="btn-press flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Download
            </button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div
        className={`relative flex-1 ${isDragOver ? "" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!readOnly) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={readOnly ? undefined : handleDrop}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-b-xl" style={{ border: "2px dashed var(--accent)", background: "rgba(139,92,246,0.08)" }}>
            <div className="text-center">
              <svg className="mx-auto mb-2 animate-float" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              <p className="text-[13px] font-bold" style={{ color: "var(--accent)" }}>Drop workflow file</p>
            </div>
          </div>
        )}

        {/* Empty state — Source */}
        {!value && !readOnly && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
            <div className="rounded-2xl p-5 border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
                <path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Drop Definition File</p>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Paste raw JSON or drop a configuration file to<br />begin translation.
              </p>
            </div>
            {/* Format tags */}
            <div className="flex items-center gap-2 mt-1">
              {["ASL", "ARM", "YAML"].map((tag) => (
                <span key={tag} className="rounded-md px-3 py-1 text-[10px] font-bold font-mono tracking-widest" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                  {tag}
                </span>
              ))}
            </div>
            {onSmartUpload && (
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Or use{" "}
                <button onClick={onSmartUpload} className="underline decoration-[var(--accent)]/40 underline-offset-2 pointer-events-auto transition-colors hover:text-[var(--accent)]" style={{ color: "var(--text-accent)" }}>
                  Smart Upload
                </button>
                {" "}for images & docs
              </p>
            )}
          </div>
        )}

        {/* Empty state — Output */}
        {!value && readOnly && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
            <div className="rounded-2xl p-5 border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2">
                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[14px] font-bold font-mono tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>Translation Pending</p>
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                Optimized target configuration will generate<br />here automatically.
              </p>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--text-muted)", opacity: 0.4 }} />
              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)", opacity: 0.5 }}>Awaiting Input</span>
            </div>
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
          className={`scrollbar-thin h-full w-full resize-none p-5 text-[12.5px] leading-7 outline-none font-mono-code ${!value ? "opacity-0" : ""}`}
          style={{ minHeight: "320px", background: "var(--editor-bg)", color: "var(--editor-text)", fontFamily: "var(--font-jetbrains), monospace" }}
        />
      </div>
    </div>
  );
}

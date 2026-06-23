"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useEditorHistory } from "@/hooks/useEditorHistory";

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

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
  const lineNumbersRef = useRef<HTMLDivElement>(null);
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
    copyToClipboard(value); setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([value], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "migrated-workflow.json";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    } catch {
      const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(value);
      window.open(dataUri, "_blank");
    }
  }, [value]);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const lineCount = value ? value.split("\n").length : 0;

  const badgeColors = {
    aws: { bg: "var(--aws-bg)", text: "var(--aws-color)", border: "rgba(255,153,0,0.15)" },
    azure: { bg: "var(--azure-bg)", text: "var(--azure-color)", border: "rgba(56,189,248,0.15)" },
    neutral: { bg: "var(--accent-bg)", text: "var(--text-muted)", border: "var(--border-subtle)" },
  };

  return (
    <div className="card-premium flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-[10px] w-[10px] rounded-full" style={{ background: readOnly ? "rgba(52, 211, 153, 0.6)" : "rgba(251, 191, 36, 0.6)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{label}</span>
          </div>
          {badge && (
            <span className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: badgeColors[badge.variant].bg, color: badgeColors[badge.variant].text, border: `1px solid ${badgeColors[badge.variant].border}` }}>
              {badge.text}
            </span>
          )}
          {showEditBadge && (
            <span className="rounded-md px-2 py-0.5 text-[9px] font-bold animate-fadeIn" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.15)" }}>
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(canUndo || canRedo) && (
            <div className="flex items-center gap-0.5 mr-1">
              <button onClick={handleUndo} disabled={!canUndo} className="btn-press rounded-md p-1.5 transition-all hover:bg-[var(--hover-bg)] disabled:opacity-20" style={{ color: "var(--text-muted)" }} title="Undo (Ctrl+Z)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </button>
              <button onClick={handleRedo} disabled={!canRedo} className="btn-press rounded-md p-1.5 transition-all hover:bg-[var(--hover-bg)] disabled:opacity-20" style={{ color: "var(--text-muted)" }} title="Redo (Ctrl+Shift+Z)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>
              </button>
            </div>
          )}

          {value && <span className="mr-2 text-[10px] font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>{lineCount} lines</span>}

          {!readOnly && onSmartUpload && (
            <button onClick={onSmartUpload} className="btn-press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              Smart Upload
            </button>
          )}
          {!readOnly && onSmartUpload && (
            <label className="btn-press cursor-pointer flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              Upload
              <input type="file" accept=".json,.txt" className="hidden" onChange={handleFileSelect} />
            </label>
          )}
          {value && (
            <button onClick={handleCopy} className="btn-press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all hover:bg-[var(--hover-bg)]" style={{ color: copied ? "var(--success)" : "var(--text-muted)", border: `1px solid ${copied ? "rgba(52,211,153,0.2)" : "var(--border-subtle)"}` }}>
              {copied ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12" /></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          {onExportIaC && value && (
            <button onClick={onExportIaC} className="btn-press rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--success)", border: "1px solid rgba(52,211,153,0.15)" }}>
              Export IaC
            </button>
          )}
          {(readOnly || showDownload) && value && (
            <button onClick={handleDownload} className="btn-press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
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
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl" style={{ background: "rgba(99,102,241,0.06)", border: "2px dashed var(--accent)" }}>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>Drop workflow file</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>JSON or text files supported</p>
            </div>
          </div>
        )}

        {!value && onSmartUpload && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="rounded-2xl p-4" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Paste workflow JSON or drop a file</p>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>AWS Step Functions (ASL) &amp; Azure Logic Apps (WDL)</p>
            </div>
            <button onClick={onSmartUpload} className="pointer-events-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--accent)", border: "1px solid var(--border-primary)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              Smart Upload from image
            </button>
          </div>
        )}

        {!value && !onSmartUpload && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="rounded-2xl p-4" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="m5 12 7 7 7-7"/><path d="m5 5 7 7 7-7"/></svg>
            </div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>Migrated output appears here</p>
          </div>
        )}

        <div className="flex h-full">
          {/* Line numbers */}
          {value && (
            <div
              ref={lineNumbersRef}
              className="select-none overflow-hidden shrink-0 pt-5 pb-5 text-right"
              style={{
                background: "var(--editor-bg)",
                color: "var(--text-muted)",
                fontSize: "13px",
                lineHeight: "28px",
                fontFamily: "var(--font-jetbrains), 'Fira Code', monospace",
                width: "48px",
                opacity: 0.4,
                borderRight: "1px solid var(--border-subtle)",
                paddingRight: "8px",
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1}>{i + 1}</div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={!readOnly ? handleKeyDown : undefined}
            onScroll={handleScroll}
            readOnly={readOnly}
            spellCheck={false}
            aria-label={label}
            aria-readonly={readOnly}
            className={`scrollbar-thin h-full w-full resize-none p-5 font-mono text-[13px] leading-7 outline-none ${!value ? "opacity-0" : ""}`}
            style={{ minHeight: "320px", background: "var(--editor-bg)", color: "var(--editor-text)", paddingLeft: value ? "16px" : "20px" }}
          />
        </div>
      </div>
    </div>
  );
}

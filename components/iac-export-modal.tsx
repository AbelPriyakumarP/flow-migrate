"use client";

import { useState, useCallback } from "react";
import type { IaCFormat } from "@/lib/prompts-iac";

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

interface IaCExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

export default function IaCExportModal({
  isOpen,
  onClose,
  outputCode,
  direction,
}: IaCExportModalProps) {
  const defaultFormat: IaCFormat = direction === "aws-to-azure" ? "terraform" : "cloudformation";
  const [format, setFormat] = useState<IaCFormat>(defaultFormat);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setContent("");

    try {
      const res = await fetch("/api/export-iac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowJson: outputCode,
          direction,
          format,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Export failed");
        return;
      }

      setContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [outputCode, direction, format]);

  const handleCopy = useCallback(() => {
    copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleDownload = useCallback(() => {
    const filename = format === "terraform" ? "main.tf" : "template.json";
    const mimeType = format === "terraform" ? "text/plain" : "application/json";
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, format]);

  const handleClose = useCallback(() => {
    setContent("");
    setError("");
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div
        className="relative w-full max-w-2xl animate-scaleIn overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--card)", borderColor: "var(--card-border)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Export as Infrastructure as Code"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--card-border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <polyline points="16,18 22,12 16,6"/>
                <polyline points="8,6 2,12 8,18"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--foreground)" }}>Export as IaC</h2>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                Generate Infrastructure as Code from your migrated workflow
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

        {/* Format Selector */}
        <div className="flex items-center gap-3 border-b px-6 py-3" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)" }}>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Format:</span>
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--card-border)" }}>
            <button
              onClick={() => { setFormat("terraform"); setContent(""); setError(""); }}
              className={`px-4 py-2 text-[12px] font-bold transition-colors ${format === "terraform" ? "text-white" : ""}`}
              style={format === "terraform" ? { background: "var(--primary)" } : { background: "var(--card)", color: "var(--muted)" }}
            >
              Terraform (HCL)
            </button>
            <button
              onClick={() => { setFormat("cloudformation"); setContent(""); setError(""); }}
              className={`px-4 py-2 text-[12px] font-bold transition-colors ${format === "cloudformation" ? "text-white" : ""}`}
              style={format === "cloudformation" ? { background: "var(--primary)" } : { background: "var(--card)", color: "var(--muted)" }}
            >
              CloudFormation
            </button>
          </div>
          {!content && !isLoading && (
            <button
              onClick={handleGenerate}
              className="btn-press ml-auto rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-[12px] font-bold text-white shadow-sm transition-all hover:shadow-md"
            >
              Generate
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="p-6">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" />
              <p className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                Generating {format === "terraform" ? "Terraform HCL" : "CloudFormation template"}...
              </p>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>This may take a few seconds</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3">
              <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
              <div>
                <p className="text-[12px] font-semibold text-red-700">{error}</p>
                <button
                  onClick={handleGenerate}
                  className="mt-2 text-[11px] font-bold text-red-600 underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {content && (
            <div className="space-y-3">
              {/* Code Preview */}
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--card-border)" }}>
                <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)" }}>
                  <span className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>
                    {format === "terraform" ? "main.tf" : "template.json"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleGenerate}
                      className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors"
                      style={{ color: "var(--primary)" }}
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
                <pre
                  className="max-h-[350px] overflow-auto scrollbar-thin p-4 font-mono text-[12px] leading-6"
                  style={{ background: "var(--editor-bg)", color: "var(--editor-text)" }}
                >
                  {content}
                </pre>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleCopy}
                  className="btn-press rounded-lg border px-4 py-2 text-[11px] font-semibold shadow-sm transition-all hover:shadow-md"
                  style={{ borderColor: "var(--card-border)", background: "var(--card)", color: "var(--muted)" }}
                >
                  {copied ? (
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                      Copied
                    </span>
                  ) : "Copy"}
                </button>
                <button
                  onClick={handleDownload}
                  className="btn-press flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-[11px] font-bold text-white shadow-sm transition-all hover:shadow-md"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" x2="12" y1="15" y2="3"/>
                  </svg>
                  Download
                </button>
              </div>
            </div>
          )}

          {!content && !isLoading && !error && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-2xl p-4" style={{ background: "var(--subtle-bg)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round">
                  <polyline points="16,18 22,12 16,6"/>
                  <polyline points="8,6 2,12 8,18"/>
                </svg>
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--muted)" }}>
                Select a format and click Generate
              </p>
              <p className="text-[11px]" style={{ color: "var(--muted)", opacity: 0.7 }}>
                {format === "terraform"
                  ? "Generates HCL with provider, resource group, and workflow resource"
                  : "Generates CloudFormation JSON with IAM role and state machine resource"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

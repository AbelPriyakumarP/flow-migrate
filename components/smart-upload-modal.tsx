"use client";

import { useState, useCallback, useRef } from "react";

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (code: string) => void;
}

type TabType = "image" | "document";

function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const data = result.split(",")[1];
      resolve({ mimeType: file.type, data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SmartUploadModal({
  isOpen,
  onClose,
  onGenerated,
}: SmartUploadModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("image");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Document state
  const [docFile, setDocFile] = useState<File | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setDocFile(null);
    setError("");
    setStatusMessage("");
    setIsLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Image Handling ──

  const handleImageSelect = useCallback((file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setError("Please upload a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Image too large. Maximum 20MB.");
      return;
    }
    setImageFile(file);
    setError("");

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleImageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleImageSelect(file);
    },
    [handleImageSelect]
  );

  const handleImageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageSelect(file);
    },
    [handleImageSelect]
  );

  const analyzeImage = useCallback(async () => {
    if (!imageFile) return;
    setIsLoading(true);
    setError("");
    setStatusMessage("Sending image to AI for analysis...");

    try {
      const { mimeType, data } = await fileToBase64(imageFile);

      setStatusMessage("AI is analyzing the workflow diagram...");

      const res = await fetch("/api/generate-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType, imageData: data }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Image analysis failed");
        setStatusMessage("");
        return;
      }

      setStatusMessage(
        `Detected: ${result.detectedLabel || result.detectedPlatform}. Loading code...`
      );

      setTimeout(() => {
        onGenerated(result.generatedCode);
        reset();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatusMessage("");
    } finally {
      setIsLoading(false);
    }
  }, [imageFile, onGenerated, reset]);

  // ── Document Handling ──

  const handleDocSelect = useCallback((file: File) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    if (!allowed.includes(file.type)) {
      setError("Please upload a PDF, DOCX, TXT, or MD file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("File too large. Maximum 25MB.");
      return;
    }
    setDocFile(file);
    setError("");
  }, []);

  const handleDocDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleDocSelect(file);
    },
    [handleDocSelect]
  );

  const handleDocInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleDocSelect(file);
    },
    [handleDocSelect]
  );

  const analyzeDocument = useCallback(async () => {
    if (!docFile) return;
    setIsLoading(true);
    setError("");
    setStatusMessage("Extracting text from document...");

    try {
      const { mimeType, data } = await fileToBase64(docFile);

      setStatusMessage("AI is reading and understanding your document...");

      const res = await fetch("/api/generate-from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mimeType,
          fileData: data,
          fileName: docFile.name,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Document analysis failed");
        setStatusMessage("");
        return;
      }

      setStatusMessage(
        `Detected: ${result.detectedLabel || result.detectedPlatform}. Loading code...`
      );

      setTimeout(() => {
        onGenerated(result.generatedCode);
        reset();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatusMessage("");
    } finally {
      setIsLoading(false);
    }
  }, [docFile, onGenerated, reset]);

  if (!isOpen) return null;

  const docExtension = docFile
    ? docFile.name.split(".").pop()?.toUpperCase() || "FILE"
    : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white">
                Smart Upload
              </h2>
              <p className="text-[11px] text-white/70">
                AI-powered workflow understanding
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--card-border)]">
          <button
            onClick={() => {
              setActiveTab("image");
              setError("");
            }}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-[13px] font-semibold transition-colors ${
              activeTab === "image"
                ? "border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Visual Flow (Image)
          </button>
          <button
            onClick={() => {
              setActiveTab("document");
              setError("");
            }}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-[13px] font-semibold transition-colors ${
              activeTab === "document"
                ? "border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
            </svg>
            Document Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* ── Image Tab ── */}
          {activeTab === "image" && (
            <div className="space-y-4">
              <p className="text-[12px] text-slate-500">
                Upload a screenshot of your workflow from the AWS Step Functions
                console or Azure Logic Apps designer. The AI will analyze the
                visual diagram and generate the corresponding JSON code.
              </p>

              {!imageFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleImageDrop}
                  onClick={() => imageInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-10 transition-colors hover:border-indigo-400 hover:bg-indigo-50/30"
                >
                  <div className="rounded-full bg-indigo-100 p-3">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgb(99,102,241)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-slate-700">
                      Drop workflow screenshot here
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      PNG, JPEG, WEBP, or GIF — max 20MB
                    </p>
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageInputChange}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-slate-50">
                    {imagePreview && (
                      <img
                        src={imagePreview}
                        alt="Workflow screenshot"
                        className="h-48 w-full object-contain bg-white"
                      />
                    )}
                    <div className="flex items-center justify-between border-t border-[var(--card-border)] px-4 py-2">
                      <div className="flex items-center gap-2">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgb(99,102,241)"
                          strokeWidth="2"
                        >
                          <rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                          />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span className="text-[12px] font-medium text-slate-700">
                          {imageFile.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({(imageFile.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                        className="text-[11px] font-medium text-slate-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {imageFile && (
                <button
                  onClick={analyzeImage}
                  disabled={isLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-[13px] font-bold text-white shadow-lg transition-all hover:from-indigo-700 hover:to-violet-700 hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Analyzing Visual Flow...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" />
                        <circle cx="12" cy="10" r="2" />
                      </svg>
                      Analyze &amp; Generate Code
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* ── Document Tab ── */}
          {activeTab === "document" && (
            <div className="space-y-4">
              <p className="text-[12px] text-slate-500">
                Upload a document describing your workflow. The AI will read and
                understand the content, then generate the corresponding workflow
                JSON definition.
              </p>

              {!docFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDocDrop}
                  onClick={() => docInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-10 transition-colors hover:border-violet-400 hover:bg-violet-50/30"
                >
                  <div className="rounded-full bg-violet-100 p-3">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgb(139,92,246)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14,2 14,8 20,8" />
                      <line x1="16" x2="8" y1="13" y2="13" />
                      <line x1="16" x2="8" y1="17" y2="17" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-slate-700">
                      Drop your document here
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      PDF, DOCX, TXT, or Markdown — max 25MB
                    </p>
                  </div>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                    className="hidden"
                    onChange={handleDocInputChange}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--card-border)] bg-slate-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                        docExtension === "PDF"
                          ? "bg-red-100"
                          : docExtension === "DOCX"
                            ? "bg-blue-100"
                            : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold ${
                          docExtension === "PDF"
                            ? "text-red-600"
                            : docExtension === "DOCX"
                              ? "text-blue-600"
                              : "text-slate-600"
                        }`}
                      >
                        {docExtension}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-slate-700">
                        {docFile.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {(docFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setDocFile(null)}
                      className="text-[11px] font-medium text-slate-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {docFile && (
                <button
                  onClick={analyzeDocument}
                  disabled={isLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-3 text-[13px] font-bold text-white shadow-lg transition-all hover:from-violet-700 hover:to-purple-700 hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Reading Document...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" />
                        <circle cx="12" cy="10" r="2" />
                      </svg>
                      Read &amp; Generate Code
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              <span className="text-[12px] font-medium text-indigo-700">
                {statusMessage}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-2.5">
              <p className="text-[12px] font-medium text-red-700">{error}</p>
            </div>
          )}

          {/* Help Text */}
          <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5">
              {activeTab === "image" ? "Tips for best results:" : "What works best:"}
            </p>
            {activeTab === "image" ? (
              <ul className="space-y-1 text-[11px] text-slate-500">
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  Capture the full workflow diagram — don&apos;t crop out any steps
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  Ensure state/action names are readable in the screenshot
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  Works with AWS Console &amp; Azure Portal workflow designers
                </li>
              </ul>
            ) : (
              <ul className="space-y-1 text-[11px] text-slate-500">
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  Documents describing workflow steps, conditions, and integrations
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  Architecture docs, requirements specs, or workflow descriptions
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                  Mention AWS or Azure services for more accurate generation
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
